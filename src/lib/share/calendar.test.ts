import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, icsContent, nextWeeklyOccurrence } from './calendar';

const at = (iso: string) => Date.parse(iso) / 1000;
const meeting = {
	title: 'Design sync',
	start: at('2026-09-29T18:00:00Z'),
	end: at('2026-09-29T19:00:00Z'),
	details: 'From ThenToMeet'
};

describe('Google Calendar links', () => {
	it('uses exact UTC times for dated polls', () => {
		const url = new URL(googleCalendarUrl(meeting));
		expect(url.searchParams.get('dates')).toBe('20260929T180000Z/20260929T190000Z');
		expect(url.searchParams.get('recur')).toBeNull();
	});

	it('repeats weekly in the viewer’s zone for weekly polls', () => {
		const url = new URL(googleCalendarUrl({ ...meeting, repeatWeeklyIn: 'America/New_York' }));
		expect(url.searchParams.get('dates')).toBe('20260929T140000/20260929T150000');
		expect(url.searchParams.get('ctz')).toBe('America/New_York');
		expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY');
	});
});

describe('.ics files', () => {
	it('writes a weekly rule with the local zone', () => {
		const ics = icsContent({ ...meeting, repeatWeeklyIn: 'America/New_York' });
		expect(ics).toContain('DTSTART;TZID=America/New_York:20260929T140000');
		expect(ics).toContain('RRULE:FREQ=WEEKLY');
	});

	it('writes UTC times for a one-off meeting', () => {
		const ics = icsContent(meeting);
		expect(ics).toContain('DTSTART:20260929T180000Z');
		expect(ics).not.toContain('RRULE');
	});
});

describe('nextWeeklyOccurrence', () => {
	// A weekly poll's "Tuesday 9:00 AM" slot: Jan 6, 1970 was a Tuesday.
	const tuesday9am = at('1970-01-06T09:00:00Z');
	const zone = 'America/New_York';
	const local = (s: number) => DateTime.fromSeconds(s, { zone }).toFormat('ccc yyyy-MM-dd HH:mm');

	it('finds the coming Tuesday at that local time', () => {
		// Wednesday, Sep 23 2026 at noon New York time.
		const now = new Date('2026-09-23T16:00:00Z');
		expect(local(nextWeeklyOccurrence(tuesday9am, zone, now))).toBe('Tue 2026-09-29 09:00');
	});

	it('uses today if the time hasn’t passed yet, next week if it has', () => {
		const earlyTuesday = new Date('2026-09-29T11:00:00Z'); // 7 AM in New York
		const lateTuesday = new Date('2026-09-29T15:00:00Z'); // 11 AM in New York
		expect(local(nextWeeklyOccurrence(tuesday9am, zone, earlyTuesday))).toBe(
			'Tue 2026-09-29 09:00'
		);
		expect(local(nextWeeklyOccurrence(tuesday9am, zone, lateTuesday))).toBe('Tue 2026-10-06 09:00');
	});
});
