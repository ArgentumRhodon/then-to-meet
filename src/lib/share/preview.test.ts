import { describe, expect, it } from 'vitest';
import { blockForSlots, findBestTimes, slotSpan } from '$lib/analysis/bestTimes';
import { buildGrid } from '$lib/analysis/grid';
import { findMeetingSets } from '$lib/analysis/meetingSets';
import type { Roles, W2MEvent } from '$lib/types';
import { demoEventHtml } from '$lib/w2m/demo';
import { parseEvent } from '$lib/w2m/parse';
import { buildPreview } from './preview';
import { buildSummary } from './summary';

const ZONE = 'America/New_York';
const event = parseEvent(demoEventHtml(new Date('2026-09-23T12:00:00Z')), 'demo');
const grid = buildGrid(event, ZONE);

const preview = (duration = 60, roles: Roles = {}, extra = {}) =>
	buildPreview({
		event,
		best: findBestTimes(event, grid, roles, duration),
		duration,
		zone: ZONE,
		...extra
	});

describe('buildPreview', () => {
	it('leads with the time everyone can make, in the sharer’s zone', () => {
		const { title, description } = preview();
		expect(title).toBe('Design team sync');
		expect(description).toContain('Everyone’s free for a 1h meeting: Tue, Sep 29,');
		expect(description).toContain('EDT');
		expect(description).toMatch(/7 people responded\.$/);
	});

	it('says so when nothing fits', () => {
		expect(preview(240).description).toMatch(/^No 4h time fits everyone yet\./);
	});

	const pickUtc = (from: [number, number, number], to: [number, number, number]) => {
		const [start, end] = [from, to].map(([d, h, m]) => Date.UTC(2026, 8, d, h, m) / 1000);
		const span = slotSpan(event, grid, start, end)!;
		return blockForSlots(event, grid, {}, span.startSlot, span.endSlot);
	};

	it('describes a proposed time and who is missing', () => {
		// Tuesday, 2–3:30 PM in New York.
		const { description } = preview(60, {}, { picks: [pickUtc([29, 18, 0], [29, 19, 30])] });
		expect(description).toMatch(/^Proposed: Tue, Sep 29,/);
		expect(description).toContain('6 of 7 can make it (not Taylor Brooks).');
	});

	it('describes several proposed times together', () => {
		// Tuesday 2–3:30 PM and Friday 11 AM–noon in New York; Taylor is out both times.
		const picks = [pickUtc([29, 18, 0], [29, 19, 30]), pickUtc([32, 15, 0], [32, 16, 0])];
		const { description } = preview(60, {}, { picks });
		expect(description).toMatch(/^Proposed: Tue, Sep 29, .* and Fri, Oct 2, /);
		expect(description).toContain('6 of 7 can make every one (not Taylor Brooks).');
	});

	it('names the group in the title', () => {
		expect(preview(60, {}, { group: 'Leads' }).title).toBe('Design team sync (Leads)');
	});

	it('describes the best set when meeting several times a week', () => {
		// Two people free Tuesday and Thursday, 2–3 PM in New York.
		const hour = (day: number, h: number) => Date.UTC(2026, 8, day, h) / 1000;
		const tueThu: W2MEvent = {
			...event,
			people: [
				{ id: 1, name: 'Ada' },
				{ id: 2, name: 'Bo' }
			],
			slots: [29, 1].flatMap((day) =>
				[0, 900, 1800, 2700].map((offset) => ({
					time: hour(day, 18) + offset + (day === 1 ? 30 * 86_400 : 0),
					available: [1, 2]
				}))
			)
		};
		const g = buildGrid(tueThu, ZONE);
		const { description } = buildPreview({
			event: tueThu,
			best: findBestTimes(tueThu, g, {}, 60),
			sets: findMeetingSets(tueThu, g, {}, 60, 2),
			perWeek: 2,
			duration: 60,
			zone: ZONE
		});
		expect(description).toMatch(
			/^Meeting twice a week for 1h: everyone can make Tue and Thu, 2:00/
		);
		expect(description).toContain('EDT');

		const demo = buildPreview({
			event,
			best: findBestTimes(event, grid, {}, 60),
			sets: findMeetingSets(event, grid, {}, 60, 3),
			perWeek: 3,
			duration: 60,
			zone: ZONE
		});
		expect(demo.description).toMatch(/^Nothing fits everyone three times a week yet\./);
	});
});

describe('buildSummary with meeting sets', () => {
	it('lists sets and who misses which meeting', () => {
		const text = buildSummary({
			event,
			best: findBestTimes(event, grid, {}, 60),
			sets: findMeetingSets(event, grid, {}, 60, 2),
			perWeek: 2,
			duration: 60,
			zone: ZONE,
			link: 'https://ttm.example/?e=demo'
		});
		expect(text).toMatch(
			/^Design team sync: best times for 1h twice a week · times in America\/New York/
		);
		expect(text).toContain('Most people (nothing fits everyone)');
		expect(text).toMatch(
			/• Tue and Thu · 2:00.*\(without Alex Rivera on Thu; Diego Álvarez on Thu\)/
		);
	});
});
