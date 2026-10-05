import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteEntry } from '$lib/events/manage';
import { InvalidInput, MAX_RESPONSES, responseKey } from '$lib/events/model';
import { createEvent, importWhen2Meet, loadNativeEvent, submitResponse } from '$lib/events/store';
import {
	client,
	closeClients,
	denied,
	joinBatch,
	joinUpdate,
	pollOf,
	resetFirestore,
	SLOTS
} from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

const newEvent = { title: 'Lunch', weekly: false, slotSeconds: 900, slots: SLOTS };

const owned = async () => {
	const owner = await client();
	const id = await createEvent(owner.db, owner.user!, newEvent);
	return { owner, id };
};

const person = (n: number, name = `P${n}`) => ({
	personId: n,
	name,
	uid: null,
	available: [SLOTS[0]],
	updatedAt: 1
});

describe('what a new event may contain', () => {
	const base = (uid: string) => ({
		ownerId: uid,
		title: 'Lunch',
		weekly: false,
		slotSeconds: 900,
		slots: SLOTS,
		nextPersonId: 1,
		responseCount: 0,
		memberUids: [uid],
		source: { type: 'thentomeet' },
		createdAt: 1,
		updatedAt: 1
	});

	it('accepts a well-formed one, and an imported one', async () => {
		const a = await client();
		await setDoc(doc(a.db, 'events', 'ok'), base(a.user!.uid));
		await setDoc(doc(a.db, 'events', 'imported'), {
			...base(a.user!.uid),
			source: { type: 'when2meet', id: '1-abc', importedAt: 5 }
		});
	});

	it.each([
		['an empty title', { title: '' }],
		['a title over 120 characters', { title: 'x'.repeat(121) }],
		['a title that is not text', { title: 5 }],
		['a slot length that is not offered', { slotSeconds: 600 }],
		['a weekly flag that is not true or false', { weekly: 'yes' }],
		['slots that are not a list', { slots: 'all' }],
		['a made-up field', { extra: 'x' }],
		['more than one member', { memberUids: ['a', 'b'] }],
		['a negative response count', { responseCount: -1 }],
		['a source of an unknown kind', { source: { type: 'other' } }],
		['a When2Meet ID that is far too long', { source: { type: 'when2meet', id: 'x'.repeat(41) } }],
		['a field in its source nobody reads', { source: { type: 'thentomeet', note: 'x' } }]
	])('refuses %s', async (_, change) => {
		const a = await client();
		const good = base(a.user!.uid);
		// The same event without the change goes in, so the change is what is refused.
		await setDoc(doc(a.db, 'events', 'twin'), good);
		expect(await denied(setDoc(doc(a.db, 'events', 'bad'), { ...good, ...change }))).toBe(true);
	});

	it('refuses one with a field missing', async () => {
		const a = await client();
		const { createdAt: _, ...partial } = base(a.user!.uid);
		expect(await denied(setDoc(doc(a.db, 'events', 'partial'), partial))).toBe(true);
	});
});

describe('joining one at a time', () => {
	it('takes only the next person ID, and only with the counters in the same write', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const key = responseKey('Ada');
		expect(await denied(joinBatch(visitor, id, key, person(7, 'Ada')))).toBe(true);
		expect(await denied(joinBatch(visitor, id, key, person(2, 'Ada')))).toBe(true);
		// A response with nothing else in the write.
		expect(
			await denied(setDoc(doc(visitor.db, 'events', id, 'responses', key), person(1, 'Ada')))
		).toBe(true);
		await joinBatch(visitor, id, key, person(1, 'Ada'));
	});

	it('does not let one count cover several responses in a batch', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const at = (name: string) => doc(visitor.db, 'events', id, 'responses', responseKey(name));
		const two = async () => {
			const batch = writeBatch(visitor.db);
			batch.update(
				doc(visitor.db, 'events', id),
				await joinUpdate(visitor.db, id, responseKey('Ada'))
			);
			batch.set(at('Ada'), person(1, 'Ada'));
			batch.set(at('Bo'), person(1, 'Bo'));
			return batch.commit();
		};
		expect(await denied(two())).toBe(true);
		expect((await getDoc(at('Ada'))).exists()).toBe(false);
		// One response per count is what a join is.
		await joinBatch(visitor, id, responseKey('Ada'), person(1, 'Ada'));
		await joinBatch(visitor, id, responseKey('Bo'), person(2, 'Bo'));
	});

	it('lets a removed name be added again', async () => {
		const { owner, id } = await owned();
		const visitor = await client(false);
		await submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[0]] });
		await deleteEntry(owner.db, id, 'Ada');
		await submitResponse(visitor.db, null, id, { name: 'Ada', available: [SLOTS[1]] });
		const event = await loadNativeEvent(visitor.db, id);
		expect(event.people.map((p) => p.name)).toEqual(['Ada']);
	});
});

describe('the most people an event holds', () => {
	/** An imported event with `n` people, which the owner can bring in over the limit. */
	const full = async (n: number) => {
		const owner = await client();
		const names = Array.from({ length: n }, (_, i) => `Person ${i}`);
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(names));
		return { owner, id };
	};

	it('stops at the limit, in the rules and in the app', async () => {
		const { id } = await full(MAX_RESPONSES - 1);
		const last = await client(false);
		await submitResponse(last.db, null, id, { name: 'The last one', available: [SLOTS[0]] });
		expect((await getDoc(doc(last.db, 'events', id))).data()?.responseCount).toBe(MAX_RESPONSES);

		const late = await client(false);
		// The app says so before asking the rules.
		await expect(
			submitResponse(late.db, null, id, { name: 'Too late', available: [SLOTS[0]] })
		).rejects.toThrow(InvalidInput);
		// And the rules refuse it for anyone who skips the app's check.
		const key = responseKey('Too late');
		expect(await denied(joinBatch(late, id, key, person(MAX_RESPONSES + 1, 'Too late')))).toBe(
			true
		);
		expect((await loadNativeEvent(late.db, id)).people).toHaveLength(MAX_RESPONSES);
	}, 60_000);

	it('lets people already in keep editing, and the owner add more', async () => {
		const { owner, id } = await full(MAX_RESPONSES);
		const visitor = await client(false);
		await submitResponse(visitor.db, null, id, { name: 'person 3', available: [SLOTS[1]] });
		expect((await loadNativeEvent(visitor.db, id)).slots[1].available).toContain(4);
		await submitResponse(owner.db, owner.user, id, { name: 'The owner', available: [] });
		expect((await getDoc(doc(owner.db, 'events', id))).data()?.responseCount).toBe(
			MAX_RESPONSES + 1
		);
	}, 60_000);

	it('does not let a visitor lower the count to make room', async () => {
		const { id } = await full(MAX_RESPONSES);
		const visitor = await client(false);
		const ref = doc(visitor.db, 'events', id);
		expect(await denied(updateDoc(ref, { responseCount: 0, updatedAt: 9 }))).toBe(true);
		expect(await denied(updateDoc(ref, { nextPersonId: 1, updatedAt: 9 }))).toBe(true);
	}, 60_000);
});
