import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildGrid } from '$lib/analysis/grid';
import { InvalidInput } from './model';
import { buildSlots } from './slots';

const base = { startHour: 9, endHour: 11, slotSeconds: 1800, zone: 'America/New_York' };
const local = (iso: string, zone = base.zone) => DateTime.fromISO(iso, { zone }).toSeconds();

describe('buildSlots, dated', () => {
	it('makes one slot per step between the hours, on each date, in the creator’s zone', () => {
		const slots = buildSlots({ ...base, weekly: false, dates: ['2026-10-05', '2026-10-06'] });
		expect(slots).toEqual([
			local('2026-10-05T09:00'),
			local('2026-10-05T09:30'),
			local('2026-10-05T10:00'),
			local('2026-10-05T10:30'),
			local('2026-10-06T09:00'),
			local('2026-10-06T09:30'),
			local('2026-10-06T10:00'),
			local('2026-10-06T10:30')
		]);
	});

	it('sorts dates given out of order and drops duplicates', () => {
		const slots = buildSlots({
			...base,
			weekly: false,
			dates: ['2026-10-06', '2026-10-05', '2026-10-05']
		});
		expect(slots).toHaveLength(8);
		expect(slots).toEqual([...slots].sort((a, b) => a - b));
	});

	it('keeps the same wall-clock times across a daylight saving change', () => {
		// US clocks go back on 2026-11-01.
		const slots = buildSlots({
			...base,
			startHour: 8,
			endHour: 9,
			slotSeconds: 3600,
			weekly: false,
			dates: ['2026-10-31', '2026-11-01', '2026-11-02']
		});
		expect(slots).toEqual([
			local('2026-10-31T08:00'),
			local('2026-11-01T08:00'),
			local('2026-11-02T08:00')
		]);
		// 24h apart is wrong on the day the clocks change: it's 25 hours from Oct 31 to Nov 1's 8 AM.
		expect(slots[1] - slots[0]).toBe(25 * 3600);
	});

	it('last slot ends by the end hour, and midnight can be the end', () => {
		const slots = buildSlots({
			...base,
			startHour: 22,
			endHour: 24,
			slotSeconds: 3600,
			weekly: false,
			dates: ['2026-10-05']
		});
		expect(slots).toEqual([local('2026-10-05T22:00'), local('2026-10-05T23:00')]);
	});

	it('works in other zones', () => {
		const slots = buildSlots({
			...base,
			zone: 'Asia/Tokyo',
			startHour: 9,
			endHour: 10,
			slotSeconds: 3600,
			weekly: false,
			dates: ['2026-10-05']
		});
		expect(slots).toEqual([local('2026-10-05T09:00', 'Asia/Tokyo')]);
	});

	it('shows up in the app’s grid on the right days and times', () => {
		const slots = buildSlots({ ...base, weekly: false, dates: ['2026-10-05', '2026-10-07'] });
		const event = {
			id: 'x',
			title: 't',
			weekly: false,
			slotSeconds: 1800,
			slots: slots.map((time) => ({ time, available: [] })),
			people: [],
			noTimes: [],
			fetchedAt: 0
		};
		const grid = buildGrid(event, base.zone);
		expect(grid.days.map((d) => d.key)).toEqual(['2026-10-05', '2026-10-07']);
		expect(grid.rows.map((r) => r.minute)).toEqual([540, 570, 600, 630]);
	});
});

describe('buildSlots, weekly', () => {
	it('uses 1970 timestamps whose UTC wall clock is the time, so any weekday maps to itself', () => {
		const slots = buildSlots({ ...base, weekly: true, weekdays: [1, 3] });
		expect(slots).toHaveLength(8);
		const days = slots.map((t) => DateTime.fromSeconds(t, { zone: 'UTC' }));
		expect(days.every((d) => d.year === 1970)).toBe(true);
		expect(days.map((d) => d.weekdayLong)).toEqual([
			...Array(4).fill('Monday'),
			...Array(4).fill('Wednesday')
		]);
		expect(days[0].hour).toBe(9);
		expect(days[3].minute).toBe(30);
	});

	it('reads as a weekly event to the app, whatever zone it is viewed in', () => {
		const slots = buildSlots({ ...base, weekly: true, weekdays: [0, 6] });
		const event = {
			id: 'x',
			title: 't',
			weekly: true,
			slotSeconds: 1800,
			slots: slots.map((time) => ({ time, available: [] })),
			people: [],
			noTimes: [],
			fetchedAt: 0
		};
		const grid = buildGrid(event, 'Asia/Tokyo');
		expect(grid.days.map((d) => d.weekday)).toEqual(['Sun', 'Sat']);
		expect(grid.rows[0].minute).toBe(540);
	});

	it('is before When2Meet’s weekly cutoff, which is how weekly events are recognized', () => {
		const [first] = buildSlots({ ...base, weekly: true, weekdays: [6] });
		expect(first).toBeLessThan(Date.UTC(1980, 0, 1) / 1000);
	});
});

describe('buildSlots, problems', () => {
	const bad = (plan: Parameters<typeof buildSlots>[0]) =>
		expect(() => buildSlots(plan)).toThrow(InvalidInput);

	it('needs days, and a day that ends after it starts', () => {
		bad({ ...base, weekly: false, dates: [] });
		bad({ ...base, weekly: true, weekdays: [] });
		bad({ ...base, weekly: false, dates: ['2026-10-05'], startHour: 17, endHour: 9 });
		bad({ ...base, weekly: false, dates: ['2026-10-05'], startHour: 9, endHour: 9 });
	});

	it('rejects nonsense days and hours', () => {
		bad({ ...base, weekly: true, weekdays: [7] });
		bad({ ...base, weekly: false, dates: ['not-a-date'] });
		bad({ ...base, weekly: false, dates: ['2026-10-05'], endHour: 25 });
		bad({ ...base, weekly: false, dates: ['2026-10-05'], startHour: -1 });
	});

	it('refuses more slots than an event can hold, and says how to fix it', () => {
		const dates = Array.from({ length: 60 }, (_, i) =>
			DateTime.utc(2026, 11, 1).plus({ days: i }).toISODate()!
		);
		expect(() =>
			buildSlots({ ...base, weekly: false, dates, startHour: 0, endHour: 24, slotSeconds: 900 })
		).toThrow(/Pick fewer days/);
	});
});
