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

/** Row label for a minute of the day: "9 AM", or "9:30 AM" off the hour. */
export const formatMinuteOfDay = (minute: number): string => {
	const dt = DateTime.fromObject({ hour: Math.floor(minute / 60), minute: minute % 60 });
	return dt.toLocaleString(minute % 60 ? DateTime.TIME_SIMPLE : { hour: 'numeric' });
};

/** "GMT-4" style offset label for a zone right now. */
export const formatOffset = (zone: string): string => {
	const dt = DateTime.now().setZone(zone);
	if (!dt.isValid) return '';
	return dt.offset === 0 ? 'GMT' : `GMT${dt.toFormat('Z')}`;
};

export const initials = (name: string): string => {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '?';
	const first = [...parts[0]][0] ?? '';
	const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
	return (first + last).toUpperCase();
};
