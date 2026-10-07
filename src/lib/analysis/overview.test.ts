import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Roles, W2MEvent } from '$lib/types';
import { demoEventHtml } from '$lib/w2m/demo';
import { parseEvent } from '$lib/w2m/parse';
import { findBestTimes, slotAttendance } from './bestTimes';
import { buildGrid } from './grid';
import { findMeetingSets } from './meetingSets';
import {
	buildOverview,
	describeDays,
	describeTime,
	formatDateSpan,
	hasEnded,
	OVERVIEW_DAYS,
	upcomingTimes,
	type EventOverview
} from './overview';

const at = (iso: string) => Date.parse(iso) / 1000;
const HOUR = 3600;

/** Two days in UTC with hour-long slots: Monday 9 and 10, Tuesday 10 and 11. */
const twoDays: W2MEvent = {
	id: 'aaaaaaaaaaaaaaaaaaaa',
	title: 'Planning',
	weekly: false,
	slotSeconds: HOUR,
	slots: [
		{ time: at('2026-10-12T09:00:00Z'), available: [1, 2] },
		{ time: at('2026-10-12T10:00:00Z'), available: [1] },
		{ time: at('2026-10-13T10:00:00Z'), available: [1, 2] },
		{ time: at('2026-10-13T11:00:00Z'), available: [] }
	],
	people: [
		{ id: 1, name: 'Ana', uid: 'u-ana' },
		{ id: 2, name: 'Ben' }
	],
	noTimes: [{ id: 3, name: 'Cy' }],
	fetchedAt: 0,
	source: 'thentomeet'
};

const overviewOf = (
	event: W2MEvent,
	{
		roles = {},
		duration = 60,
		now = 0,
		uid = null,
		zone = 'UTC',
		perWeek = 1
	}: {
		roles?: Roles;
		duration?: number;
		now?: number;
		uid?: string | null;
		zone?: string;
		perWeek?: 1 | 2 | 3;
	} = {}
): EventOverview => {
	const grid = buildGrid(event, zone);
	return buildOverview({
		event,
		grid,
		best: findBestTimes(event, grid, roles, duration),
		sets: perWeek > 1 ? findMeetingSets(event, grid, roles, duration, perWeek as 2 | 3) : null,
		attendance: slotAttendance(event, roles),
		duration,
		perWeek,
		uid,
		now
	});
};

describe('buildOverview', () => {
	it('sums up the poll: its span, who responded, and the best times', () => {
		const overview = overviewOf(twoDays);
		expect(overview).toMatchObject({
			weekly: false,
			start: at('2026-10-12T09:00:00Z'),
			end: at('2026-10-13T12:00:00Z'),
			responses: 3,
			zone: 'UTC',
			duration: 60,
			perWeek: 1,
			considered: 2
		});
		expect(overview.best).toEqual({
			tier: 'everyone',
			count: 2,
			times: [
				{ starts: [at('2026-10-12T09:00:00Z')], end: at('2026-10-12T10:00:00Z'), free: 2 },
				{ starts: [at('2026-10-13T10:00:00Z')], end: at('2026-10-13T11:00:00Z'), free: 2 }
			]
		});
	});

	it('shades each hour by the share of people free, leaving out hours a day lacks', () => {
		expect(overviewOf(twoDays).heat).toEqual([
			{ day: '2026-10-12', hours: '95.' },
			{ day: '2026-10-13', hours: '.90' }
		]);
	});

	it('counts any availability at all, however little, as more than none', () => {
		const crowd: W2MEvent = {
			...twoDays,
			people: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` })),
			slots: [{ time: at('2026-10-12T09:00:00Z'), available: [1] }]
		};
		expect(overviewOf(crowd).heat).toEqual([{ day: '2026-10-12', hours: '1' }]);
	});

	it('averages the slots within an hour', () => {
		const halves: W2MEvent = {
			...twoDays,
			slotSeconds: 1800,
			slots: [
				{ time: at('2026-10-12T09:00:00Z'), available: [1, 2] },
				{ time: at('2026-10-12T09:30:00Z'), available: [] }
			]
		};
		expect(overviewOf(halves).heat).toEqual([{ day: '2026-10-12', hours: '5' }]);
	});

	it('leaves out times that have passed, falling back to the next best tier', () => {
		const afterMonday = overviewOf(twoDays, { now: at('2026-10-12T10:00:00Z') });
		expect(afterMonday.best?.count).toBe(1);
		expect(afterMonday.best?.times[0].starts).toEqual([at('2026-10-13T10:00:00Z')]);
		expect(overviewOf(twoDays, { now: at('2026-10-14T00:00:00Z') }).best).toBeNull();
	});

	it('keeps every time of a weekly poll, which comes round again', () => {
		const weekly = { ...twoDays, weekly: true };
		expect(overviewOf(weekly, { now: at('2030-01-01T00:00:00Z') }).best?.count).toBe(2);
	});

	it('uses the tier best times would show first, with who can make it', () => {
		const optional = overviewOf(twoDays, { roles: { 2: 'optional' }, duration: 120 });
		// Only Ana is free for two hours (Monday 9 to 11), and Ben is optional.
		expect(optional.best).toMatchObject({
			tier: 'required',
			count: 1,
			times: [{ starts: [at('2026-10-12T09:00:00Z')], free: 1 }]
		});
	});

	it('says whether the signed-in viewer has responded, for ThenToMeet events only', () => {
		expect(overviewOf(twoDays, { uid: 'u-ana' }).responded).toBe(true);
		expect(overviewOf(twoDays, { uid: 'u-new' }).responded).toBe(false);
		expect(overviewOf(twoDays).responded).toBeUndefined();
		expect(
			overviewOf({ ...twoDays, source: 'when2meet' }, { uid: 'u-ana' }).responded
		).toBeUndefined();
	});

	it('keeps at most a month of days in its heatmap', () => {
		const slots = Array.from({ length: 40 }, (_, day) => ({
			time: at('2026-10-01T09:00:00Z') + day * 24 * HOUR,
			available: [1]
		}));
		expect(overviewOf({ ...twoDays, slots }).heat).toHaveLength(OVERVIEW_DAYS);
	});

	it('reads the demo poll the same way the app does', () => {
		const demo = parseEvent(demoEventHtml(new Date('2026-09-23T12:00:00Z')), 'demo');
		const overview = overviewOf(demo, { zone: 'America/New_York' });
		expect(overview.best?.tier).toBe('everyone');
		expect(overview.heat.length).toBe(buildGrid(demo, 'America/New_York').days.length);
		expect(new Set(overview.heat.map((d) => d.hours.length)).size).toBe(1);
	});

	it('describes sets of meetings by every start', () => {
		// Monday to Friday 9 to 5 in quarter hours, everyone free 10 to 11 on Monday and Wednesday.
		const slots = [];
		for (let day = 0; day < 5; day++) {
			for (let hour = 9; hour < 17; hour += 0.25) {
				const free = (day === 0 || day === 2) && hour >= 10 && hour < 11;
				const time = at('2026-10-12T00:00:00Z') + (day * 24 + hour) * HOUR;
				slots.push({ time, available: free ? [1, 2] : [] });
			}
		}
		const overview = overviewOf({ ...twoDays, slotSeconds: 900, slots }, { perWeek: 2 });
		expect(overview.best?.times).toEqual([
			{
				starts: [at('2026-10-12T10:00:00Z'), at('2026-10-14T10:00:00Z')],
				end: at('2026-10-14T11:00:00Z'),
				free: 2
			}
		]);
	});
});

describe('reading an overview', () => {
	const overview = overviewOf(twoDays);

	it('knows when a dated poll has ended, and that a weekly one never does', () => {
		expect(hasEnded(overview, at('2026-10-13T11:59:00Z'))).toBe(false);
		expect(hasEnded(overview, at('2026-10-13T12:00:00Z'))).toBe(true);
		expect(hasEnded({ ...overview, weekly: true }, at('2030-01-01T00:00:00Z'))).toBe(false);
	});

	it('skips kept times that have passed since', () => {
		expect(upcomingTimes(overview, at('2026-10-12T12:00:00Z')).map((t) => t.starts[0])).toEqual([
			at('2026-10-13T10:00:00Z')
		]);
	});

	it('spells out a time as a day and a time range', () => {
		const { day, time } = describeTime(overview, overview.best!.times[0]);
		expect(day).toMatch(/Mon/);
		expect(time).toMatch(/9:00.*10:00/);
	});

	it('spans the dates, adding the year only when it is not this one', () => {
		const thisYear = DateTime.fromISO('2026-06-01T00:00:00Z');
		expect(describeDays(overview, thisYear)).toMatch(/Oct 12\s*–\s*13$/);
		expect(describeDays(overview, DateTime.fromISO('2027-06-01T00:00:00Z'))).toMatch(/2026/);
		// A poll that ends at midnight ends the day before.
		expect(
			formatDateSpan(at('2026-10-12T09:00:00Z'), at('2026-10-13T00:00:00Z'), 'UTC', thisYear)
		).toMatch(/^Oct 12$/);
	});

	it("names a weekly poll's days, as a run when they're back to back", () => {
		const weekly = (days: string[]) =>
			describeDays({ ...overview, weekly: true, heat: days.map((day) => ({ day, hours: '9' })) });
		// 5 January 1970 was a Monday.
		expect(weekly(['1970-01-05', '1970-01-06', '1970-01-07'])).toMatch(/^Mon\s*–\s*Wed$/);
		expect(weekly(['1970-01-05', '1970-01-07', '1970-01-09'])).toBe('Mon, Wed, Fri');
		expect(weekly([])).toBe('Weekly');
	});
});
