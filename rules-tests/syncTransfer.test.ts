import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteEvent, resyncWhen2Meet, transferOwnership } from '$lib/events/manage';
import { InvalidInput } from '$lib/events/model';
import {
	createEvent,
	findMissingEvents,
	importWhen2Meet,
	listEventsFor,
	loadNativeEvent,
	submitResponse
} from '$lib/events/store';
import type { W2MEvent } from '$lib/types';
import { client, closeClients, denied, pollOf, resetFirestore, SLOTS } from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

/** `pollOf`, with each person free for the slots given. */
const pollWith = (people: [string, number[]][], extra: Partial<W2MEvent> = {}): W2MEvent => ({
	...pollOf(people.map(([name]) => name)),
	slots: SLOTS.map((time, s) => ({
		time,
		available: people.flatMap(([, free], n) => (free.includes(s) ? [n + 1] : []))
	})),
	...extra
});

describe('updating an import from its poll', () => {
	it('updates the poll’s people, adds new ones, and leaves what was done here alone', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(
			owner.db,
			owner.user!,
			pollWith([
				['Ada', [0]],
				['Bo', [0]],
				['Cy', [0]]
			])
		);
		// Bo changes their own times here, after the import.
		await submitResponse(owner.db, null, id, { name: 'Bo', available: [SLOTS[3]] });

		const report = await resyncWhen2Meet(
			owner.db,
			id,
			pollWith([
				['Ada', [0, 1]],
				['Bo', [2]],
				['Cy', [0]],
				['Di', [1]]
			])
		);
		expect(report).toMatchObject({ added: 1, updated: 1, kept: 1, slotsAdded: 0 });

		const copy = await loadNativeEvent(owner.db, id);
		const timesOf = (name: string) => {
			const person = [...copy.people, ...copy.noTimes].find((p) => p.name === name)!;
			return copy.slots.flatMap((s, i) => (s.available.includes(person.id) ? [i] : []));
		};
		expect(timesOf('Ada')).toEqual([0, 1]);
		expect(timesOf('Bo')).toEqual([3]);
		expect(timesOf('Cy')).toEqual([0]);
		expect(timesOf('Di')).toEqual([1]);
		const stored = (await getDoc(doc(owner.db, 'events', id))).data()!;
		expect(stored).toMatchObject({ responseCount: 4, nextPersonId: 5 });
		expect(stored.source.syncedAt).toBeGreaterThan(stored.source.importedAt - 1);
	});

	it('does not clash with people who joined here, and is a no-op the second time', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollWith([['Ada', [0]]]));
		await submitResponse(owner.db, null, id, { name: 'Zed', available: [SLOTS[1]] });
		const next = pollWith([
			['Ada', [0]],
			['Bo', [2]]
		]);
		expect(await resyncWhen2Meet(owner.db, id, next)).toMatchObject({ added: 1 });
		const copy = await loadNativeEvent(owner.db, id);
		const ids = [...copy.people, ...copy.noTimes].map((p) => p.id);
		expect(new Set(ids).size).toBe(3);

		expect(await resyncWhen2Meet(owner.db, id, next)).toMatchObject({
			added: 0,
			updated: 0,
			slotsAdded: 0
		});
	});

	it('adds the poll’s new times', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollWith([['Ada', [0]]]));
		const later = SLOTS[SLOTS.length - 1] + 900;
		const poll = pollWith([['Ada', [0]]]);
		poll.slots.push({ time: later, available: [1] });
		expect(await resyncWhen2Meet(owner.db, id, poll)).toMatchObject({ slotsAdded: 1, updated: 1 });
		const copy = await loadNativeEvent(owner.db, id);
		expect(copy.slots.at(-1)).toEqual({ time: later, available: [1] });
	});

	it('is for the owner only', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollWith([['Ada', [0]]]));
		const stranger = await client();
		const next = pollWith([
			['Ada', [1]],
			['Bo', [1]]
		]);
		expect(await denied(resyncWhen2Meet(stranger.db, id, next))).toBe(true);
		const copy = await loadNativeEvent(owner.db, id);
		expect(copy.people).toHaveLength(1);
	});

	it('refuses an event that was not imported', async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, {
			title: 'Mine',
			weekly: false,
			slotSeconds: 900,
			slots: SLOTS
		});
		await expect(resyncWhen2Meet(owner.db, id, pollOf(['Ada']))).rejects.toThrow(InvalidInput);
	});

	it('goes through for a big poll, in several batches', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada']));
		const names = ['Ada', ...Array.from({ length: 450 }, (_, i) => `New ${i}`)];
		const report = await resyncWhen2Meet(owner.db, id, pollOf(names));
		expect(report.added).toBe(450);
		const responses = await getDocs(collection(owner.db, 'events', id, 'responses'));
		expect(responses.size).toBe(451);
	});
});

describe('transferring ownership', () => {
	const setup = async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, {
			title: 'Lunch',
			weekly: false,
			slotSeconds: 900,
			slots: SLOTS
		});
		const heir = await client();
		await submitResponse(heir.db, heir.user, id, { name: 'Heir', available: [SLOTS[0]] });
		return { owner, heir, id };
	};

	it('hands the event over: the new owner manages it and the old one no longer can', async () => {
		const { owner, heir, id } = await setup();
		await transferOwnership(owner.db, id, heir.user!.uid);

		const stored = (await getDoc(doc(owner.db, 'events', id))).data()!;
		expect(stored.ownerId).toBe(heir.user!.uid);
		expect(stored.memberUids).toEqual(expect.arrayContaining([owner.user!.uid, heir.user!.uid]));
		const copy = await loadNativeEvent(owner.db, id);
		expect(copy.ownerId).toBe(heir.user!.uid);

		// The old owner has lost the controls.
		expect(await denied(deleteEvent(owner.db, id))).toBe(true);
		await deleteEvent(heir.db, id);
		expect((await getDoc(doc(heir.db, 'events', id))).exists()).toBe(false);
	});

	it('keeps the event in the old owner’s list', async () => {
		const { owner, heir, id } = await setup();
		await transferOwnership(owner.db, id, heir.user!.uid);
		const mine = await listEventsFor(owner.db, owner.user!.uid);
		expect(mine.map((e) => [e.id, e.owned])).toEqual([[id, false]]);
	});

	it('only goes to an account that responded to the event', async () => {
		const { owner, id } = await setup();
		const stranger = await client();
		await expect(transferOwnership(owner.db, id, stranger.user!.uid)).rejects.toThrow(InvalidInput);
		await expect(transferOwnership(owner.db, id, owner.user!.uid)).rejects.toThrow(InvalidInput);
		expect((await getDoc(doc(owner.db, 'events', id))).data()?.ownerId).toBe(owner.user!.uid);
	});

	it('is for the owner only', async () => {
		const { heir, id } = await setup();
		const other = await client();
		await submitResponse(other.db, other.user, id, { name: 'Other', available: [] });
		expect(await denied(transferOwnership(heir.db, id, other.user!.uid))).toBe(true);
		const visitor = await client(false);
		expect(await denied(transferOwnership(visitor.db, id, other.user!.uid))).toBe(true);
	});
});

describe('finding deleted events', () => {
	it('reports the ones that are gone, as any signed-in or signed-out visitor sees them', async () => {
		const owner = await client();
		const make = () =>
			createEvent(owner.db, owner.user!, {
				title: 'E',
				weekly: false,
				slotSeconds: 900,
				slots: SLOTS
			});
		const [kept, deleted] = [await make(), await make()];
		await deleteEvent(owner.db, deleted);
		const visitor = await client(false);
		expect(await findMissingEvents(visitor.db, [kept, deleted, 'neverExisted0000000'])).toEqual([
			deleted,
			'neverExisted0000000'
		]);
		expect(await findMissingEvents(visitor.db, [])).toEqual([]);
	});
});
