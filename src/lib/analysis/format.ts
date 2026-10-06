import { DateTime } from 'luxon';

export const formatDuration = (minutes: number): string => {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (!h) return `${m}m`;
	return m ? `${h}h ${m}m` : `${h}h`;
};

/** "2:00 – 3:30 PM", letting the locale decide 12h vs 24h and how to share the meridiem. */
export const formatTimeRange = (start: number, end: number, zone: string): string => {
	const format = new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: zone
	});
	const a = new Date(start * 1000);
	const b = new Date(end * 1000);
	// formatRange spells out full dates when the ends fall on different days, which happens
	// whenever a block runs up to midnight. Times alone read fine there.
	const sameDay = DateTime.fromJSDate(a, { zone }).hasSame(DateTime.fromJSDate(b, { zone }), 'day');
	return sameDay ? format.formatRange(a, b) : `${format.format(a)} – ${format.format(b)}`;
};

export const formatTime = (seconds: number, zone: string): string =>
	DateTime.fromSeconds(seconds, { zone }).toLocaleString(DateTime.TIME_SIMPLE);

/** "Tue, Sep 23", or just "Tuesday" for weekly events. */
export const formatDay = (seconds: number, zone: string, weekly: boolean): string =>
	DateTime.fromSeconds(seconds, { zone }).toLocaleString(
		weekly ? { weekday: 'long' } : { weekday: 'short', month: 'short', day: 'numeric' }
	);

/** "Mon" */
export const formatWeekday = (seconds: number, zone: string): string =>
	DateTime.fromSeconds(seconds, { zone }).toLocaleString({ weekday: 'short' });

/** "Mon, Wed, and Fri" */
export const formatList = (items: string[]): string =>
	new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(items);

/**
 * A set of meetings a week: the days ("Mon, Wed, and Fri") and the times, which read as one range
 * when every meeting starts at the same time ("2:00 – 3:00 PM"), or each day's start otherwise
 * ("Mon 2:00 PM, Wed 2:30 PM").
 */
export const formatMeetingSet = (
	starts: number[],
	minutes: number,
	zone: string
): { days: string; times: string } => {
	const days = formatList(starts.map((t) => formatWeekday(t, zone)));
	const sameTime = starts.every((t) => formatTime(t, zone) === formatTime(starts[0], zone));
	const times = sameTime
		? formatTimeRange(starts[0], starts[0] + minutes * 60, zone)
		: starts.map((t) => `${formatWeekday(t, zone)} ${formatTime(t, zone)}`).join(', ');
	return { days, times };
};

/** Row label for a minute of the day: "9 AM", or "9:30 AM" off the hour. */
export const formatMinuteOfDay = (minute: number): string => {
	const dt = DateTime.fromObject({ hour: Math.floor(minute / 60), minute: minute % 60 });
	return dt.toLocaleString(minute % 60 ? DateTime.TIME_SIMPLE : { hour: 'numeric' });
};

/**
 * "GMT-4" style offset label for a zone, right now or at `at` (Unix seconds), which matters for
 * a time on the far side of a daylight saving change.
 */
export const formatOffset = (zone: string, at?: number): string => {
	const dt = (at === undefined ? DateTime.now() : DateTime.fromSeconds(at)).setZone(zone);
	if (!dt.isValid) return '';
	return dt.offset === 0 ? 'GMT' : `GMT${dt.toFormat('Z')}`;
};

/** A zone by its city: "New York" for America/New_York, and "UTC" as itself. */
export const zonePlace = (zone: string): string => zone.split('/').pop()!.replaceAll('_', ' ');

/**
 * A zone as people read it, the same everywhere it's shown: "New York time (GMT-4)". Pass `at`
 * for a specific time, so the offset is the one in effect then.
 */
export const formatZone = (zone: string, at?: number): string => {
	const offset = formatOffset(zone, at);
	if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
	return offset ? `${zonePlace(zone)} time (${offset})` : `${zonePlace(zone)} time`;
};

export const initials = (name: string): string => {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '?';
	const first = [...parts[0]][0] ?? '';
	const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
	return (first + last).toUpperCase();
};
