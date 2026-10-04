import {
	arrayRemove,
	collection,
	deleteDoc,
	deleteField,
	doc,
	getDoc,
	getDocs,
	limit,
	query,
	runTransaction,
	where,
	writeBatch,
	type Firestore
} from 'firebase/firestore';
import {
	InvalidInput,
	NativeEventNotFound,
	PasswordRequired,
	responseKey,
	WrongPassword,
	type EventDoc,
	type ResponseDoc
} from './model';
import { deriveSecret, MAX_PASSWORD, newNonce, newSalt, proofFor, REMOVE } from './password';

/*
 * What an event's owner can do beyond the everyday (see store.ts), and what a person with a
 * password can do to it: change or remove it. All of it is enforced by firestore.rules; these
 * just do the writes the rules expect, in the order and groupings they need.
 */

/** Firestore writes at most 500 documents per batch. */
const BATCH = 400;

const eventRef = (db: Firestore, id: string) => doc(db, 'events', id);
const responseRef = (db: Firestore, id: string, key: string) =>
	doc(db, 'events', id, 'responses', key);
const secretRef = (db: Firestore, id: string, key: string) => doc(db, 'events', id, 'secrets', key);

/**
 * Deletes an event and everything under it, for its owner. Responses and their secrets go first,
 * since the rules only let an owner delete them while the event still exists.
 */
export const deleteEvent = async (db: Firestore, eventId: string): Promise<void> => {
	const responses = await getDocs(collection(db, 'events', eventId, 'responses'));
	// Secrets can't be listed, so each goes by its response's name; deleting one that isn't there
	// does nothing.
	const refs = responses.docs.flatMap((d) => [d.ref, secretRef(db, eventId, d.id)]);
	for (let i = 0; i < refs.length; i += BATCH) {
		const batch = writeBatch(db);
		for (const ref of refs.slice(i, i + BATCH)) batch.delete(ref);
		await batch.commit();
	}
	await deleteDoc(eventRef(db, eventId));
};

/**
 * Removes one person's entry, and its password if it has one, for the event's owner. The event's
 * count goes down, and so does its member list if that was the account's only entry. Person IDs
 * aren't reused. Returns whether there was an entry to remove.
 */
export const deleteEntry = async (
	db: Firestore,
	eventId: string,
	name: string
): Promise<boolean> => {
	const key = responseKey(name);
	const [eventSnap, entry] = await Promise.all([
		getDoc(eventRef(db, eventId)),
		getDoc(responseRef(db, eventId, key))
	]);
	if (!eventSnap.exists()) throw new NativeEventNotFound();
	if (!entry.exists()) return false;
	const event = eventSnap.data() as EventDoc;
	const { uid } = entry.data() as ResponseDoc;

	// An account stays a member while it has another entry, and the owner always is one.
	let dropMember = false;
	if (uid && uid !== event.ownerId) {
		const others = await getDocs(
			query(collection(db, 'events', eventId, 'responses'), where('uid', '==', uid), limit(2))
		);
		dropMember = others.docs.every((d) => d.id === key);
	}

	const batch = writeBatch(db);
	batch.delete(entry.ref);
	batch.delete(secretRef(db, eventId, key));
	batch.update(eventRef(db, eventId), {
		responseCount: Math.max(0, event.responseCount - 1),
		updatedAt: Date.now(),
		...(dropMember ? { memberUids: arrayRemove(uid) } : {})
	});
	await batch.commit();
	return true;
};

const checkNewPassword = (password: string) => {
	if (!password) throw new InvalidInput('Enter a new password.');
	if (password.length > MAX_PASSWORD) {
		throw new InvalidInput(`Passwords can be up to ${MAX_PASSWORD} characters.`);
	}
};

/**
 * Runs a change to a locked entry that needs its current password. The transaction re-reads the
 * entry if someone changed it meanwhile; a refusal from the rules is a wrong password.
 */
const withPassword = async (
	db: Firestore,
	eventId: string,
	name: string,
	current: string | null,
	change: (
		tx: Parameters<Parameters<typeof runTransaction>[1]>[0],
		entry: ResponseDoc & { salt: string; nonce: string },
		secret: string
	) => Promise<void>
): Promise<void> => {
	const key = responseKey(name);
	let locked = false;
	try {
		await runTransaction(db, async (tx) => {
			const snap = await tx.get(responseRef(db, eventId, key));
			if (!snap.exists()) throw new InvalidInput('There is no one by that name in this event.');
			const entry = snap.data() as ResponseDoc;
			if (entry.salt === undefined || entry.nonce === undefined) {
				throw new InvalidInput('That name has no password.');
			}
			locked = true;
			if (!current) throw new PasswordRequired();
			const secret = await deriveSecret(current, entry.salt);
			await change(tx, entry as ResponseDoc & { salt: string; nonce: string }, secret);
		});
	} catch (e) {
		if (locked && (e as { code?: string }).code === 'permission-denied') throw new WrongPassword();
		throw e;
	}
};

/**
 * Gives a locked entry a new password, which takes the current one: the entry gets a fresh salt
 * and nonce with a proof from the old password, and the secret is swapped in the same write.
 */
export const changePassword = async (
	db: Firestore,
	eventId: string,
	name: string,
	current: string,
	next: string
): Promise<void> => {
	checkNewPassword(next);
	return withPassword(db, eventId, name, current, async (tx, entry, secret) => {
		const salt = newSalt();
		const nonce = newNonce();
		tx.update(responseRef(db, eventId, responseKey(name)), {
			salt,
			nonce,
			proof: await proofFor(secret, entry.nonce, nonce),
			updatedAt: Date.now()
		});
		tx.update(secretRef(db, eventId, responseKey(name)), {
			secret: await deriveSecret(next, salt)
		});
	});
};

/**
 * Takes the password off an entry, which takes the current one: the entry drops its salt and nonce
 * and keeps a proof of the removal, and the secret is deleted in the same write. After this, like
 * any entry without a password, it can't be given one again.
 */
export const removePassword = (
	db: Firestore,
	eventId: string,
	name: string,
	current: string
): Promise<void> =>
	withPassword(db, eventId, name, current, async (tx, entry, secret) => {
		const key = responseKey(name);
		tx.update(responseRef(db, eventId, key), {
			salt: deleteField(),
			nonce: deleteField(),
			proof: await proofFor(secret, entry.nonce, REMOVE),
			updatedAt: Date.now()
		});
		tx.delete(secretRef(db, eventId, key));
	});
