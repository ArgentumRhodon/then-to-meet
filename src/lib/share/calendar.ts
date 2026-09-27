import { DateTime, type WeekdayNumbers } from 'luxon';
import { formatDay, formatTimeRange } from '$lib/analysis/format';
import type { TimeRange, W2MEvent } from '$lib/types';
import { DEMO_ID, eventUrl } from '$lib/w2m/id';

export interface CalendarMeeting {
	title: string;
	/** Unix seconds. */
	start: number;
	end: number;
	details: string;
	/**
	 * Repeat every week at the same local time in this zone. Used for "days of the week" polls,
	 * which describe a recurring slot rather than one date, and for meeting several times a week.
	 */
	repeatWeeklyIn?: string;
	/** Weekdays to repeat on, as RRULE codes like "MO". Without it, the start's own weekday. */
	byDay?: string[];
	/** Stop after this many meetings instead of repeating for good. */
	count?: number;
}

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** "Tue" for an RRULE weekday code like "TU". */
export const byDayName = (code: string): string =>
	DateTime.fromObject({ weekday: (WEEKDAYS.indexOf(code) + 1) as WeekdayNumbers }).toLocaleString({
		weekday: 'short'
	});

const weeklyRule = ({ byDay, count }: CalendarMeeting): string =>
	'RRULE:FREQ=WEEKLY' +
	(byDay ? `;BYDAY=${byDay.join(',')}` : '') +
	(count ? `;COUNT=${count}` : '');

const detailsFor = (event: W2MEvent): string =>
	`Picked with ThenToMeet from ${event.id === DEMO_ID ? 'a demo poll' : eventUrl(event.id)}`;

const utcStamp = (seconds: number): string =>
	DateTime.fromSeconds(seconds, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");

const localStamp = (seconds: number, zone: string): string =>
	DateTime.fromSeconds(seconds, { zone }).toFormat("yyyyMMdd'T'HHmmss");

/**
 * The next real date for a weekly poll's slot. Weekly polls store times as UTC wall-clock
 * timestamps from the 1970s, so this finds the next matching weekday and time in `zone`.
 */
export const nextWeeklyOccurrence = (
	wallClock: number,
	zone: string,
	now: Date = new Date()
): number => {
	const wall = DateTime.fromSeconds(wallClock, { zone: 'utc' });
	const today = DateTime.fromJSDate(now, { zone });
	let next = today
		.set({ hour: wall.hour, minute: wall.minute, second: 0, millisecond: 0 })
		.plus({ days: (wall.weekday - today.weekday + 7) % 7 });
	if (next <= today) next = next.plus({ weeks: 1 });
	return next.toSeconds();
};

/**
 * The calendar entry for a time picked from an event. Weekly polls have no real dates, so they
 * export the next occurrence as a weekly repeating event in the viewer's own timezone.
 */
export const meetingFor = (
	event: W2MEvent,
	start: number,
	end: number,
	zone: string
): CalendarMeeting => {
	const at = event.weekly ? nextWeeklyOccurrence(start, zone) : start;
	return {
		title: event.title,
		start: at,
		end: at + (end - start),
		details: detailsFor(event),
		repeatWeeklyIn: event.weekly ? zone : undefined
	};
};

/** One of several meetings being added to a calendar, and who can make it. */
export interface PlannedMeeting extends TimeRange {
	attendees: number[];
	missing: number[];
}

const WEEK = 7 * 86_400;

const howOften = (count: number) =>
	count === 2 ? 'twice' : count === 3 ? 'three times' : `${count} times`;

/**
 * Calendar entries for meeting several times: a set of meetings a week, or several picked times.
 * Meetings at the same local time and length, on different days of one week, become a single event
 * repeating on each of those days (Tue/Thu at 2); any others get their own events. Weekly polls
 * always repeat; for dated ones, `repeat` decides whether the pattern carries on every week or
 * stays as picked.
 *
 * Every event's description lays out the whole schedule and who can make each meeting, marking
 * which ones that event covers, since that's what people see when they open it in their calendar.
 * `nameOf` labels a person.
 */
export const meetingsFor = (
	event: W2MEvent,
	meetings: PlannedMeeting[],
	zone: string,
	repeat: boolean,
	nameOf: (id: number) => string
): CalendarMeeting[] => {
	const weekly = event.weekly || repeat;
	const planned = meetings
		.map((m) => {
			const start = event.weekly ? nextWeeklyOccurrence(m.start, zone) : m.start;
			return { ...m, start, end: start + (m.end - m.start) };
		})
		.sort((a, b) => a.start - b.start);
	const local = planned.map((m) => DateTime.fromSeconds(m.start, { zone }));
	const weekdays = local.map((d) => WEEKDAYS[d.weekday - 1]);

	// Group meetings by local time and length. Starting on a group's first meeting, a weekly rule on
	// its days hits every one of them in turn, as long as they fall on different days within a week;
	// a group that doesn't splits into one event per meeting.
	const byShape = new Map<string, number[]>();
	planned.forEach((m, i) => {
		const shape = `${local[i].toFormat('HH:mm')}/${m.end - m.start}`;
		byShape.set(shape, [...(byShape.get(shape) ?? []), i]);
	});
	const events = [...byShape.values()].flatMap((group) => {
		const days = group.map((i) => weekdays[i]);
		const fits =
			new Set(days).size === days.length &&
			planned[group[group.length - 1]].start - planned[group[0]].start < WEEK;
		return fits ? [group] : group.map((i) => [i]);
	});

	/** The description, with the meetings `focus` covers marked when there's more than one event. */
	const details = (focus: number[]) => {
		const everyTime = event.people.filter((p) => planned.every((m) => m.attendees.includes(p.id)));
		const lines = [
			weekly
				? `Meets ${howOften(planned.length)} a week (${zone.replaceAll('_', ' ')}):`
				: `${planned.length} meetings (${zone.replaceAll('_', ' ')}):`,
			...planned.map((m, i) => {
				// A repeating meeting is "Tuesday"; a one-off keeps its date.
				const when = `${formatDay(m.start, zone, weekly)}, ${formatTimeRange(m.start, m.end, zone)}`;
				const who = m.missing.length
					? `without ${m.missing.map(nameOf).join(', ')}`
					: 'everyone can make it';
				const mark = events.length > 1 && focus.includes(i) ? ' (this event)' : '';
				return `• ${when}${mark}: ${who}`;
			})
		];
		if (planned.some((m) => m.missing.length) && everyTime.length) {
			lines.push('', `At every meeting: ${everyTime.map((p) => nameOf(p.id)).join(', ')}`);
		}
		lines.push('', detailsFor(event));
		return lines.join('\n');
	};

	return events
		.map((group): CalendarMeeting => {
			const first = planned[group[0]];
			const shared = {
				title: event.title,
				details: planned.length > 1 ? details(group) : detailsFor(event),
				start: first.start,
				end: first.end
			};
			if (group.length === 1) return { ...shared, repeatWeeklyIn: weekly ? zone : undefined };
			return {
				...shared,
				repeatWeeklyIn: zone,
				byDay: group.map((i) => weekdays[i]),
				count: weekly ? undefined : group.length
			};
		})
		.sort((a, b) => a.start - b.start);
};

export const googleCalendarUrl = (meeting: CalendarMeeting): string => {
	const { title, start, end, details, repeatWeeklyIn: zone } = meeting;
	const params = new URLSearchParams({ action: 'TEMPLATE', text: title, details });
	if (zone) {
		// Local times plus ctz keep a repeating meeting at the same time across DST changes.
		params.set('dates', `${localStamp(start, zone)}/${localStamp(end, zone)}`);
		params.set('ctz', zone);
		params.set('recur', weeklyRule(meeting));
	} else {
		params.set('dates', `${utcStamp(start)}/${utcStamp(end)}`);
	}
	return `https://calendar.google.com/calendar/render?${params}`;
};

const escapeIcs = (text: string): string =>
	text
		.replace(/\\/g, '\\\\')
		.replace(/\n/g, '\\n')
		.replace(/([,;])/g, '\\$1');

/** Folds lines to the 75-octet limit from RFC 5545 (approximated by characters). */
const fold = (line: string): string => line.match(/.{1,74}/g)?.join('\r\n ') ?? line;

const vevent = (meeting: CalendarMeeting): string[] => {
	const { title, start, end, details, repeatWeeklyIn: zone } = meeting;
	const when = zone
		? [
				`DTSTART;TZID=${zone}:${localStamp(start, zone)}`,
				`DTEND;TZID=${zone}:${localStamp(end, zone)}`,
				weeklyRule(meeting)
			]
		: [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`];
	return [
		'BEGIN:VEVENT',
		`UID:${start}-${end}-${Math.random().toString(36).slice(2)}@thentomeet`,
		`DTSTAMP:${utcStamp(Date.now() / 1000)}`,
		...when,
		`SUMMARY:${escapeIcs(title)}`,
		`DESCRIPTION:${escapeIcs(details)}`,
		'END:VEVENT'
	];
};

/** A calendar file with one event, or several (a set of meetings at different times). */
export const icsContent = (meetings: CalendarMeeting | CalendarMeeting[]): string =>
	[
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//ThenToMeet//EN',
		'CALSCALE:GREGORIAN',
		...[meetings].flat().flatMap(vevent),
		'END:VCALENDAR'
	]
		.map(fold)
		.join('\r\n');

export const downloadIcs = (meetings: CalendarMeeting | CalendarMeeting[]): void => {
	const [first] = [meetings].flat();
	const blob = new Blob([icsContent(meetings)], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${first.title.replace(/[^\w\- ]+/g, '').trim() || 'meeting'}.ics`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
