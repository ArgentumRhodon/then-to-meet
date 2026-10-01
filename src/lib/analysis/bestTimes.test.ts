import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Roles, W2MEvent } from '$lib/types';
import { demoEventHtml } from '$lib/w2m/demo';
import { parseEvent } from '$lib/w2m/parse';
import {
	blockers,
	blockForSlots,
	findBestTimes,
	slotAttendance,
	slotSpan,
	type TimeBlock
} from './bestTimes';
import { buildGrid } from './grid';

const ZONE = 'America/New_York';
const event = parseEvent(demoEventHtml(new Date('2026-09-23T12:00:00Z')), 'demo');
const grid = buildGrid(event, ZONE);
const byName = (name: string) => event.people.find((p) => p.name.startsWith(name))!.id;

/** "Tue 14:00-15:30" in the demo's own zone, for readable assertions. */
const describeBlock = (b: TimeBlock) => {
	const start = DateTime.fromSeconds(b.start, { zone: ZONE });
	const end = DateTime.fromSeconds(b.end, { zone: ZONE });
	return `${start.toFormat('ccc HH:mm')}-${end.toFormat('HH:mm')}`;
};

const run = (roles: Roles = {}, minutes = 60) => findBestTimes(event, grid, roles, minutes);

describe('findBestTimes', () => {
	it('finds the one window where everyone is free', () => {
		expect(run().everyone.map(describeBlock)).toEqual(['Tue 14:00-15:00']);
	});

	it('lists near misses with the one person who is missing', () => {
		const near = run().near;
		expect(near.map(describeBlock)).toEqual([
			'Tue 14:00-15:30',
			'Wed 15:00-16:00',
			'Fri 11:00-12:00'
		]);
		expect(near.map((b) => b.requiredMissing)).toEqual([
			[byName('Taylor')],
			[byName('Sam')],
			[byName('Taylor')]
		]);
	});

	it('counts a single free slot as a 15 minute meeting (v1 missed these)', () => {
		const tiny: W2MEvent = {
			...event,
			people: [
				{ id: 1, name: 'A' },
				{ id: 2, name: 'B' }
			],
			slots: [
				{ time: 1_800_000_000, available: [1] },
				{ time: 1_800_000_900, available: [1, 2] },
				{ time: 1_800_001_800, available: [1] }
			]
		};
		const result = findBestTimes(tiny, buildGrid(tiny, 'UTC'), {}, 15);
		expect(result.everyone).toHaveLength(1);
		expect(result.everyone[0].start).toBe(1_800_000_900);
		expect(result.everyone[0].end).toBe(1_800_001_800);
	});

	it('includes the last slot of the day in a window', () => {
		// Alex and Sam are both free Thu 9-12; that block should end at noon, not 11:45.
		const onlyTwo: Roles = Object.fromEntries(
			event.people.map((p) => [
				p.id,
				[byName('Alex'), byName('Sam')].includes(p.id) ? 'required' : 'skip'
			])
		);
		const thu = run(onlyTwo, 180).everyone.map(describeBlock);
		expect(thu).toContain('Thu 09:00-12:00');
	});

	it('treats optional people as nice-to-have', () => {
		const result = run({ [byName('Taylor')]: 'optional' });
		expect(result.everyone.map(describeBlock)).toEqual(['Tue 14:00-15:00']);
		expect(result.required.map(describeBlock)).toEqual(['Tue 14:00-15:30', 'Fri 11:00-12:00']);
		// Near misses are one *required* person short; optional absences don't count against them.
		expect(result.near.map(describeBlock)).toEqual([
			'Tue 14:00-16:00',
			'Wed 10:00-11:00',
			'Wed 15:00-16:00',
			'Fri 11:00-12:30'
		]);
		expect(result.near.every((b) => b.requiredMissing.length === 1)).toBe(true);
	});

	it('ignores skipped people entirely', () => {
		const result = run({ [byName('Sam')]: 'skip' });
		expect(result.considered).toBe(6);
		expect(result.everyone.map(describeBlock)).toEqual(['Tue 14:00-15:00', 'Wed 15:00-16:00']);
	});

	it('returns nothing when the duration is longer than any overlap', () => {
		const result = run({}, 240);
		expect(result.everyone).toEqual([]);
	});

	it('leaves out times two or more required people miss', () => {
		const result = run();
		const all = [...result.everyone, ...result.required, ...result.near];
		expect(all.every((b) => b.requiredMissing.length <= 1)).toBe(true);
	});

	it('does not merge windows across a gap in the day', () => {
		const gappy: W2MEvent = {
			...event,
			people: [{ id: 1, name: 'A' }],
			slots: [
				{ time: 1_800_000_000, available: [1] },
				{ time: 1_800_003_600, available: [1] }
			]
		};
		const result = findBestTimes(gappy, buildGrid(gappy, 'UTC'), {}, 30);
		expect(result.everyone).toEqual([]);
	});
});

/** Unix seconds for a wall-clock time in the demo's zone, like "2026-09-29T14:00". */
const at = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toSeconds();

describe('picking a time by hand', () => {
	// The demo event runs Mon Sep 28 – Fri Oct 2, 2026, 9 AM – 5 PM.
	const pickBlock = (from: string, to: string, roles: Roles = {}) => {
		const span = slotSpan(event, grid, at(from), at(to))!;
		return blockForSlots(event, grid, roles, span.startSlot, span.endSlot);
	};

	it('covers the slots in the range', () => {
		const span = slotSpan(event, grid, at('2026-09-29T14:00'), at('2026-09-29T15:00'))!;
		expect(span.endSlot - span.startSlot + 1).toBe(4);
		expect(describeBlock(pickBlock('2026-09-29T14:00', '2026-09-29T15:00'))).toBe(
			'Tue 14:00-15:00'
		);
	});

	it('stops at the end of the day', () => {
		const block = pickBlock('2026-09-29T16:00', '2026-09-29T19:00');
		expect(describeBlock(block)).toBe('Tue 16:00-17:00');
	});

	it('finds nothing when no slot starts at that time', () => {
		expect(slotSpan(event, grid, at('2026-09-29T08:00'), at('2026-09-29T09:00'))).toBeNull();
	});

	it('says who can and can’t make it', () => {
		expect(pickBlock('2026-09-29T14:00', '2026-09-29T15:00')).toMatchObject({
			tier: 'everyone',
			missing: []
		});
		const longer = pickBlock('2026-09-29T14:00', '2026-09-29T15:30');
		expect(longer.tier).toBe('near');
		expect(longer.missing).toEqual([byName('Taylor')]);
		expect(longer.attendees).toHaveLength(6);
	});

	it('leaves skipped people out', () => {
		const block = pickBlock('2026-09-29T14:00', '2026-09-29T15:30', {
			[byName('Taylor')]: 'skip'
		});
		expect(block.tier).toBe('everyone');
		expect(block.attendees).not.toContain(byName('Taylor'));
	});
});

describe('blockers', () => {
	it('counts who is the one person missing from near misses', () => {
		expect(blockers(run().near)).toEqual([
			{ id: byName('Taylor'), count: 2 },
			{ id: byName('Sam'), count: 1 }
		]);
	});

	it('works when no one is required', () => {
		const allOptional: Roles = Object.fromEntries(event.people.map((p) => [p.id, 'optional']));
		const near = run(allOptional).near;
		expect(near.length).toBeGreaterThan(0);
		const counted = blockers(near);
		expect(counted.reduce((n, b) => n + b.count, 0)).toBe(near.length);
	});
});

describe('buildGrid', () => {
	it('shifts rows when viewed from another timezone', () => {
		const tokyo = buildGrid(event, 'Asia/Tokyo');
		// 9 AM–5 PM New York is 10 PM–6 AM Tokyo, which splits the rows around midnight.
		expect(tokyo.rows[0].minute).toBe(0);
		expect(tokyo.rows.some((r) => r.gapBefore)).toBe(true);
		expect(tokyo.days.length).toBe(6);
	});

	it('keeps weekly events on UTC wall-clock time', () => {
		const weekly: W2MEvent = {
			...event,
			weekly: true,
			slots: [{ time: 345600 + 9 * 3600, available: [] }]
		};
		const g = buildGrid(weekly, 'Asia/Tokyo');
		expect(g.zone).toBe('UTC');
		expect(g.rows[0].minute).toBe(9 * 60);
		expect(g.days[0].date).toBeNull();
	});
});

describe('slotAttendance', () => {
	const [a, b, c] = event.people.map((p) => p.id);
	const small: W2MEvent = {
		...event,
		people: event.people.slice(0, 3),
		slots: [
			{ time: 0, available: [a, b, c] },
			{ time: 900, available: [a, b] },
			{ time: 1800, available: [a, c] },
			{ time: 2700, available: [] }
		]
	};

	it('marks slots with every required person but not every optional one', () => {
		const roles: Roles = { [c]: 'optional' };
		expect(slotAttendance(small, roles).partial).toEqual([false, true, false, false]);
	});

	it('never marks slots without both required and optional people', () => {
		expect(slotAttendance(small, {}).partial).toEqual([false, false, false, false]);
		const allOptional: Roles = { [a]: 'optional', [b]: 'optional', [c]: 'optional' };
		expect(slotAttendance(small, allOptional).partial).toEqual([false, false, false, false]);
	});

	it('ignores skipped people', () => {
		const roles: Roles = { [c]: 'skip' };
		expect(slotAttendance(small, roles).partial).toEqual([false, false, false, false]);
	});
});
