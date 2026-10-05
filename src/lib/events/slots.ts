import { DateTime } from 'luxon';
import { InvalidInput, MAX_SLOTS } from './model';

/*
 * Turns "these days, from 9 to 5, in 30-minute slots" into the slot start times an event stores
 * (Unix seconds). Dated events use real instants in the creator's timezone; weekly ones ("days of
 * the week") use When2Meet's convention of 1970 timestamps whose UTC wall clock is the intended
 * time, so they never shift with anyone's timezone.
 */

export interface SlotPlan {
	/** Days of the week (0 is Sunday) for a weekly event, or ISO dates (2026-10-03) for a dated one. */
	weekly: boolean;
	weekdays?: readonly number[];
	dates?: readonly string[];
	/** First hour of the day included (0 to 23), and the hour the last slot must end by (1 to 24). */
	startHour: number;
	endHour: number;
	slotSeconds: number;
	/** The creator's IANA timezone, for dated events. */
	zone: string;
}

/** 1970-01-04 was a Sunday, so a weekday's index is also its day offset from here. */
const WEEKLY_SUNDAY = Date.UTC(1970, 0, 4) / 1000;

const MAX_DAYS = 90;

export const buildSlots = (plan: SlotPlan): number[] => {
	const { startHour, endHour, slotSeconds } = plan;
	if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24) {
		throw new InvalidInput('Pick hours between 12 AM and 12 AM.');
	}
	if (startHour >= endHour) throw new InvalidInput('The day has to end after it starts.');
	const step = slotSeconds / 60;
	if (!Number.isInteger(step) || step < 1) throw new InvalidInput('Slots must be whole minutes.');

	const first = startHour * 60;
	const last = endHour * 60;
	const times = new Set<number>();

	if (plan.weekly) {
		const days = [...new Set(plan.weekdays ?? [])];
		if (!days.length) throw new InvalidInput('Pick at least one day of the week.');
		if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
			throw new InvalidInput('Days of the week are 0 to 6.');
		}
		for (const day of days) {
			for (let minute = first; minute + step <= last; minute += step) {
				times.add(WEEKLY_SUNDAY + day * 86400 + minute * 60);
			}
		}
	} else {
		const dates = [...new Set(plan.dates ?? [])];
		if (!dates.length) throw new InvalidInput('Pick at least one date.');
		if (dates.length > MAX_DAYS) throw new InvalidInput(`Pick up to ${MAX_DAYS} dates.`);
		for (const date of dates) {
			const day = DateTime.fromISO(date, { zone: plan.zone });
			if (!day.isValid) throw new InvalidInput(`"${date}" isn't a date.`);
			for (let minute = first; minute + step <= last; minute += step) {
				// Built from the wall-clock time, so a daylight saving change doesn't move the slots.
				const slot = DateTime.fromObject(
					{
						year: day.year,
						month: day.month,
						day: day.day,
						hour: Math.floor(minute / 60),
						minute: minute % 60
					},
					{ zone: plan.zone }
				);
				times.add(Math.floor(slot.toSeconds()));
			}
		}
	}

	if (times.size > MAX_SLOTS) {
		throw new InvalidInput(
			`That makes ${times.size} slots, and an event can have up to ${MAX_SLOTS}. Pick fewer days, fewer hours, or longer slots.`
		);
	}
	return [...times].sort((a, b) => a - b);
};
