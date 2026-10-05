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
import { PasswordRequired, responseKey, WrongPassword } from '$lib/events/model';
import { deriveSecret, newNonce, newSalt, proofFor } from '$lib/events/password';
import { createEvent, submitResponse } from '$lib/events/store';
import {
	client,
	closeClients,
	denied,
	joinBatch,
	resetFirestore,
	SLOTS,
	type Client
} from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

const PASSWORD = 'hunter2';

const newEvent = { title: 'Lunch', weekly: false, slotSeconds: 900, slots: SLOTS };

const setup = async () => {
	const owner = await client();
	const id = await createEvent(owner.db, owner.user!, newEvent);
	const visitor = await client(false);
	await submitResponse(visitor.db, null, id, {
		name: 'Ada',
		available: [SLOTS[0]],
		password: PASSWORD
	});
	return { owner, id, visitor };
};

const refs = (c: Client, id: string, name = 'Ada') => ({
	response: doc(c.db, 'events', id, 'responses', responseKey(name)),
	secret: doc(c.db, 'events', id, 'secrets', responseKey(name))
});

const entry = async (c: Client, id: string) =>
	(await getDoc(refs(c, id).response)).data() as {
		salt: string;
		nonce: string;
		proof?: string;
		available: number[];
	};

/** A change to a locked entry with a proof worked out the way the rules expect, from the password. */
const proven = async (c: Client, id: string, change: Record<string, unknown>) => {
	const current = await entry(c, id);
	const nonce = newNonce();
	const secret = await deriveSecret(PASSWORD, current.salt);
	return { ...change, nonce, proof: await proofFor(secret, current.nonce, nonce) };
};

describe('setting a password', () => {
	it('locks the entry, with the secret stored where nobody can read it', async () => {
		const { owner, id, visitor } = await setup();
		const stranger = await client();
		const response = await entry(owner, id);
		expect(response.salt).toMatch(/^\d+\$[0-9a-f]{32}$/);
		expect(response).not.toHaveProperty('proof');

		for (const reader of [owner, visitor, stranger, await client(false)]) {
			expect(await denied(getDoc(refs(reader, id).secret))).toBe(true);
			expect(await denied(getDocs(collection(reader.db, 'events', id, 'secrets')))).toBe(true);
		}
	});

	it('leaves other names unlocked', async () => {
		const { id } = await setup();
		const other = await client(false);
		await submitResponse(other.db, null, id, { name: 'Bo', available: [SLOTS[0]] });
		await submitResponse(other.db, null, id, { name: 'Bo', available: [SLOTS[1]] });
		expect((await getDoc(refs(other, id, 'Bo').response)).data()).not.toHaveProperty('salt');
	});

	it('is refused without its secret, or with a secret that is not the right shape', async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, newEvent);
		const visitor = await client(false);
		const { response, secret } = refs(visitor, id);
		const locked = {
			personId: 1,
			name: 'Ada',
			uid: null,
			available: [],
			updatedAt: 1,
			salt: newSalt(),
			nonce: newNonce()
		};

		// No secret alongside.
		expect(await denied(joinBatch(visitor, id, responseKey('Ada'), locked))).toBe(true);

		const together = (secretData: object) =>
			joinBatch(visitor, id, responseKey('Ada'), locked, {
				more: (batch) => batch.set(secret, secretData)
			});
		expect(await denied(together({ secret: 'short' }))).toBe(true);
		expect(await denied(together({ secret: 'a'.repeat(64), extra: 1 }))).toBe(true);
		await together({ secret: 'a'.repeat(64) });
		expect((await entry(visitor, id)).salt).toBe(locked.salt);
	});

	it('is refused with a proof already in it', async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, newEvent);
		const visitor = await client(false);
		const { secret } = refs(visitor, id);
		const withProof = {
			personId: 1,
			name: 'Ada',
			uid: null,
			available: [],
			updatedAt: 1,
			salt: newSalt(),
			nonce: newNonce(),
			proof: 'b'.repeat(64)
		};
		const attempt = (response: object) =>
			joinBatch(visitor, id, responseKey('Ada'), response, {
				more: (batch) => batch.set(secret, { secret: 'a'.repeat(64) })
			});
		expect(await denied(attempt(withProof))).toBe(true);
		// The same entry without the proof goes in, so the proof is what was refused.
		const { proof: _, ...clean } = withProof;
		await attempt(clean);
	});

	it('cannot be added to a name that already exists without one', async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, newEvent);
		const visitor = await client(false);
		await submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[0]] });

		const attacker = await client(false);
		const { response, secret } = refs(attacker, id);
		// Setting a secret for an entry that exists is refused outright...
		expect(await denied(setDoc(secret, { secret: 'a'.repeat(64) }))).toBe(true);
		// ...and so is giving the entry a salt, even alongside one.
		const batch = writeBatch(attacker.db);
		batch.set(secret, { secret: 'a'.repeat(64) });
		batch.update(response, { salt: newSalt(), nonce: newNonce() });
		expect(await denied(batch.commit())).toBe(true);
	});

	it('cannot leave a secret behind for an entry that is not there', async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, newEvent);
		const visitor = await client(false);
		expect(await denied(setDoc(refs(visitor, id).secret, { secret: 'a'.repeat(64) }))).toBe(true);
	});
});

describe('changing a locked entry', () => {
	it('takes the right password, and moves the nonce each time', async () => {
		const { id, visitor } = await setup();
		const before = (await entry(visitor, id)).nonce;
		await submitResponse(visitor.db, null, id, {
			name: 'Ada',
			available: [SLOTS[1]],
			password: PASSWORD
		});
		const after = await entry(visitor, id);
		expect(after.available).toEqual([SLOTS[1]]);
		expect(after.nonce).not.toBe(before);
		expect(after.proof).toMatch(/^[0-9a-f]{64}$/);
	});

	it('works from any other client, signed in or not, since the password is all it needs', async () => {
		const { id } = await setup();
		const elsewhere = await client();
		await submitResponse(elsewhere.db, elsewhere.user, id, {
			name: 'ada',
			available: [SLOTS[2]],
			password: PASSWORD
		});
		expect((await entry(elsewhere, id)).available).toEqual([SLOTS[2]]);
	});

	it('refuses a wrong password, and says so, leaving the times alone', async () => {
		const { id, visitor } = await setup();
		await expect(
			submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[1]], password: 'nope' })
		).rejects.toThrow(WrongPassword);
		expect((await entry(visitor, id)).available).toEqual([SLOTS[0]]);
	});

	it('asks for the password when none is given', async () => {
		const { id, visitor } = await setup();
		await expect(
			submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[1]] })
		).rejects.toThrow(PasswordRequired);
	});

	it('accepts a proof worked out by hand, so the rules and the client agree on the formula', async () => {
		const { id, visitor } = await setup();
		await updateDoc(
			refs(visitor, id).response,
			await proven(visitor, id, { available: [SLOTS[3]] })
		);
		expect((await entry(visitor, id)).available).toEqual([SLOTS[3]]);
	});
});

describe('attacks on a locked entry', () => {
	it('fails to change it with no proof at all', async () => {
		const { id } = await setup();
		const attacker = await client(false);
		expect(await denied(updateDoc(refs(attacker, id).response, { available: [] }))).toBe(true);
		expect(await denied(updateDoc(refs(attacker, id).response, { name: 'Pwned' }))).toBe(true);
	});

	it('fails with a proof that is made up', async () => {
		const { id } = await setup();
		const attacker = await client(false);
		expect(
			await denied(
				updateDoc(refs(attacker, id).response, {
					available: [],
					nonce: newNonce(),
					proof: 'c'.repeat(64)
				})
			)
		).toBe(true);
	});

	it('fails with a proof made from the wrong password', async () => {
		const { id, visitor } = await setup();
		const current = await entry(visitor, id);
		const nonce = newNonce();
		const guess = await deriveSecret('letmein', current.salt);
		expect(
			await denied(
				updateDoc(refs(visitor, id).response, {
					available: [],
					nonce,
					proof: await proofFor(guess, current.nonce, nonce)
				})
			)
		).toBe(true);
	});

	it('fails to replay the proof from an earlier change', async () => {
		const { id, visitor } = await setup();
		const edit = (slot: number) =>
			submitResponse(visitor.db, null, id, { name: 'Ada', available: [slot], password: PASSWORD });
		await edit(SLOTS[1]);
		const first = await entry(visitor, id);
		await edit(SLOTS[2]);

		// An attacker who saw the entry after the first change puts its nonce and proof back.
		const attacker = await client(false);
		expect(
			await denied(
				updateDoc(refs(attacker, id).response, {
					available: [],
					nonce: first.nonce,
					proof: first.proof
				})
			)
		).toBe(true);
	});

	it('fails to reuse the current proof for new times', async () => {
		const { id, visitor } = await setup();
		await submitResponse(visitor.db, null, id, {
			name: 'Ada',
			available: [SLOTS[1]],
			password: PASSWORD
		});
		const current = await entry(visitor, id);
		const attacker = await client(false);
		// Same nonce and proof, different times: the nonce has to move.
		expect(
			await denied(
				updateDoc(refs(attacker, id).response, {
					available: [SLOTS[3]],
					nonce: current.nonce,
					proof: current.proof
				})
			)
		).toBe(true);
	});

	it('fails to change the salt, which would make the old password useless', async () => {
		const { id, visitor } = await setup();
		const change = await proven(visitor, id, { available: [SLOTS[0]] });
		expect(
			await denied(updateDoc(refs(visitor, id).response, { ...change, salt: newSalt() }))
		).toBe(true);
	});

	it('fails to remove the lock by dropping its fields', async () => {
		const { id } = await setup();
		const attacker = await client(false);
		const current = (await getDoc(refs(attacker, id).response)).data()!;
		const { salt: _s, nonce: _n, proof: _p, ...unlocked } = current;
		expect(await denied(setDoc(refs(attacker, id).response, unlocked))).toBe(true);
	});

	it('fails to overwrite or delete the secret', async () => {
		const { id } = await setup();
		const attacker = await client(false);
		const stranger = await client();
		expect(await denied(setDoc(refs(attacker, id).secret, { secret: 'a'.repeat(64) }))).toBe(true);
		expect(await denied(updateDoc(refs(stranger, id).secret, { secret: 'a'.repeat(64) }))).toBe(
			true
		);
		expect(await denied(deleteDoc(refs(attacker, id).secret))).toBe(true);
		expect(await denied(deleteDoc(refs(stranger, id).secret))).toBe(true);
	});
});

describe('the owner and a forgotten password', () => {
	it('can delete the entry and its secret, after which the name starts fresh', async () => {
		const { owner, id } = await setup();
		const { response, secret } = refs(owner, id);
		const batch = writeBatch(owner.db);
		batch.delete(response);
		batch.delete(secret);
		await batch.commit();

		const newcomer = await client(false);
		await submitResponse(newcomer.db, null, id, {
			name: 'Ada',
			available: [SLOTS[0]],
			password: 'a-new-one'
		});
		const again = await entry(newcomer, id);
		expect(again.salt).toBeDefined();
		await expect(
			submitResponse(newcomer.db, null, id, {
				name: 'Ada',
				available: [SLOTS[1]],
				password: PASSWORD
			})
		).rejects.toThrow(WrongPassword);
	});
});
