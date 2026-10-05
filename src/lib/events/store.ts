import {
	arrayUnion,
	collection,
	doc,
	getDoc,
	getDocs,
	limit,
	onSnapshot,
	orderBy,
	query,
	runTransaction,
	setDoc,
	where,
	writeBatch,
	type Firestore
} from 'firebase/firestore';
import type { SessionUser } from '$lib/firebase/user';
import type { W2MEvent } from '$lib/types';
import {
	importDocs,
	MAX_SLOTS,
	NativeEventNotFound,
	responseKey,
	InvalidInput,
	MAX_RESPONSES,
	parseName,
	parsePassword,
	parseResponse,
	PasswordRequired,
	toEvent,
	type EventDoc,
	type EventSummary,
	type NewEvent,
	type ResponseDoc,
	WrongPassword
} from './model';
import { deriveSecret, newNonce, newSalt, proofFor } from './password';

/*
 * ThenToMeet's events in Firestore, through the web SDK. These run in the browser as the signed-in
 * user (firestore.rules decide what's allowed) and on the server for link previews, which only
 * read. Pass the `Firestore` from `$lib/firebase/client`.
 */

/** Firestore writes at most 500 documents per batch. */
const BATCH = 400;
/** How many more times to try a join that the rules refuse, in case it only lost a race. */
const JOIN_RETRIES = 5;

const eventRef = (db: Firestore, id: string) => doc(db, 'events', id);
const responsesOf = (db: Firestore, id: string) => collection(db, 'events', id, 'responses');

/**
 * The ID of the copy of a When2Meet poll that `uid` imports. It comes from the two together, so
 * importing the same poll again finds the first copy instead of making another. It has the shape
 * of any other ThenToMeet event ID: 20 letters and digits.
 */
export const importedEventId = async (uid: string, w2mId: string): Promise<string> => {
	const bytes = new TextEncoder().encode(`${uid}\n${w2mId}`);
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(hash, (b) => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 20);
};

/** A ThenToMeet event and everyone's responses, ready for the app to use. */
export const loadNativeEvent = async (db: Firestore, id: string): Promise<W2MEvent> => {
	const [snap, responses] = await Promise.all([
		getDoc(eventRef(db, id)),
		getDocs(responsesOf(db, id))
	]);
	if (!snap.exists()) throw new NativeEventNotFound();
	return toEvent(
		id,
		snap.data() as EventDoc,
		responses.docs.map((d) => d.data() as ResponseDoc)
	);
};

/**
 * Follows a ThenToMeet event as it changes: calls `onEvent` with the event and everyone's
 * responses now, and again whenever either changes (including by this browser's own writes, which
 * show up at once). Returns a function that stops listening. An event that isn't there, or can't
 * be read, goes to `onError`, after which nothing more arrives.
 */
export const watchNativeEvent = (
	db: Firestore,
	id: string,
	onEvent: (event: W2MEvent) => void,
	onError: (error: Error) => void
): (() => void) => {
	let event: EventDoc | null | undefined;
	let responses: ResponseDoc[] | undefined;
	let scheduled = false;
	let stopped = false;

	// The event and its responses are separate listeners, and one write usually changes both in the
	// same breath, so wait for the breath to finish and report once.
	const schedule = () => {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			if (stopped || event === undefined || responses === undefined) return;
			if (event === null) {
				stopped = true;
				onError(new NativeEventNotFound());
				return;
			}
			onEvent(toEvent(id, event, responses));
		});
	};

	const fail = (e: Error) => {
		if (stopped) return;
		stopped = true;
		onError(e);
	};

	// The first snapshot of each listener has to come from the server: this browser's cache may
	// hold only a few of the event's documents (its own response, say), and the first snapshot is
	// what the app opens the event with. After that, local changes are reported as they happen.
	let eventSynced = false;
	let responsesSynced = false;
	const stopEvent = onSnapshot(
		eventRef(db, id),
		(snap) => {
			if (!eventSynced && snap.metadata?.fromCache) return;
			eventSynced = true;
			event = snap.exists() ? (snap.data() as EventDoc) : null;
			schedule();
		},
		fail
	);
	const stopResponses = onSnapshot(
		responsesOf(db, id),
		(snap) => {
			if (!responsesSynced && snap.metadata?.fromCache) return;
			responsesSynced = true;
			responses = snap.docs.map((d) => d.data() as ResponseDoc);
			schedule();
		},
		fail
	);
	return () => {
		stopped = true;
		stopEvent();
		stopResponses();
	};
};

export const createEvent = async (
	db: Firestore,
	user: SessionUser,
	input: NewEvent
): Promise<string> => {
	const ref = doc(collection(db, 'events'));
	const now = Date.now();
	const event: EventDoc = {
		ownerId: user.uid,
		...input,
		nextPersonId: 1,
		responseCount: 0,
		memberUids: [user.uid],
		source: { type: 'thentomeet' },
		createdAt: now,
		updatedAt: now
	};
	await setDoc(ref, event);
	return ref.id;
};

/**
 * Copies a When2Meet poll into the user's account, with every person's times and ID as they were.
 * It's a snapshot: the poll on When2Meet is left alone and the copy stands on its own.
 */
export const importWhen2Meet = async (
	db: Firestore,
	user: SessionUser,
	poll: W2MEvent
): Promise<{ id: string; created: boolean }> => {
	if (poll.slots.length > MAX_SLOTS) {
		throw new Error('That poll has more times than ThenToMeet can hold.');
	}
	const id = await importedEventId(user.uid, poll.id);
	const ref = eventRef(db, id);
	if ((await getDoc(ref)).exists()) return { id, created: false };

	const { event, responses } = importDocs(poll, user.uid);
	// The event goes in the first batch with the first responses; the rules let the owner write
	// responses to an event that is created in the same batch.
	for (let i = 0; i < Math.max(responses.length, 1); i += BATCH) {
		const batch = writeBatch(db);
		if (i === 0) batch.set(ref, event);
		for (const { id: responseId, doc: response } of responses.slice(i, i + BATCH)) {
			batch.set(doc(responsesOf(db, id), responseId), response);
		}
		await batch.commit();
	}
	return { id, created: true };
};

/**
 * Sets someone's times for an event, adding them if the name is new. As on When2Meet, anyone with
 * the link can do this, signed in or not, and a name that's already there is that person: whoever
 * enters it edits their times. Signed in, the response is also tied to the account, which is what
 * puts the event in "your events".
 *
 * `body` is `{ name, available, password? }`, checked against the event's own slots. A password
 * given for a new name locks that entry (see ./password.ts); after that, changing it takes the
 * password, or `PasswordRequired` / `WrongPassword` is thrown.
 */
export const submitResponse = async (
	db: Firestore,
	user: SessionUser | null,
	eventId: string,
	body: unknown
): Promise<{ personId: number }> => {
	const ref = eventRef(db, eventId);
	// The name picks the response, so it's read before the transaction.
	const key = responseKey(parseName(body));
	const password = parsePassword(body);
	const mine = doc(responsesOf(db, eventId), key);
	const secretRef = doc(db, 'events', eventId, 'secrets', key);
	let locked = false;
	for (let tries = 0; ; tries++) {
		locked = false;
		try {
			return await runTransaction(db, async (tx) => {
				const [snap, existing] = await Promise.all([tx.get(ref), tx.get(mine)]);
				if (!snap.exists()) throw new NativeEventNotFound();
				const event = snap.data() as EventDoc;
				const { name, available } = parseResponse(body, event.slots);
				const now = Date.now();

				if (existing.exists()) {
					const prior = existing.data() as ResponseDoc;
					locked = prior.salt !== undefined;
					const change: Partial<ResponseDoc> = { name, available, updatedAt: now };
					if (prior.salt !== undefined) {
						if (password === null) throw new PasswordRequired();
						const secret = await deriveSecret(password, prior.salt);
						change.nonce = newNonce();
						change.proof = await proofFor(secret, prior.nonce ?? '', change.nonce);
					} else if (password !== null) {
						throw new InvalidInput("That name has no password, and one can't be added now.");
					}
					// A signed-in user entering a name nobody has claimed yet (like an imported person's)
					// claims it.
					const claims = user !== null && prior.uid === null;
					if (claims) change.uid = user.uid;
					tx.update(mine, change);
					tx.update(ref, {
						updatedAt: now,
						...(claims ? { memberUids: arrayUnion(user.uid) } : {})
					});
					return { personId: prior.personId };
				}

				if (event.responseCount >= MAX_RESPONSES && event.ownerId !== user?.uid) {
					throw new InvalidInput(
						`This event is full: it holds up to ${MAX_RESPONSES} people. Ask its owner to make room.`
					);
				}
				const response: ResponseDoc = {
					personId: event.nextPersonId,
					name,
					uid: user?.uid ?? null,
					available,
					updatedAt: now
				};
				if (password !== null) {
					response.salt = newSalt();
					response.nonce = newNonce();
					tx.set(secretRef, { secret: await deriveSecret(password, response.salt) });
				}
				tx.set(mine, response);
				tx.update(ref, {
					nextPersonId: event.nextPersonId + 1,
					responseCount: event.responseCount + 1,
					updatedAt: now,
					lastJoin: key,
					...(user ? { memberUids: arrayUnion(user.uid) } : {})
				});
				return { personId: response.personId };
			});
		} catch (e) {
			const denied = (e as { code?: string }).code === 'permission-denied';
			// The rules turn a proof that doesn't match down as a plain denial.
			if (locked && denied) throw new WrongPassword();
			// People joining at the same moment can leave one holding a person ID that was just taken,
			// which the rules refuse instead of retrying. Trying again reads the new one.
			if (denied && tries < JOIN_RETRIES) {
				await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 120));
				continue;
			}
			throw e;
		}
	}
};

/**
 * Which of these events are definitely gone. An event that couldn't be checked (offline, say) is
 * left out, so a bad connection never wipes anyone's list.
 */
export const findMissingEvents = async (db: Firestore, ids: string[]): Promise<string[]> => {
	const gone = await Promise.all(
		ids.map(async (id) => {
			try {
				return (await getDoc(eventRef(db, id))).exists() ? null : id;
			} catch {
				return null;
			}
		})
	);
	return gone.filter((id): id is string => id !== null);
};

/** Events the user owns or has responded to, most recently active first. */
export const listEventsFor = async (db: Firestore, uid: string): Promise<EventSummary[]> => {
	const found = await getDocs(
		query(
			collection(db, 'events'),
			where('memberUids', 'array-contains', uid),
			orderBy('updatedAt', 'desc'),
			limit(50)
		)
	);
	return found.docs.map((d) => {
		const event = d.data() as EventDoc;
		const summary: EventSummary = {
			id: d.id,
			title: event.title,
			responseCount: event.responseCount,
			updatedAt: event.updatedAt,
			owned: event.ownerId === uid
		};
		if (event.source.type === 'when2meet') summary.importedFrom = event.source.id;
		return summary;
	});
};
