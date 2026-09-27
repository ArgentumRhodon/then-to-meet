import { describe, expect, it } from 'vitest';
import type { W2MEvent } from '$lib/types';
import { buildReminder } from './reminder';

const event = (id: string): W2MEvent => ({
	id,
	title: 'Team sync',
	weekly: false,
	slotSeconds: 900,
	slots: [],
	people: [],
	noTimes: [],
	fetchedAt: 0
});

describe('buildReminder', () => {
	it('names everyone and links the poll', () => {
		const text = buildReminder(event('123-abc'), [
			{ id: 1, name: 'Carrie' },
			{ id: 2, name: 'Daniel' },
			{ id: 3, name: 'Lucas' }
		]);
		expect(text).toMatch(/^Hi Carrie, Daniel, and Lucas! You signed in to “Team sync”/);
		expect(text).toMatch(/Could you add yours\? https:\/\/www\.when2meet\.com\/\?123-abc$/);
	});

	it('leaves the link off the demo, which has no real poll', () => {
		const text = buildReminder(event('demo'), [{ id: 1, name: 'Guest' }]);
		expect(text).toMatch(/^Hi Guest!/);
		expect(text).toMatch(/Could you add yours\?$/);
	});
});
