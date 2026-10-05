import { describe, expect, it } from 'vitest';
import type { W2MEvent } from '$lib/types';
import { changesSince, mergeChanges, NO_CHANGES, sameContent, snapshot } from './changes';

const event = (available: number[][], people = [1, 2, 3]): W2MEvent => ({
	id: '1-a',
	title: 'Test',
	weekly: false,
	slotSeconds: 900,
	slots: available.map((ids, i) => ({ time: 1_800_000_000 + i * 900, available: ids })),
	people: people.map((id) => ({ id, name: `P${id}` })),
	noTimes: [],
	fetchedAt: 0
});

describe('response changes', () => {
	const before = event([[1], [1, 2]], [1, 2]);

	it('reports nothing on a first visit', () => {
		expect(changesSince(undefined, before)).toBe(NO_CHANGES);
	});

	it('reports nothing when no one changed', () => {
		expect(changesSince(snapshot(before), event([[1], [1, 2]], [1, 2]))).toBe(NO_CHANGES);
	});

	it('spots new people and changed times', () => {
		const after = event([[1, 3], [2]], [1, 2, 3]);
		expect(changesSince(snapshot(before), after)).toEqual({ added: [3], updated: [1] });
	});

	it('survives a round trip through JSON, like localStorage', () => {
		const stored = JSON.parse(JSON.stringify(snapshot(before)));
		expect(changesSince(stored, event([[1], [1]], [1, 2]))).toEqual({ added: [], updated: [2] });
	});

	it('merges changes across refreshes, keeping new people as new', () => {
		expect(mergeChanges({ added: [3], updated: [1] }, { added: [4], updated: [3, 2, 1] })).toEqual({
			added: [3, 4],
			updated: [1, 2]
		});
		expect(mergeChanges(NO_CHANGES, NO_CHANGES)).toBe(NO_CHANGES);
	});
});

describe('sameContent', () => {
	const event = (
		over: Partial<import('$lib/types').W2MEvent> = {}
	): import('$lib/types').W2MEvent => ({
		id: 'x',
		title: 'T',
		weekly: false,
		slotSeconds: 900,
		slots: [
			{ time: 0, available: [1, 2] },
			{ time: 900, available: [2] }
		],
		people: [
			{ id: 1, name: 'Ada' },
			{ id: 2, name: 'Bo' }
		],
		noTimes: [],
		fetchedAt: 1,
		...over
	});

	it('ignores when it was fetched', () => {
		expect(sameContent(event(), event({ fetchedAt: 999 }))).toBe(true);
	});

	it('notices a new owner or a change of admins', () => {
		expect(sameContent(event({ ownerId: 'a' }), event({ ownerId: 'b' }))).toBe(false);
		expect(sameContent(event(), event({ adminUids: ['b'] }))).toBe(false);
		expect(sameContent(event({ adminUids: [] }), event())).toBe(true);
	});

	it('notices a title, a person, a lock, or anyone’s times changing', () => {
		expect(sameContent(event(), event({ title: 'U' }))).toBe(false);
		expect(sameContent(event(), event({ noTimes: [{ id: 3, name: 'Cy' }] }))).toBe(false);
		expect(
			sameContent(
				event(),
				event({
					people: [
						{ id: 1, name: 'Ada', locked: true },
						{ id: 2, name: 'Bo' }
					]
				})
			)
		).toBe(false);
		expect(
			sameContent(
				event(),
				event({
					slots: [
						{ time: 0, available: [1] },
						{ time: 900, available: [2] }
					]
				})
			)
		).toBe(false);
	});

	it('notices a different set of slots', () => {
		expect(sameContent(event(), event({ slots: [{ time: 0, available: [1, 2] }] }))).toBe(false);
	});
});
