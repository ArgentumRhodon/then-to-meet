import { DateTime } from 'luxon';

export interface CalendarMeeting {
	title: string;
	/** Unix seconds. */
	start: number;
	end: number;
	details: string;
	/**
	 * Repeat every week at the same local time in this zone. Used for "days of the week" polls,
	 * which describe a recurring slot rather than one date.
	 */
	repeatWeeklyIn?: string;
}

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

export const googleCalendarUrl = ({
	title,
	start,
	end,
	details,
	repeatWeeklyIn: zone
}: CalendarMeeting): string => {
	const params = new URLSearchParams({ action: 'TEMPLATE', text: title, details });
	if (zone) {
		// Local times plus ctz keep a repeating meeting at the same time across DST changes.
		params.set('dates', `${localStamp(start, zone)}/${localStamp(end, zone)}`);
		params.set('ctz', zone);
		params.set('recur', 'RRULE:FREQ=WEEKLY');
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

export const icsContent = ({
	title,
	start,
	end,
	details,
	repeatWeeklyIn: zone
}: CalendarMeeting): string => {
	const when = zone
		? [
				`DTSTART;TZID=${zone}:${localStamp(start, zone)}`,
				`DTEND;TZID=${zone}:${localStamp(end, zone)}`,
				'RRULE:FREQ=WEEKLY'
			]
		: [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`];
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//ThenToMeet//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${start}-${end}-${Math.random().toString(36).slice(2)}@thentomeet`,
		`DTSTAMP:${utcStamp(Date.now() / 1000)}`,
		...when,
		`SUMMARY:${escapeIcs(title)}`,
		`DESCRIPTION:${escapeIcs(details)}`,
		'END:VEVENT',
		'END:VCALENDAR'
	]
		.map(fold)
		.join('\r\n');
};

export const downloadIcs = (meeting: CalendarMeeting): void => {
	const blob = new Blob([icsContent(meeting)], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${meeting.title.replace(/[^\w\- ]+/g, '').trim() || 'meeting'}.ics`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
