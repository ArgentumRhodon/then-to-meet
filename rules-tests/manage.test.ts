import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	writeBatch
} from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
	addPassword,
	changePassword,
	deleteEntry,
	deleteEvent,
	removePassword,
	setAdmin
} from '$lib/events/manage';
import { InvalidInput, PasswordRequired, responseKey, WrongPassword } from '$lib/events/model';
import { deriveSecret, newNonce, newSalt, proofFor, REMOVE } from '$lib/events/password';
import { createEvent, loadNativeEvent, submitResponse } from '$lib/events/store';
import {
	client,
	closeClients,
	denied,
	pollOf,
	resetFirestore,
	SLOTS,
	type Client
} from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

const newEvent = { title: 'Lunch', weekly: false, slotSeconds: 900, slots: SLOTS };

const owned = async () => {
	const owner = await client();
	const id = await createEvent(owner.db, owner.user!, newEvent);
	return { owner, id };
};

const join = async (id: string, name: string, extra: object = {}, who?: Client) => {
	const c = who ?? (await client(false));
	await submitResponse(c.db, c.user, id, { name, available: [SLOTS[0]], ...extra });
	return c;
};

const refs = (c: Client, id: string, name = 'Ada') => ({
	response: doc(c.db, 'events', id, 'responses', responseKey(name)),
	secret: doc(c.db, 'events', id, 'secrets', responseKey(name))
});

const eventData = async (c: Client, id: string) => (await getDoc(doc(c.db, 'events', id))).data()!;

describe('deleting an event', () => {
	it('removes the event, every response, and the passwords', async () => {
		const { owner, id } = await owned();
		await join(id, 'Ada', { password: 'pw' });
		await join(id, 'Bo');
		await deleteEvent(owner.db, id);

		expect((await getDoc(doc(owner.db, 'events', id))).exists()).toBe(false);
		expect((await getDocs(collection(owner.db, 'events', id, 'responses'))).size).toBe(0);
		await expect(loadNativeEvent(owner.db, id)).rejects.toThrow(/No ThenToMeet event/);
	});

	it('is for the owner only, and leaves everything if refused', async () => {
		const { id } = await owned();
		await join(id, 'Ada');
		const stranger = await client();
		const visitor = await client(false);
		expect(await denied(deleteEvent(stranger.db, id))).toBe(true);
		expect(await denied(deleteEvent(visitor.db, id))).toBe(true);
		expect((await getDocs(collection(stranger.db, 'events', id, 'responses'))).size).toBe(1);
		expect((await getDoc(doc(stranger.db, 'events', id))).exists()).toBe(true);
	});

	it('copes with an event that has more responses than fit in one batch', async () => {
		const { owner, id } = await owned();
		const total = 450;
		for (let start = 0; start < total; start += 200) {
			const batch = writeBatch(owner.db);
			for (let i = start; i < Math.min(start + 200, total); i++) {
				batch.set(doc(owner.db, 'events', id, 'responses', responseKey(`P${i}`)), {
					personId: i + 1,
					name: `P${i}`,
					uid: null,
					available: [],
					updatedAt: 1
				});
			}
			await batch.commit();
		}
		expect((await getDocs(collection(owner.db, 'events', id, 'responses'))).size).toBe(total);

		await deleteEvent(owner.db, id);
		expect((await getDoc(doc(owner.db, 'events', id))).exists()).toBe(false);
		expect((await getDocs(collection(owner.db, 'events', id, 'responses'))).size).toBe(0);
	});

	it('takes the event off its members’ lists', async () => {
		const { owner, id } = await owned();
		await deleteEvent(owner.db, id);
		expect((await getDoc(doc(owner.db, 'events', id))).exists()).toBe(false);
	});
});

describe('removing one person’s entry', () => {
	it('deletes it, and its password, and lets the name be used again', async () => {
		const { owner, id } = await owned();
		await join(id, 'Ada', { password: 'pw' });
		expect(await deleteEntry(owner.db, id, 'ada')).toBe(true);
		expect((await getDoc(refs(owner, id).response)).exists()).toBe(false);

		const newcomer = await client(false);
		await submitResponse(newcomer.db, null, id, { name: 'Ada', available: [], password: 'new' });
		await expect(
			submitResponse(newcomer.db, null, id, { name: 'Ada', available: [], password: 'pw' })
		).rejects.toThrow(WrongPassword);
	});

	it('brings the count down but never reuses a person ID', async () => {
		const { owner, id } = await owned();
		await join(id, 'Ada');
		await join(id, 'Bo');
		await deleteEntry(owner.db, id, 'Ada');
		expect(await eventData(owner, id)).toMatchObject({ responseCount: 1, nextPersonId: 3 });
		const newcomer = await client(false);
		expect(await submitResponse(newcomer.db, null, id, { name: 'Cy', available: [] })).toEqual({
			personId: 3
		});
	});

	it('takes an account off the member list when it was their only entry', async () => {
		const { owner, id } = await owned();
		const user = await client();
		await join(id, 'Ada', {}, user);
		expect((await eventData(owner, id)).memberUids).toContain(user.user!.uid);
		await deleteEntry(owner.db, id, 'Ada');
		expect((await eventData(owner, id)).memberUids).toEqual([owner.user!.uid]);
	});

	it('keeps an account a member while it has another entry', async () => {
		const { owner, id } = await owned();
		const user = await client();
		await join(id, 'Ada', {}, user);
		await join(id, 'Ada B', {}, user);
		await deleteEntry(owner.db, id, 'Ada');
		expect((await eventData(owner, id)).memberUids).toContain(user.user!.uid);
	});

	it('never takes the owner off their own event', async () => {
		const { owner, id } = await owned();
		await join(id, 'Me', {}, owner);
		await deleteEntry(owner.db, id, 'Me');
		expect((await eventData(owner, id)).memberUids).toEqual([owner.user!.uid]);
	});

	it('says there was nothing to remove for a name that is not there', async () => {
		const { owner, id } = await owned();
		expect(await deleteEntry(owner.db, id, 'Nobody')).toBe(false);
	});

	it('is for the owner only', async () => {
		const { id } = await owned();
		await join(id, 'Ada');
		const stranger = await client();
		expect(await denied(deleteEntry(stranger.db, id, 'Ada'))).toBe(true);
	});
});

describe('changing a password', () => {
	const PW = 'old-password';
	const locked = async () => {
		const { owner, id } = await owned();
		const ada = await join(id, 'Ada', { password: PW });
		return { owner, id, ada };
	};

	it('moves the entry to the new password, and the old one stops working', async () => {
		const { id, ada } = await locked();
		await changePassword(ada.db, id, 'Ada', PW, 'new-password');

		const edit = (password: string) =>
			submitResponse(ada.db, null, id, { name: 'Ada', available: [SLOTS[2]], password });
		await expect(edit(PW)).rejects.toThrow(WrongPassword);
		await edit('new-password');
		expect((await loadNativeEvent(ada.db, id)).slots[2].available).toEqual([1]);
	});

	it('works from another client, and can be done again', async () => {
		const { id } = await locked();
		const elsewhere = await client();
		await changePassword(elsewhere.db, id, 'ada', PW, 'second');
		await changePassword(elsewhere.db, id, 'Ada', 'second', 'third');
		await submitResponse(elsewhere.db, null, id, { name: 'Ada', available: [], password: 'third' });
	});

	it('is refused for a wrong password, and leaves the old one working', async () => {
		const { id, ada } = await locked();
		await expect(changePassword(ada.db, id, 'Ada', 'nope', 'new')).rejects.toThrow(WrongPassword);
		await submitResponse(ada.db, null, id, { name: 'Ada', available: [], password: PW });
	});

	it('asks for the current password, and for a name that has one', async () => {
		const { id, ada } = await locked();
		await expect(changePassword(ada.db, id, 'Ada', '', 'new')).rejects.toThrow(PasswordRequired);
		await join(id, 'Bo');
		await expect(changePassword(ada.db, id, 'Bo', 'x', 'new')).rejects.toThrow(InvalidInput);
		await expect(changePassword(ada.db, id, 'Nobody', 'x', 'new')).rejects.toThrow(InvalidInput);
	});

	it('needs a new password that is not empty or too long', async () => {
		const { id, ada } = await locked();
		await expect(changePassword(ada.db, id, 'Ada', PW, '')).rejects.toThrow(InvalidInput);
		await expect(changePassword(ada.db, id, 'Ada', PW, 'x'.repeat(101))).rejects.toThrow(
			InvalidInput
		);
	});

	describe('attacks', () => {
		it('cannot replace the secret alone', async () => {
			const { id } = await locked();
			const attacker = await client(false);
			expect(await denied(updateDoc(refs(attacker, id).secret, { secret: 'a'.repeat(64) }))).toBe(
				true
			);
			expect(await denied(setDoc(refs(attacker, id).secret, { secret: 'a'.repeat(64) }))).toBe(
				true
			);
		});

		it('cannot swap the salt without replacing the secret in the same write', async () => {
			const { id, ada } = await locked();
			const current = (await getDoc(refs(ada, id).response)).data()!;
			const nonce = newNonce();
			const secret = await deriveSecret(PW, current.salt);
			expect(
				await denied(
					updateDoc(refs(ada, id).response, {
						salt: newSalt(),
						nonce,
						proof: await proofFor(secret, current.nonce, nonce)
					})
				)
			).toBe(true);
		});

		it('cannot swap the salt and secret with a proof from the wrong password', async () => {
			const { id, ada } = await locked();
			const current = (await getDoc(refs(ada, id).response)).data()!;
			const nonce = newNonce();
			const guess = await deriveSecret('guess', current.salt);
			const batch = writeBatch(ada.db);
			batch.update(refs(ada, id).response, {
				salt: newSalt(),
				nonce,
				proof: await proofFor(guess, current.nonce, nonce)
			});
			batch.update(refs(ada, id).secret, { secret: 'b'.repeat(64) });
			expect(await denied(batch.commit())).toBe(true);
		});

		it('cannot swap the salt and secret with no proof at all', async () => {
			const { id } = await locked();
			const attacker = await client(false);
			const batch = writeBatch(attacker.db);
			batch.update(refs(attacker, id).response, { salt: newSalt(), nonce: newNonce() });
			batch.update(refs(attacker, id).secret, { secret: 'b'.repeat(64) });
			expect(await denied(batch.commit())).toBe(true);
		});

		it('cannot replay an earlier change-of-password proof', async () => {
			const { id, ada } = await locked();
			const before = (await getDoc(refs(ada, id).response)).data()!;
			const nonce = newNonce();
			const secret = await deriveSecret(PW, before.salt);
			const proof = await proofFor(secret, before.nonce, nonce);
			const salt = newSalt();
			const batch = writeBatch(ada.db);
			batch.update(refs(ada, id).response, { salt, nonce, proof });
			batch.update(refs(ada, id).secret, { secret: await deriveSecret('mine', salt) });
			await batch.commit();

			// The attacker saw that write and sends it again to take over with a secret they know.
			const attacker = await client(false);
			const replay = writeBatch(attacker.db);
			replay.update(refs(attacker, id).response, { salt: newSalt(), nonce, proof });
			replay.update(refs(attacker, id).secret, { secret: 'c'.repeat(64) });
			expect(await denied(replay.commit())).toBe(true);
		});

		it('cannot set a secret that is the wrong shape', async () => {
			const { id, ada } = await locked();
			const current = (await getDoc(refs(ada, id).response)).data()!;
			const nonce = newNonce();
			const secret = await deriveSecret(PW, current.salt);
			const batch = writeBatch(ada.db);
			batch.update(refs(ada, id).response, {
				salt: newSalt(),
				nonce,
				proof: await proofFor(secret, current.nonce, nonce)
			});
			batch.update(refs(ada, id).secret, { secret: 'short' });
			expect(await denied(batch.commit())).toBe(true);
		});
	});
});

describe('removing a password', () => {
	const PW = 'old-password';

	it('unlocks the entry for anyone to edit, and its secret is gone', async () => {
		const { id } = await owned();
		const ada = await join(id, 'Ada', { password: PW });
		await removePassword(ada.db, id, 'Ada', PW);

		const entry = (await getDoc(refs(ada, id).response)).data()!;
		expect(entry).not.toHaveProperty('salt');
		expect(entry).not.toHaveProperty('nonce');
		const stranger = await client(false);
		await submitResponse(stranger.db, null, id, { name: 'Ada', available: [SLOTS[3]] });
		expect((await loadNativeEvent(stranger.db, id)).people[0]).not.toHaveProperty('locked');
	});

	it('is refused for a wrong password', async () => {
		const { id } = await owned();
		const ada = await join(id, 'Ada', { password: PW });
		await expect(removePassword(ada.db, id, 'Ada', 'nope')).rejects.toThrow(WrongPassword);
		expect((await getDoc(refs(ada, id).response)).data()).toHaveProperty('salt');
	});

	describe('attacks', () => {
		it('cannot drop the lock without a proof', async () => {
			const { id } = await owned();
			await join(id, 'Ada', { password: PW });
			const attacker = await client(false);
			const batch = writeBatch(attacker.db);
			const {
				salt: _s,
				nonce: _n,
				...rest
			} = {
				salt: 1,
				nonce: 1,
				personId: 1,
				name: 'Ada',
				uid: null,
				available: [],
				updatedAt: 1
			};
			batch.set(refs(attacker, id).response, rest);
			batch.delete(refs(attacker, id).secret);
			expect(await denied(batch.commit())).toBe(true);
		});

		it('cannot drop the lock with a proof from the wrong password', async () => {
			const { id } = await owned();
			const ada = await join(id, 'Ada', { password: PW });
			const current = (await getDoc(refs(ada, id).response)).data()!;
			const guess = await deriveSecret('guess', current.salt);
			const batch = writeBatch(ada.db);
			batch.update(refs(ada, id).response, {
				salt: (await import('firebase/firestore')).deleteField(),
				nonce: (await import('firebase/firestore')).deleteField(),
				proof: await proofFor(guess, current.nonce, REMOVE)
			});
			batch.delete(refs(ada, id).secret);
			expect(await denied(batch.commit())).toBe(true);
		});

		it('cannot delete the secret alone, which would leave the entry locked forever', async () => {
			const { id } = await owned();
			await join(id, 'Ada', { password: PW });
			const attacker = await client(false);
			expect(await denied(deleteDoc(refs(attacker, id).secret))).toBe(true);
		});

		it('cannot reuse a change-of-password proof as a removal proof', async () => {
			const { id } = await owned();
			const ada = await join(id, 'Ada', { password: PW });
			await changePassword(ada.db, id, 'Ada', PW, 'second');
			const current = (await getDoc(refs(ada, id).response)).data()!;
			const attacker = await client(false);
			const batch = writeBatch(attacker.db);
			batch.update(refs(attacker, id).response, {
				salt: (await import('firebase/firestore')).deleteField(),
				nonce: (await import('firebase/firestore')).deleteField(),
				proof: current.proof
			});
			batch.delete(refs(attacker, id).secret);
			expect(await denied(batch.commit())).toBe(true);
		});
	});
});

describe('adding a password', () => {
	const PW = 'first-password';

	it('locks a name that never had one, for a visitor with no account', async () => {
		const { id } = await owned();
		const ada = await join(id, 'Ada');
		await addPassword(ada.db, id, 'Ada', PW);

		const entry = (await getDoc(refs(ada, id).response)).data()!;
		expect(entry.salt).toMatch(/^\d+\$[0-9a-f]{32}$/);
		expect(entry).not.toHaveProperty('proof');
		const stranger = await client(false);
		const change = { name: 'Ada', available: [SLOTS[3]] };
		await expect(submitResponse(stranger.db, null, id, change)).rejects.toThrow(PasswordRequired);
		await expect(
			submitResponse(stranger.db, null, id, { ...change, password: 'nope' })
		).rejects.toThrow(WrongPassword);
		await submitResponse(stranger.db, null, id, { ...change, password: PW });
		expect((await loadNativeEvent(stranger.db, id)).people[0]).toMatchObject({ locked: true });
	});

	it('puts a password back on a name whose password was removed', async () => {
		const { id } = await owned();
		const ada = await join(id, 'Ada', { password: PW });
		await removePassword(ada.db, id, 'Ada', PW);
		await addPassword(ada.db, id, 'Ada', 'second');

		// The proof of the removal doesn't carry over; the new password starts like a new entry's.
		expect((await getDoc(refs(ada, id).response)).data()).not.toHaveProperty('proof');
		const change = { name: 'Ada', available: [SLOTS[1]] };
		await expect(submitResponse(ada.db, null, id, { ...change, password: PW })).rejects.toThrow(
			WrongPassword
		);
		await submitResponse(ada.db, null, id, { ...change, password: 'second' });
		// And it changes and goes like any other.
		await changePassword(ada.db, id, 'Ada', 'second', 'third');
		await removePassword(ada.db, id, 'Ada', 'third');
		await addPassword(ada.db, id, 'Ada', 'fourth');
		await submitResponse(ada.db, null, id, { ...change, password: 'fourth' });
	});

	it('is refused for a name that has one, one that is not there, and a password that is no good', async () => {
		const { id } = await owned();
		const ada = await join(id, 'Ada', { password: PW });
		await join(id, 'Bo');
		await expect(addPassword(ada.db, id, 'Ada', 'x')).rejects.toThrow(InvalidInput);
		await expect(addPassword(ada.db, id, 'Nobody', 'x')).rejects.toThrow(InvalidInput);
		await expect(addPassword(ada.db, id, 'Bo', '')).rejects.toThrow(InvalidInput);
		await expect(addPassword(ada.db, id, 'Bo', 'x'.repeat(101))).rejects.toThrow(InvalidInput);
		expect((await getDoc(refs(ada, id, 'Bo').response)).data()).not.toHaveProperty('salt');
		// Ada's own password is still the one it was.
		await submitResponse(ada.db, null, id, { name: 'Ada', available: [SLOTS[1]], password: PW });
	});

	describe('for a name an account has claimed', () => {
		const claimed = async () => {
			const { owner, id } = await owned();
			const member = await client();
			await join(id, 'Ada', {}, member);
			return { owner, id, member };
		};

		it('is for that account, and no one else', async () => {
			const { id, member } = await claimed();
			const signedOut = await client(false);
			const otherAccount = await client();
			for (const stranger of [signedOut, otherAccount]) {
				expect(await denied(addPassword(stranger.db, id, 'Ada', 'nope'))).toBe(true);
			}
			expect((await getDoc(refs(member, id).response)).data()).not.toHaveProperty('salt');

			await addPassword(member.db, id, 'Ada', PW);
			expect((await getDoc(refs(member, id).response)).data()).toHaveProperty('salt');
		});

		it('is also for the owner and an admin', async () => {
			const { owner, id } = await claimed();
			await addPassword(owner.db, id, 'Ada', PW);
			expect((await getDoc(refs(owner, id).response)).data()).toHaveProperty('salt');

			const admin = await client();
			await join(id, 'Cy', {}, admin);
			await setAdmin(owner.db, id, admin.user!.uid, true);
			await join(id, 'Bo', {}, await client());
			await addPassword(admin.db, id, 'Bo', PW);
			expect((await getDoc(refs(owner, id, 'Bo').response)).data()).toHaveProperty('salt');
		});
	});
});

describe('imported entries', () => {
	it('can be removed by the owner like any other', async () => {
		const owner = await client();
		const { importWhen2Meet } = await import('$lib/events/store');
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada', 'Bo']));
		expect(await deleteEntry(owner.db, id, 'Ada')).toBe(true);
		expect((await loadNativeEvent(owner.db, id)).people.map((p) => p.name)).toEqual(['Bo']);
	});
});
