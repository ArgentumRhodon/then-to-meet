import { describe, expect, it } from 'vitest';
import type { W2MEvent } from '$lib/types';
import { changesSince, mergeChanges, NO_CHANGES, snapshot } from './changes';

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
