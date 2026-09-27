import { describe, expect, it } from 'vitest';
import { demoEventHtml } from '$lib/w2m/demo';
import { parseEvent } from '$lib/w2m/parse';
import { sharedView } from './sharedView';

const event = parseEvent(demoEventHtml(new Date('2026-09-23T12:00:00Z')), 'demo');
const zone = 'America/New_York';
const at = (iso: string) => Date.parse(iso) / 1000;

describe('sharedView featured times', () => {
	it('features the link’s picked times', () => {
		// Tuesday 2–3 PM and Friday 11 AM–noon in New York.
		const picks = [
			{ start: at('2026-09-29T18:00:00Z'), end: at('2026-09-29T19:00:00Z') },
			{ start: at('2026-10-02T15:00:00Z'), end: at('2026-10-02T16:00:00Z') }
		];
		const { featured } = sharedView(event, { id: 'demo', zone, picks });
		expect(featured.map((b) => [b.start, b.end])).toEqual(picks.map((p) => [p.start, p.end]));
	});

	it('features the best time the preview names, or every meeting of the best set', () => {
		const once = sharedView(event, { id: 'demo', zone });
		expect(once.featured).toEqual([once.best.everyone[0]]);

		const twice = sharedView(event, { id: 'demo', zone, perWeek: 2 });
		const top = twice.sets!.everyone[0] ?? twice.sets!.required[0];
		expect(twice.featured).toEqual(top?.sessions ?? []);
	});

	it('features nothing when nothing fits', () => {
		expect(sharedView(event, { id: 'demo', zone, duration: 240 }).featured).toEqual([]);
	});
});
