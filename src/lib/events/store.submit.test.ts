import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, any>;
const fake = vi.hoisted(() => ({ docs: new Map<string, Doc>() }));

/*
 * A stand-in for Firestore that stores documents by path, runs transactions, and applies the
 * password rule from firestore.rules: changing an entry with a password needs a proof that is
 * SHA-256 of secret|currentNonce|newNonce, or the write is denied.
 */
vi.mock('firebase/firestore', () => {
	const ref = (path: string) => ({ path, id: path.split('/').pop() });
	return {
		collection: (_db: unknown, ...segments: string[]) => ref(segments.join('/')),
		doc: (base: unknown, ...segments: string[]) =>
			ref(
				typeof base === 'object' && base !== null && 'path' in base
					? [(base as { path: string }).path, ...segments].join('/')
					: segments.join('/')
			),
		arrayUnion: (...values: unknown[]) => ({ union: values }),
		runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) => {
			const writes: (() => void)[] = [];
			const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });
			const tx = {
				get: async (r: { path: string }) => ({
					exists: () => fake.docs.has(r.path),
					data: () => fake.docs.get(r.path)
				}),
				set: (r: { path: string }, value: Doc) => writes.push(() => fake.docs.set(r.path, value)),
				update: (r: { path: string }, value: Doc) =>
					writes.push(() => {
						const prior = fake.docs.get(r.path)!;
						const next: Doc = { ...prior };
						for (const [key, v] of Object.entries(value)) {
							next[key] =
								v && typeof v === 'object' && 'union' in v
									? [...new Set([...(prior[key] ?? []), ...(v as { union: unknown[] }).union])]
									: v;
						}
						// The rule for changing a response that has a password.
						if (r.path.includes('/responses/') && prior.salt !== undefined) {
							const secret = fake.docs.get(r.path.replace('/responses/', '/secrets/'))?.secret;
							const proof = createHash('sha256')
								.update(`${secret}|${prior.nonce}|${next.nonce}`)
								.digest('hex');
							if (next.nonce === prior.nonce || next.proof !== proof) throw denied();
						}
						fake.docs.set(r.path, next);
					})
			};
			const result = await run(tx);
			for (const write of writes) write();
			return result;
		}
	};
});

import { InvalidInput, PasswordRequired, responseKey, WrongPassword } from './model';
import { submitResponse } from './store';

const db = {} as never;
const EVENT = 'ev1';
const SLOTS = [0, 900, 1800, 2700];
const ada = responseKey('Ada');
const responseAt = (key: string) => fake.docs.get(`events/${EVENT}/responses/${key}`);
const secretAt = (key: string) => fake.docs.get(`events/${EVENT}/secrets/${key}`);
const event = () => fake.docs.get(`events/${EVENT}`)!;
const user = { uid: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', picture: null };

beforeEach(() => {
	fake.docs.clear();
	fake.docs.set(`events/${EVENT}`, {
		ownerId: 'owner',
		slots: SLOTS,
		nextPersonId: 5,
		responseCount: 4,
		memberUids: ['owner'],
		updatedAt: 1
	});
});

describe('submitResponse without a password', () => {
	it('lets a signed-out visitor join, taking the next person ID', async () => {
		const result = await submitResponse(db, null, EVENT, { name: 'Ada', available: [0, 900] });
		expect(result).toEqual({ personId: 5 });
		expect(responseAt(ada)).toMatchObject({
			personId: 5,
			name: 'Ada',
			uid: null,
			available: [0, 900]
		});
		expect(responseAt(ada)).not.toHaveProperty('salt');
		expect(secretAt(ada)).toBeUndefined();
		expect(event()).toMatchObject({ nextPersonId: 6, responseCount: 5, memberUids: ['owner'] });
	});

	it('edits the same person for the same name, however it is written', async () => {
		await submitResponse(db, null, EVENT, { name: 'Ada', available: [0] });
		const again = await submitResponse(db, null, EVENT, { name: '  ADA ', available: [900] });
		expect(again).toEqual({ personId: 5 });
		expect(responseAt(ada)!.available).toEqual([900]);
		expect(event()).toMatchObject({ nextPersonId: 6, responseCount: 5 });
	});

	it('ties a signed-in response to the account and puts the event in its list', async () => {
		await submitResponse(db, user, EVENT, { name: 'Ada', available: [0] });
		expect(responseAt(ada)!.uid).toBe('u1');
		expect(event().memberUids).toEqual(['owner', 'u1']);
	});

	it('lets a signed-in user claim an unclaimed name, like an imported person', async () => {
		fake.docs.set(`events/${EVENT}/responses/${ada}`, {
			personId: 2,
			name: 'Ada',
			uid: null,
			available: [0],
			updatedAt: 1
		});
		await submitResponse(db, user, EVENT, { name: 'Ada', available: [900] });
		expect(responseAt(ada)).toMatchObject({ personId: 2, uid: 'u1', available: [900] });
		expect(event().memberUids).toContain('u1');
	});

	it('rejects times the event does not have, and a missing event', async () => {
		await expect(
			submitResponse(db, null, EVENT, { name: 'Ada', available: [450] })
		).rejects.toThrow(InvalidInput);
		await expect(submitResponse(db, null, 'nope', { name: 'Ada', available: [] })).rejects.toThrow(
			/No ThenToMeet event/
		);
	});

	it('will not add a password to a name that already exists without one', async () => {
		await submitResponse(db, null, EVENT, { name: 'Ada', available: [0] });
		await expect(
			submitResponse(db, null, EVENT, { name: 'Ada', available: [0], password: 'late' })
		).rejects.toThrow(InvalidInput);
		expect(responseAt(ada)).not.toHaveProperty('salt');
	});
});

describe('submitResponse with a password', () => {
	const join = () =>
		submitResponse(db, null, EVENT, { name: 'Ada', available: [0], password: 'hunter2' });

	it('locks a new entry, keeping the secret out of the public response', async () => {
		await join();
		const response = responseAt(ada)!;
		expect(response.salt).toMatch(/^\d+\$[0-9a-f]{32}$/);
		expect(response.nonce).toMatch(/^[0-9a-f]{32}$/);
		expect(response).not.toHaveProperty('proof');
		expect(secretAt(ada)!.secret).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(response)).not.toContain(secretAt(ada)!.secret);
		expect(JSON.stringify(response)).not.toContain('hunter2');
	});

	it('takes the password to change times, and moves the nonce each time', async () => {
		await join();
		const first = responseAt(ada)!.nonce;
		await submitResponse(db, null, EVENT, { name: 'Ada', available: [900], password: 'hunter2' });
		const second = responseAt(ada)!.nonce;
		expect(responseAt(ada)!.available).toEqual([900]);
		expect(second).not.toBe(first);
		await submitResponse(db, null, EVENT, { name: 'ada', available: [1800], password: 'hunter2' });
		expect(responseAt(ada)!.nonce).not.toBe(second);
		expect(responseAt(ada)!.available).toEqual([1800]);
		// Changing times doesn't make a new person.
		expect(event()).toMatchObject({ nextPersonId: 6, responseCount: 5 });
	});

	it('asks for the password when there is none', async () => {
		await join();
		await expect(
			submitResponse(db, null, EVENT, { name: 'Ada', available: [900] })
		).rejects.toThrow(PasswordRequired);
		expect(responseAt(ada)!.available).toEqual([0]);
	});

	it('says so when the password is wrong, and changes nothing', async () => {
		await join();
		await expect(
			submitResponse(db, null, EVENT, { name: 'Ada', available: [900], password: 'wrong' })
		).rejects.toThrow(WrongPassword);
		expect(responseAt(ada)!.available).toEqual([0]);
	});

	it('works the same for a signed-in user, who also keeps the account tie', async () => {
		await submitResponse(db, user, EVENT, { name: 'Ada', available: [0], password: 'pw' });
		await submitResponse(db, user, EVENT, { name: 'Ada', available: [900], password: 'pw' });
		expect(responseAt(ada)).toMatchObject({ uid: 'u1', available: [900] });
	});

	it('keeps different names separate', async () => {
		await join();
		await submitResponse(db, null, EVENT, { name: 'Bo', available: [0] });
		expect(responseAt(responseKey('Bo'))).not.toHaveProperty('salt');
		expect(responseAt(ada)).toHaveProperty('salt');
	});
});
