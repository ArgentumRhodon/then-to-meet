import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { responseKey } from '$lib/events/model';
import {
	createEvent,
	importWhen2Meet,
	listEventsFor,
	loadNativeEvent,
	submitResponse
} from '$lib/events/store';
import { client, closeClients, denied, pollOf, resetFirestore, SLOTS } from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

const newEvent = { title: 'Lunch', weekly: false, slotSeconds: 900, slots: SLOTS };

const owned = async () => {
	const owner = await client();
	const id = await createEvent(owner.db, owner.user!, newEvent);
	return { owner, id };
};

const responseRef = (db: Awaited<ReturnType<typeof client>>['db'], id: string, name: string) =>
	doc(db, 'events', id, 'responses', responseKey(name));

describe('joining and editing, as on When2Meet', () => {
	it('lets a signed-out visitor add themselves, taking the next person ID', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		expect(
			await submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[0]] })
		).toEqual({
			personId: 1
		});
		const second = await client(false);
		expect(
			await submitResponse(second.db, null, id, { name: 'Bo', available: [SLOTS[1]] })
		).toEqual({
			personId: 2
		});

		const event = await loadNativeEvent(visitor.db, id);
		expect(event.people.map((p) => p.name)).toEqual(['Ada', 'Bo']);
		expect(event.slots[0].available).toEqual([1]);
		expect(event.slots[1].available).toEqual([2]);
	});

	it('lets anyone edit a name’s times by entering it, however it is capitalized', async () => {
		const { id } = await owned();
		const a = await client(false);
		const b = await client(false);
		await submitResponse(a.db, null, id, { name: 'Ada', available: [SLOTS[0]] });
		expect(await submitResponse(b.db, null, id, { name: '  ADA ', available: [SLOTS[2]] })).toEqual(
			{
				personId: 1
			}
		);
		const event = await loadNativeEvent(a.db, id);
		expect(event.people).toHaveLength(1);
		expect(event.slots[0].available).toEqual([]);
		expect(event.slots[2].available).toEqual([1]);
	});

	it('does not let two visitors joining at once end up with the same person ID', async () => {
		const { id } = await owned();
		const clients = await Promise.all([client(false), client(false), client(false), client(false)]);
		const results = await Promise.all(
			clients.map((c, i) =>
				submitResponse(c.db, null, id, { name: `P${i}`, available: [SLOTS[0]] })
			)
		);
		expect(results.map((r) => r.personId).sort()).toEqual([1, 2, 3, 4]);
		expect((await getDoc(doc(clients[0].db, 'events', id))).data()?.responseCount).toBe(4);
	});

	it('ties a signed-in response to the account and puts the event on its list', async () => {
		const { id } = await owned();
		const user = await client();
		await submitResponse(user.db, user.user, id, { name: 'Ada', available: [SLOTS[0]] });
		expect((await getDoc(responseRef(user.db, id, 'Ada'))).data()?.uid).toBe(user.user!.uid);
		expect((await listEventsFor(user.db, user.user!.uid)).map((e) => e.id)).toEqual([id]);
	});

	it('lets anyone read everyone’s responses', async () => {
		const { id } = await owned();
		const a = await client(false);
		await submitResponse(a.db, null, id, { name: 'Ada', available: [SLOTS[0]] });
		const visitor = await client(false);
		const all = await getDocs(collection(visitor.db, 'events', id, 'responses'));
		expect(all.docs.map((d) => d.data().name)).toEqual(['Ada']);
	});

	it('lets a signed-in user claim a name no account has, like an imported person’s', async () => {
		const owner = await client();
		const poll = pollOf(['Ada']);
		const { id } = await importWhen2Meet(owner.db, owner.user!, poll);
		const user = await client();
		await submitResponse(user.db, user.user, id, { name: 'Ada', available: [SLOTS[0]] });
		const response = (await getDoc(responseRef(user.db, id, 'Ada'))).data();
		expect(response).toMatchObject({ personId: 1, uid: user.user!.uid });
		expect((await getDoc(doc(user.db, 'events', id))).data()?.memberUids).toContain(user.user!.uid);
	});

	it('does not let a second account take over a name another account claimed', async () => {
		const { id } = await owned();
		const first = await client();
		await submitResponse(first.db, first.user, id, { name: 'Ada', available: [SLOTS[0]] });
		// Editing is allowed (anyone can, as on When2Meet), but the name stays the first account's.
		const second = await client();
		await submitResponse(second.db, second.user, id, { name: 'Ada', available: [SLOTS[1]] });
		expect((await getDoc(responseRef(second.db, id, 'Ada'))).data()?.uid).toBe(first.user!.uid);
	});
});

describe('what a response may contain', () => {
	const valid = () => ({
		personId: 1,
		name: 'Ada',
		uid: null,
		available: [SLOTS[0]],
		updatedAt: 1
	});

	it('accepts a well-formed one for an event that exists', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		await setDoc(responseRef(visitor.db, id, 'Ada'), valid());
	});

	it.each([
		['an extra field', { extra: 1 }],
		['an empty name', { name: '' }],
		['a name over 60 characters', { name: 'x'.repeat(61) }],
		['a person ID that is not a whole number', { personId: 1.5 }],
		['a person ID that is text', { personId: '1' }],
		['times that are not a list', { available: 'all' }],
		['more than 5000 times', { available: Array.from({ length: 5001 }, (_, i) => i) }],
		['a password salt without a nonce', { salt: '1000$' + 'ab'.repeat(16) }]
	])('refuses %s', async (_, change) => {
		const { id } = await owned();
		const visitor = await client(false);
		expect(
			await denied(setDoc(responseRef(visitor.db, id, 'Ada'), { ...valid(), ...change }))
		).toBe(true);
	});

	it('refuses one missing a required field', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const { updatedAt: _, ...partial } = valid();
		expect(await denied(setDoc(responseRef(visitor.db, id, 'Ada'), partial))).toBe(true);
	});

	it('refuses a response for an event that does not exist', async () => {
		const visitor = await client(false);
		expect(await denied(setDoc(responseRef(visitor.db, 'nope', 'Ada'), valid()))).toBe(true);
	});

	it('refuses naming an account that is not yours', async () => {
		const { id } = await owned();
		const user = await client();
		expect(
			await denied(setDoc(responseRef(user.db, id, 'Ada'), { ...valid(), uid: 'someone-else' }))
		).toBe(true);
		const visitor = await client(false);
		expect(
			await denied(setDoc(responseRef(visitor.db, id, 'Bo'), { ...valid(), uid: user.user!.uid }))
		).toBe(true);
	});
});

describe('changing an existing response', () => {
	const joined = async () => {
		const { owner, id } = await owned();
		const user = await client();
		await submitResponse(user.db, user.user, id, { name: 'Ada', available: [SLOTS[0]] });
		return { owner, id, user };
	};

	it('keeps the person ID', async () => {
		const { id } = await joined();
		const visitor = await client(false);
		expect(await denied(updateDoc(responseRef(visitor.db, id, 'Ada'), { personId: 99 }))).toBe(
			true
		);
	});

	it('keeps the account that owns it', async () => {
		const { id } = await joined();
		const other = await client();
		expect(
			await denied(updateDoc(responseRef(other.db, id, 'Ada'), { uid: other.user!.uid }))
		).toBe(true);
		const visitor = await client(false);
		expect(await denied(updateDoc(responseRef(visitor.db, id, 'Ada'), { uid: null }))).toBe(true);
	});

	it('does not let a signed-in user claim a name for someone else’s account', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada']));
		const user = await client();
		expect(await denied(updateDoc(responseRef(user.db, id, 'Ada'), { uid: 'someone-else' }))).toBe(
			true
		);
	});
});

describe('deleting responses', () => {
	it('is for the event’s owner only', async () => {
		const { owner, id } = await owned();
		const visitor = await client(false);
		await submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[0]] });

		const stranger = await client();
		expect(await denied(deleteDoc(responseRef(stranger.db, id, 'Ada')))).toBe(true);
		expect(await denied(deleteDoc(responseRef(visitor.db, id, 'Ada')))).toBe(true);

		await deleteDoc(responseRef(owner.db, id, 'Ada'));
		expect((await getDoc(responseRef(owner.db, id, 'Ada'))).exists()).toBe(false);
	});

	it('is not even allowed for the person who made it', async () => {
		const { id } = await owned();
		const user = await client();
		await submitResponse(user.db, user.user, id, { name: 'Ada', available: [SLOTS[0]] });
		expect(await denied(deleteDoc(responseRef(user.db, id, 'Ada')))).toBe(true);
	});
});
