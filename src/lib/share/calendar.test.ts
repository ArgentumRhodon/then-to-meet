import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	byDayName,
	googleCalendarUrl,
	icsContent,
	meetingsFor,
	nextWeeklyOccurrence
} from './calendar';

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

describe('meetingsFor (several meetings)', () => {
	const zone = 'America/New_York';
	const event = {
		id: '123-abc',
		title: 'Study group',
		weekly: false,
		slotSeconds: 900,
		slots: [],
		people: [
			{ id: 1, name: 'Ada' },
			{ id: 2, name: 'Bo' },
			{ id: 3, name: 'Cy' }
		],
		noTimes: [],
		fetchedAt: 0
	};
	const nameOf = (id: number) => event.people.find((p) => p.id === id)!.name;
	/** Meetings `minutes` long at these starts; Cy misses the second one. */
	const plan = (starts: number[], minutes = 60) =>
		starts.map((start, i) => ({
			start,
			end: start + minutes * 60,
			attendees: i === 1 ? [1, 2] : [1, 2, 3],
			missing: i === 1 ? [3] : []
		}));
	// Mon Sep 28, Wed Sep 30, and Fri Oct 2, 2026 at 2 PM in New York.
	const mwf = [at('2026-09-28T18:00:00Z'), at('2026-09-30T18:00:00Z'), at('2026-10-02T18:00:00Z')];

	it('makes one event repeating on each day when the times match', () => {
		const [only, ...rest] = meetingsFor(event, plan(mwf), zone, true, nameOf);
		expect(rest).toEqual([]);
		expect(only).toMatchObject({ start: mwf[0], end: mwf[0] + 3600, byDay: ['MO', 'WE', 'FR'] });
		expect(new URL(googleCalendarUrl(only)).searchParams.get('recur')).toBe(
			'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'
		);
		expect(icsContent(only)).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
	});

	it('describes the whole schedule and who can make each meeting', () => {
		const [only] = meetingsFor(event, plan(mwf), zone, true, nameOf);
		const lines = only.details.split('\n');
		expect(lines[0]).toBe('Meets three times a week, New York time (GMT-4):');
		expect(lines[1]).toMatch(/^• Monday, 2:00.*3:00.PM: everyone can make it$/);
		expect(lines[2]).toMatch(/^• Wednesday, 2:00.*: without Cy$/);
		expect(lines[3]).toMatch(/^• Friday, /);
		expect(only.details).toContain('At every meeting: Ada, Bo');
		expect(only.details).toMatch(
			/Picked with ThenToMeet from https:\/\/www\.when2meet\.com\/\?123-abc$/
		);
		// Google Calendar gets the same text.
		expect(new URL(googleCalendarUrl(only)).searchParams.get('details')).toBe(only.details);
	});

	it('stops after the one week when a dated poll’s set shouldn’t repeat', () => {
		const [only] = meetingsFor(event, plan(mwf), zone, false, nameOf);
		expect(new URL(googleCalendarUrl(only)).searchParams.get('recur')).toBe(
			'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=3'
		);
		// One-offs keep their dates.
		expect(only.details).toMatch(/^3 meetings, New York time \(GMT-4\):\n• Mon, Sep 28, /);
	});

	it('gives each meeting its own event when the times differ, and marks which is which', () => {
		const tueThu = [at('2026-09-29T18:00:00Z'), at('2026-10-01T18:30:00Z')];
		const once = meetingsFor(event, plan(tueThu), zone, false, nameOf);
		expect(once).toHaveLength(2);
		const ics = icsContent(once);
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(ics).not.toContain('RRULE');
		expect(once[0].details).toMatch(/• Tue, Sep 29, [^\n]* \(this event\): everyone/);
		expect(once[1].details).toMatch(/• Thu, Oct 1, [^\n]* \(this event\): without Cy/);
		expect(once[0].details).not.toMatch(/Thu[^\n]*\(this event\)/);

		const weekly = meetingsFor(event, plan(tueThu), zone, true, nameOf);
		expect(icsContent(weekly).match(/RRULE:FREQ=WEEKLY\r\n/g)).toHaveLength(2);
		expect(weekly[0].details).toMatch(/^Meets twice a week/);
	});

	it('groups the meetings that share a time, and gives the rest their own events', () => {
		// Tue and Thu at 2 PM, then Fri at 11 AM, in New York.
		const mixed = [
			at('2026-09-29T18:00:00Z'),
			at('2026-10-01T18:00:00Z'),
			at('2026-10-02T15:00:00Z')
		];
		const [tueThu, fri, ...rest] = meetingsFor(event, plan(mixed), zone, false, nameOf);
		expect(rest).toEqual([]);
		expect(tueThu).toMatchObject({ byDay: ['TU', 'TH'], count: 2 });
		expect(fri.byDay).toBeUndefined();
		expect(tueThu.details.match(/\(this event\)/g)).toHaveLength(2);
		expect(fri.details).toMatch(/• Fri, Oct 2, [^\n]* \(this event\)/);
		expect(byDayName('TU')).toBe('Tue');
	});

	it('keeps separate events when one repeating event would land on the wrong days', () => {
		// Same time, but eight days apart: a Mon/Tue rule from the Monday would add Tue Sep 29.
		const apart = [at('2026-09-28T18:00:00Z'), at('2026-10-06T18:00:00Z')];
		expect(meetingsFor(event, plan(apart), zone, false, nameOf)).toHaveLength(2);
		// Two Mondays at the same time: one weekday can't cover both dates.
		const mondays = [at('2026-09-28T18:00:00Z'), at('2026-10-05T18:00:00Z')];
		expect(meetingsFor(event, plan(mondays), zone, false, nameOf)).toHaveLength(2);
	});

	it('always repeats a weekly poll’s set, from the next occurrence', () => {
		// Weekly poll wall-clock times: Jan 5 and Jan 7, 1970 were a Monday and a Wednesday.
		const starts = [at('1970-01-05T09:00:00Z'), at('1970-01-07T09:00:00Z')];
		const [only] = meetingsFor({ ...event, weekly: true }, plan(starts, 45), zone, false, nameOf);
		expect(only.byDay?.sort()).toEqual(['MO', 'WE']);
		expect(only.count).toBeUndefined();
		expect(DateTime.fromSeconds(only.start, { zone }).toFormat('HH:mm')).toBe('09:00');
		expect(only.end - only.start).toBe(45 * 60);
		expect(only.details).toMatch(/^Meets twice a week/);
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
