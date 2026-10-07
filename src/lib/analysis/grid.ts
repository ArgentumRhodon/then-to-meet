import { DateTime } from 'luxon';
import type { W2MEvent } from '$lib/types';

export interface GridDay {
	key: string;
	weekday: string;
	/** Short date like "Sep 23", or null for weekly events. */
	date: string | null;
	/** Day of the month, or null for weekly events. */
	dayOfMonth: number | null;
	/** Index into `event.slots`, keyed by minute of the day in the display zone. */
	slotByMinute: Map<number, number>;
}

export interface GridRow {
	minute: number;
	/** True when this row starts a new hour. */
	hour: boolean;
	/** True when the previous row isn't the immediately preceding slot (e.g. a lunch gap). */
	gapBefore: boolean;
}

export interface Grid {
	zone: string;
	/** Length of each slot, which is how far apart rows are unless the day has a gap. */
	slotSeconds: number;
	days: GridDay[];
	rows: GridRow[];
	/** Grid day index for each slot in `event.slots`. */
	dayOfSlot: number[];
}

/** Weekly events are stored as UTC wall-clock times, so they ignore the chosen zone. */
export const displayZone = (event: W2MEvent, zone: string): string => (event.weekly ? 'UTC' : zone);

export const slotStart = (event: W2MEvent, index: number, zone: string): DateTime =>
	DateTime.fromSeconds(event.slots[index].time, { zone: displayZone(event, zone) });

/**
 * Lays slots out as days × times-of-day in the display zone. Rows are the union of every
 * day's times, so days with different ranges (or ranges shifted across midnight by a
 * timezone change) still line up.
 */
export const buildGrid = (event: W2MEvent, zone: string): Grid => {
	const tz = displayZone(event, zone);
	const days: GridDay[] = [];
	const dayIndex = new Map<string, number>();
	const dayOfSlot: number[] = [];
	const minutes = new Set<number>();

	event.slots.forEach((slot, i) => {
		const dt = DateTime.fromSeconds(slot.time, { zone: tz });
		const key = dt.toISODate()!;
		let d = dayIndex.get(key);
		if (d === undefined) {
			d = days.length;
			dayIndex.set(key, d);
			days.push({
				key,
				weekday: dt.toLocaleString({ weekday: 'short' }),
				date: event.weekly ? null : dt.toLocaleString({ month: 'short', day: 'numeric' }),
				dayOfMonth: event.weekly ? null : dt.day,
				slotByMinute: new Map()
			});
		}
		const minute = dt.hour * 60 + dt.minute;
		days[d].slotByMinute.set(minute, i);
		dayOfSlot[i] = d;
		minutes.add(minute);
	});

	const step = event.slotSeconds / 60;
	const sorted = [...minutes].sort((a, b) => a - b);
	const rows: GridRow[] = sorted.map((minute, i) => ({
		minute,
		hour: minute % 60 === 0,
		gapBefore: i > 0 && minute - sorted[i - 1] > step
	}));

	return { zone: tz, slotSeconds: event.slotSeconds, days, rows, dayOfSlot };
};
