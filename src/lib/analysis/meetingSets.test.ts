import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Roles, W2MEvent } from '$lib/types';
import { blockers } from './bestTimes';
import { buildGrid } from './grid';
import { dayCombos, findMeetingSets, type MeetingSet } from './meetingSets';

const DAY = 86_400;
const MONDAY = Date.UTC(2026, 8, 28) / 1000;

type Week = [number, number][][];

/** A dated poll from Monday, 9 AM–5 PM UTC. `free` maps a person to their hours for each day. */
const poll = (free: Record<number, Week>, days = 5, fromHour = 9, toHour = 17): W2MEvent => {
	const slots = [];
	for (let d = 0; d < days; d++) {
		for (let h = fromHour; h < toHour; h += 0.25) {
			const available = Object.entries(free)
				.filter(([, week]) => (week[d] ?? []).some(([a, b]) => h >= a && h < b))
				.map(([id]) => Number(id));
			slots.push({ time: MONDAY + d * DAY + h * 3600, available });
		}
	}
	return {
		id: 'test',
		title: 'Test',
		weekly: false,
		slotSeconds: 900,
		slots,
		people: Object.keys(free).map((id) => ({ id: Number(id), name: `P${id}` })),
		noTimes: [],
		fetchedAt: 0
	};
};

const sets = (event: W2MEvent, count: 2 | 3, minutes = 60) =>
	findMeetingSets(event, buildGrid(event, 'UTC'), {}, minutes, count);

/** "Mon 10:00 + Wed 10:00" */
const describeSet = (set: MeetingSet) =>
	set.starts.map((t) => DateTime.fromSeconds(t, { zone: 'utc' }).toFormat('ccc HH:mm')).join(' + ');

const all = (...hours: [number, number][]) => Array.from({ length: 7 }, () => hours);

describe('findMeetingSets', () => {
	it('pairs days at the same time with a day off between them', () => {
		const mwf: [number, number][] = [[10, 11]];
		const tt: [number, number][] = [[14, 15]];
		const week = [mwf, tt, mwf, tt, mwf];
		const found = sets(poll({ 1: week, 2: week, 3: week }), 2);
		expect(found.everyone.map(describeSet).sort()).toEqual([
			'Mon 10:00 + Fri 10:00',
			'Mon 10:00 + Wed 10:00',
			'Tue 14:00 + Thu 14:00',
			'Wed 10:00 + Fri 10:00'
		]);
		expect(found.everyone.every((s) => s.spread === 0 && s.flex === 0)).toBe(true);
	});

	it('never uses back-to-back days', () => {
		const found = sets(poll({ 1: all([10, 11]), 2: all([10, 11]) }), 2);
		expect(found.everyone.map(describeSet).sort()).toEqual([
			'Mon 10:00 + Fri 10:00',
			'Mon 10:00 + Thu 10:00',
			'Mon 10:00 + Wed 10:00',
			'Tue 10:00 + Fri 10:00',
			'Tue 10:00 + Thu 10:00',
			'Wed 10:00 + Fri 10:00'
		]);
		const triples = sets(poll({ 1: all([10, 11]), 2: all([10, 11]) }), 3);
		expect(triples.everyone.map(describeSet)).toEqual(['Mon 10:00 + Wed 10:00 + Fri 10:00']);
	});

	it('counts the wrap into next week, so Sunday and Monday never pair up', () => {
		const week = poll({ 1: all([10, 11]) }, 7);
		const combos = dayCombos(buildGrid(week, 'UTC'), 2);
		expect(combos).not.toContainEqual([0, 6]);
		expect(combos).toContainEqual([0, 5]);
		expect(combos.every(([a, b]) => b - a >= 2)).toBe(true);
	});

	it('allows start times up to half an hour apart, preferring the same time', () => {
		const close = poll({
			1: [[[10, 11]], [], [[10.5, 11.5]]],
			2: [[[10, 11]], [], [[10.5, 11.5]]]
		});
		const found = sets(close, 2);
		expect(found.everyone.map(describeSet)).toEqual(['Mon 10:00 + Wed 10:30']);
		expect(found.everyone[0].spread).toBe(30);

		const far = poll({ 1: [[[10, 11]], [], [[11, 12]]], 2: [[[10, 11]], [], [[11, 12]]] });
		expect(sets(far, 2).everyone).toEqual([]);
	});

	it('merges start times that work equally well into one flexible option', () => {
		const week: Week = [[], [[14, 16]], [], [[14, 16]], []];
		const found = sets(poll({ 1: week, 2: week }), 2);
		expect(found.everyone.map(describeSet)).toEqual(['Tue 14:00 + Thu 14:00']);
		expect(found.everyone[0].flex).toBe(3600);
		// The highlighted windows cover every allowed start: 2:00 to 4:00.
		const [tue] = found.everyone[0].sessions;
		expect(tue.end - tue.start).toBe(2 * 3600);
	});

	it('ranks sets by who misses a meeting, and says who', () => {
		const mwf: [number, number][] = [[10, 11]];
		const found = sets(
			poll({ 1: [mwf, [], mwf, [], mwf], 2: [mwf, [], mwf, [], mwf], 3: [mwf, [], [], [], mwf] }),
			2
		);
		expect(found.everyone.map(describeSet)).toEqual(['Mon 10:00 + Fri 10:00']);
		expect(found.near.map(describeSet).sort()).toEqual([
			'Mon 10:00 + Wed 10:00',
			'Wed 10:00 + Fri 10:00'
		]);
		const [near] = found.near;
		expect(near.missing).toEqual([3]);
		expect(near.always).toEqual([1, 2]);
		expect(near.sessions.map((s) => s.missing)).toContainEqual([3]);
		expect(blockers(found.near)).toEqual([{ id: 3, count: 2 }]);

		const triple = sets(
			poll({ 1: [mwf, [], mwf, [], mwf], 2: [mwf, [], mwf, [], mwf], 3: [mwf, [], [], [], mwf] }),
			3
		);
		expect(triple.everyone).toEqual([]);
		expect(triple.near.map(describeSet)).toEqual(['Mon 10:00 + Wed 10:00 + Fri 10:00']);
	});

	it('respects skipped and optional people', () => {
		const mwf: [number, number][] = [[10, 11]];
		const event = poll({ 1: [mwf, [], mwf], 2: [mwf, [], mwf], 3: [mwf, [], []] });
		const grid = buildGrid(event, 'UTC');
		expect(findMeetingSets(event, grid, { 3: 'skip' }, 60, 2).everyone).toHaveLength(1);
		const optional = findMeetingSets(event, grid, { 3: 'optional' }, 60, 2);
		expect(optional.required.map(describeSet)).toEqual(['Mon 10:00 + Wed 10:00']);
	});

	it('keeps up with a big multi-week poll', () => {
		// 21 days, 9–5, 30 people with patchy availability from a fixed seed.
		let seed = 42;
		const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
		const free: Record<number, Week> = {};
		for (let p = 1; p <= 30; p++) {
			free[p] = Array.from({ length: 21 }, () => {
				const start = 9 + Math.floor(random() * 12) / 2;
				return [[start, Math.min(17, start + 1 + Math.floor(random() * 8) / 2)]];
			});
		}
		const event = poll(free, 21);
		// Two required and the rest optional, so the fewest starts are ruled out early.
		const roles: Roles = {};
		for (let p = 3; p <= 30; p++) roles[p] = 'optional';
		const started = performance.now();
		const found = findMeetingSets(event, buildGrid(event, 'UTC'), roles, 60, 3);
		expect(performance.now() - started).toBeLessThan(1500);
		const total = found.everyone.length + found.required.length + found.near.length;
		expect(total).toBeGreaterThan(0);
	});
});
