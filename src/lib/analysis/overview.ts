import { DateTime } from 'luxon';
import type { W2MEvent } from '$lib/types';
import type { BestTimes } from './bestTimes';
import { formatDay, formatMeetingSet, formatTimeRange } from './format';
import type { Grid } from './grid';
import type { MeetingSets, MeetingsPerWeek } from './meetingSets';

/*
 * What the home page shows about an event between visits. It's worked out from the event as the
 * viewer last had it set up (their roles, group, meeting length and timezone) and saved with
 * their other per-event data, so the home page can describe every recent event without reading
 * any of them again.
 */

/** How many of the best times an overview keeps, so it still has some once the first have passed. */
export const OVERVIEW_TIMES = 5;
/** Most days an overview's heatmap covers; past a month, columns are too thin to read anyway. */
export const OVERVIEW_DAYS = 31;

export type OverviewTier = 'everyone' | 'required' | 'near';

/** One of the best times: a window for one meeting, or the meetings of a set. */
export interface OverviewTime {
	/** When each meeting can start at the earliest, in Unix seconds: one, or one per meeting of a set. */
	starts: number[];
	/** When the window ends (for a set, the last meeting), in Unix seconds. */
	end: number;
	/** How many of the people counted can make it (every meeting, for a set). */
	free: number;
}

export interface OverviewBest {
	tier: OverviewTier;
	/** How many times that hadn't passed were in this tier when the overview was made. */
	count: number;
	/** The first of them, in the order best times lists them. */
	times: OverviewTime[];
}

/** A column of the overview's heatmap. */
export interface OverviewDay {
	/** The day's date in the overview's zone (1970 dates for weekly polls), as YYYY-MM-DD. */
	day: string;
	/**
	 * One character per hour, the same hours in every column: '0' to '9' for the share of people
	 * free in tenths (any at all is at least '1'), '.' for an hour the poll doesn't cover that day.
	 */
	hours: string;
}

export interface EventOverview {
	weekly: boolean;
	/** When the first slot starts and the last one ends, in Unix seconds. */
	start: number;
	end: number;
	/** Everyone who has responded, whether or not they've marked any times. */
	responses: number;
	/** The zone the times are shown in: the viewer's choice, or UTC for weekly polls. */
	zone: string;
	/** The meeting the best times are for: its length in minutes, and how many a week. */
	duration: number;
	perWeek: MeetingsPerWeek;
	/** The group whose best times these are, when one was being viewed. */
	group?: string;
	/** How many people count toward the best times (everyone who isn't skipped). */
	considered: number;
	/** The best times still ahead, from the best tier that has any; null when none comes close. */
	best: OverviewBest | null;
	heat: OverviewDay[];
	/** ThenToMeet events only, signed in: whether the viewer has added their times. */
	responded?: boolean;
}

export interface OverviewInput {
	event: W2MEvent;
	grid: Grid;
	best: BestTimes;
	/** Sets of meetings, when meeting two or three times a week. */
	sets: MeetingSets | null;
	/** Everyone counted who is free in each slot (see `slotAttendance`). */
	attendance: { counts: number[]; total: number };
	duration: number;
	perWeek: MeetingsPerWeek;
	group?: string | null;
	/** The signed-in viewer, to tell whether they've responded. */
	uid: string | null;
	/** Unix seconds. Times that have already passed are left out. */
	now: number;
}

const TIERS: OverviewTier[] = ['everyone', 'required', 'near'];

export const buildOverview = ({
	event,
	grid,
	best,
	sets,
	attendance,
	duration,
	perWeek,
	group,
	uid,
	now
}: OverviewInput): EventOverview => {
	const results: OverviewTime[][] = TIERS.map((tier) =>
		sets
			? sets[tier].map((set) => ({
					starts: set.starts,
					end: set.starts[set.starts.length - 1] + duration * 60,
					free: set.always.length
				}))
			: best[tier].map((block) => ({
					starts: [block.start],
					end: block.end,
					free: block.attendees.length
				}))
	);
	// A weekly poll's times come round again; a dated one's are gone once they've passed.
	const ahead = results.map((times) => (event.weekly ? times : times.filter((t) => t.end > now)));
	const index = ahead.findIndex((times) => times.length > 0);

	const overview: EventOverview = {
		weekly: event.weekly,
		start: event.slots[0]?.time ?? 0,
		end: (event.slots[event.slots.length - 1]?.time ?? 0) + event.slotSeconds,
		responses: event.people.length + event.noTimes.length,
		zone: grid.zone,
		duration,
		perWeek,
		considered: (sets ?? best).considered,
		best:
			index < 0
				? null
				: {
						tier: TIERS[index],
						count: ahead[index].length,
						times: ahead[index].slice(0, OVERVIEW_TIMES)
					},
		heat: heatColumns(grid, attendance)
	};
	if (group) overview.group = group;
	if (event.source === 'thentomeet' && uid) {
		overview.responded = [...event.people, ...event.noTimes].some((p) => p.uid === uid);
	}
	return overview;
};

/** The heatmap at a glance: each day's hours, shaded by the average share of people free. */
const heatColumns = (
	grid: Grid,
	{ counts, total }: { counts: number[]; total: number }
): OverviewDay[] => {
	const hours = [...new Set(grid.rows.map((row) => Math.floor(row.minute / 60)))].sort(
		(a, b) => a - b
	);
	return grid.days.slice(0, OVERVIEW_DAYS).map((day) => {
		const share = new Map<number, { sum: number; slots: number }>();
		for (const [minute, slot] of day.slotByMinute) {
			const hour = Math.floor(minute / 60);
			const cell = share.get(hour) ?? { sum: 0, slots: 0 };
			cell.sum += total ? counts[slot] / total : 0;
			cell.slots++;
			share.set(hour, cell);
		}
		const cells = hours.map((hour) => {
			const cell = share.get(hour);
			if (!cell) return '.';
			const mean = cell.sum / cell.slots;
			return String(mean > 0 ? Math.max(1, Math.round(mean * 9)) : 0);
		});
		return { day: day.key, hours: cells.join('') };
	});
};

/** Whether a dated poll's last day is over. Weekly polls never end. */
export const hasEnded = (
	poll: Pick<EventOverview, 'weekly' | 'end'>,
	now = Date.now() / 1000
): boolean => !poll.weekly && poll.end <= now;

/** The kept best times that haven't passed yet. */
export const upcomingTimes = (overview: EventOverview, now = Date.now() / 1000): OverviewTime[] =>
	(overview.best?.times ?? []).filter((t) => overview.weekly || t.end > now);

/** A best time as two lines: when ("Tue, Oct 14", or the days of a set) and what time. */
export const describeTime = (
	overview: EventOverview,
	time: OverviewTime
): { day: string; time: string } => {
	const { zone, weekly, duration } = overview;
	if (time.starts.length > 1) {
		const set = formatMeetingSet(time.starts, duration, zone);
		return { day: set.days, time: set.times };
	}
	return {
		day: formatDay(time.starts[0], zone, weekly),
		time: formatTimeRange(time.starts[0], time.end, zone)
	};
};

/**
 * The days a poll covers: "Oct 14 – 18" (with the year when it isn't this one), or a weekly
 * poll's days, "Mon – Fri" when they run together and "Mon, Wed, Fri" when they don't.
 */
export const describeDays = (overview: EventOverview, today: DateTime = DateTime.now()): string => {
	if (!overview.weekly) return formatDateSpan(overview.start, overview.end, overview.zone, today);
	const days = overview.heat.map((column) => DateTime.fromISO(column.day, { zone: 'UTC' }));
	if (!days.length) return 'Weekly';
	const together = days.every((d, i) => i === 0 || d.diff(days[i - 1], 'days').days === 1);
	const names = days.map((d) => d.toLocaleString({ weekday: 'short' }));
	return together && names.length > 2
		? `${names[0]} – ${names[names.length - 1]}`
		: names.join(', ');
};

/**
 * The dates from `start` to `end` (Unix seconds, end exclusive) in `zone`: "Oct 14 – 18", "Oct 14",
 * or "Dec 30, 2026 – Jan 2, 2027" when they aren't all this year.
 */
export const formatDateSpan = (
	start: number,
	end: number,
	zone: string,
	today: DateTime = DateTime.now()
): string => {
	const first = DateTime.fromSeconds(start, { zone });
	// A poll that runs to midnight ends on the day before.
	const last = DateTime.fromSeconds(Math.max(start, end - 1), { zone });
	const format = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: first.year === today.year && last.year === today.year ? undefined : 'numeric',
		timeZone: zone
	});
	return format.formatRange(first.toJSDate(), last.toJSDate());
};
