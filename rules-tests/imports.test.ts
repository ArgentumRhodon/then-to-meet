import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { responseKey } from '$lib/events/model';
import { importWhen2Meet, loadNativeEvent, submitResponse } from '$lib/events/store';
import type { W2MEvent } from '$lib/types';
import { client, closeClients, denied, pollOf, resetFirestore, SLOTS } from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

describe('importing a When2Meet poll', () => {
	it('copies the event and every person, with their times and IDs, under the importer', async () => {
		const owner = await client();
		const poll: W2MEvent = {
			...pollOf(['Ada', 'Bo']),
			slots: SLOTS.map((time, i) => ({ time, available: i === 0 ? [1, 2] : i === 1 ? [2] : [] })),
			noTimes: [{ id: 3, name: 'Cy' }]
		};
		const { id, created } = await importWhen2Meet(owner.db, owner.user!, poll);
		expect(created).toBe(true);

		const stored = (await getDoc(doc(owner.db, 'events', id))).data()!;
		expect(stored).toMatchObject({
			ownerId: owner.user!.uid,
			memberUids: [owner.user!.uid],
			nextPersonId: 4,
			responseCount: 3,
			source: { type: 'when2meet', id: poll.id }
		});

		const copy = await loadNativeEvent(owner.db, id);
		expect(copy.importedFrom).toBe(poll.id);
		expect(copy.people).toEqual(poll.people);
		expect(copy.noTimes).toEqual(poll.noTimes);
		expect(copy.slots.map((s) => [...s.available].sort())).toEqual(
			poll.slots.map((s) => [...s.available].sort())
		);
	});

	it('files each person under their name, with no account behind them', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada Lovelace']));
		const response = (
			await getDoc(doc(owner.db, 'events', id, 'responses', responseKey('ada  lovelace')))
		).data();
		expect(response).toMatchObject({ name: 'Ada Lovelace', personId: 1, uid: null });
	});

	it('finds the first copy when the same user imports the same poll again', async () => {
		const owner = await client();
		const first = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada']));
		const second = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada', 'Bo']));
		expect(second).toEqual({ id: first.id, created: false });
		// The second call changed nothing, even though the poll it saw had another person.
		const responses = await getDocs(collection(owner.db, 'events', first.id, 'responses'));
		expect(responses.size).toBe(1);
	});

	it('gives each user a copy of their own, which no one else owns', async () => {
		const a = await client();
		const b = await client();
		const first = await importWhen2Meet(a.db, a.user!, pollOf(['Ada']));
		const second = await importWhen2Meet(b.db, b.user!, pollOf(['Ada']));
		expect(second.id).not.toBe(first.id);
		expect((await getDoc(doc(b.db, 'events', second.id))).data()?.ownerId).toBe(b.user!.uid);
	});

	it('keeps two people with the same name apart', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Sam', 'sam ']));
		const copy = await loadNativeEvent(owner.db, id);
		expect(copy.people.map((p) => p.id)).toEqual([1, 2]);
	});

	it('goes through in several batches for a big poll', async () => {
		const owner = await client();
		const names = Array.from({ length: 450 }, (_, i) => `Person ${i}`);
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(names));
		const responses = await getDocs(collection(owner.db, 'events', id, 'responses'));
		expect(responses.size).toBe(450);
		expect((await getDoc(doc(owner.db, 'events', id))).data()?.responseCount).toBe(450);
	});

	it('is refused for a signed-out visitor, and for a user claiming another account', async () => {
		const visitor = await client(false);
		const fake = { uid: 'someone', name: null, email: null, picture: null };
		expect(await denied(importWhen2Meet(visitor.db, fake, pollOf(['Ada'])))).toBe(true);

		const user = await client();
		expect(await denied(importWhen2Meet(user.db, fake, pollOf(['Ada'])))).toBe(true);
	});

	it('leaves the imported people open to editing by name, like any entry', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada']));
		const visitor = await client(false);
		expect(
			await submitResponse(visitor.db, null, id, { name: 'ada', available: [SLOTS[2]] })
		).toEqual({ personId: 1 });
		const copy = await loadNativeEvent(visitor.db, id);
		expect(copy.slots[2].available).toEqual([1]);
	});
});
