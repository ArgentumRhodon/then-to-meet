import { DateTime } from 'luxon';
import type { Roles, W2MEvent } from '$lib/types';
import { classify, contiguousRuns, whoCounts, type Tier, type TimeBlock } from './bestTimes';
import type { Grid } from './grid';

/** How many times a week the group wants to meet. */
export type MeetingsPerWeek = 1 | 2 | 3;

/**
 * Start times in one set may differ by this much and still count as "the same time", like a
 * class at 2:00 on Mondays and 2:30 on Wednesdays.
 */
export const SAME_TIME_MINUTES = 30;
/** Meetings need a day off between them (Mon/Wed/Fri, Tue/Thu), counting the wrap to next week. */
const MIN_DAY_GAP = 2;
const MAX_RESULTS = 60;

/** Two or three meetings a week at about the same time of day, on days with a gap between. */
export interface MeetingSet {
	id: string;
	tier: Tier;
	/**
	 * One block per meeting, in day order. Each covers every start the set allows, like a best-times
	 * window, and lists who can make that meeting.
	 */
	sessions: TimeBlock[];
	/** When each meeting starts at the earliest option, Unix seconds. */
	starts: number[];
	/** How much later every meeting can start, together, with the same people, in seconds. */
	flex: number;
	/** Minutes between the earliest and latest start time of day. */
	spread: number;
	/** People who can make every meeting. */
	always: number[];
	/** Everyone who misses at least one meeting, and the required people among them. */
	missing: number[];
	requiredMissing: number[];
}

export interface MeetingSets {
	everyone: MeetingSet[];
	/** Every required person at every meeting, but some optional people miss one. */
	required: MeetingSet[];
	/** One person misses one or more meetings. */
	near: MeetingSet[];
	/** Everything else with at least two people at each meeting. A fallback for tough polls. */
	fewer: MeetingSet[];
	considered: number;
	requiredCount: number;
}

/** One place a meeting could start, and who could make it. */
interface Option {
	slot: number;
	/** Start as minutes into the day, in the grid's zone. */
	minute: number;
	attendees: number[];
	missing: number[];
	requiredMissing: number[];
}

/** A day-by-day pick of options, before runs of them are merged into windows. */
interface Candidate {
	days: number[];
	options: Option[];
	tier: Tier;
	rank: number[];
	spread: number;
	missing: number[];
	requiredMissing: number[];
	/** Days, relative start times, and who's at each meeting: what a merged window keeps fixed. */
	shape: string;
}

const TIER_RANK: Record<Tier, number> = { everyone: 0, required: 1, near: 2, fewer: 3 };

/**
 * Finds the best ways to meet two or three times a week: the same meeting length each time, at
 * about the same time of day, with at least a day between meetings. Ranked by the worst meeting
 * first, so a set where everyone makes every meeting beats one where each meeting loses someone.
 */
export const findMeetingSets = (
	event: W2MEvent,
	grid: Grid,
	roles: Roles,
	durationMinutes: number,
	count: 2 | 3
): MeetingSets => {
	const { considered, required } = whoCounts(event, roles);
	const result: MeetingSets = {
		everyone: [],
		required: [],
		near: [],
		fewer: [],
		considered: considered.length,
		requiredCount: required.length
	};
	if (!considered.length) return result;

	const requiredSet = new Set(required);
	const k = Math.max(1, Math.ceil((durationMinutes * 60) / event.slotSeconds));
	const step = event.slotSeconds / 60;
	const byDay = optionsByDay(event, grid, considered, requiredSet, k);
	const minAttendees = Math.min(2, considered.length);

	const found: Candidate[] = [];
	const extend = (days: number[], chosen: Option[]) => {
		if (chosen.length === days.length) {
			found.push(evaluate(days, chosen, requiredSet, required.length));
			return;
		}
		const options = byDay[days[chosen.length]];
		if (!chosen.length) {
			for (const option of options.values()) {
				if (option.attendees.length >= minAttendees) extend(days, [option]);
			}
			return;
		}
		// Only starts within SAME_TIME_MINUTES of every meeting picked so far.
		const minutes = chosen.map((o) => o.minute);
		const hi = Math.min(...minutes) + SAME_TIME_MINUTES;
		for (let m = Math.max(...minutes) - SAME_TIME_MINUTES; m <= hi; m += step) {
			const option = options.get(m);
			if (option && option.attendees.length >= minAttendees) extend(days, [...chosen, option]);
		}
	};
	for (const days of dayCombos(grid, count)) extend(days, []);

	const sets = mergeRuns(found, event, grid, required.length, considered, k);
	sets.sort((a, b) => compareRanks(a.rank, b.rank) || a.set.starts[0] - b.set.starts[0]);

	// Keep the best of any sets that land on the same days at overlapping times.
	const kept: MeetingSet[] = [];
	for (const { set } of sets) {
		if (kept.length >= MAX_RESULTS) break;
		if (!kept.some((other) => overlaps(set, other))) kept.push(set);
	}
	for (const set of kept) result[set.tier].push(set);
	return result;
};

/** Every place a meeting fits, per grid day, keyed by its start minute. */
const optionsByDay = (
	event: W2MEvent,
	grid: Grid,
	considered: number[],
	requiredSet: Set<number>,
	k: number
): Map<number, Option>[] => {
	const byDay = grid.days.map(() => new Map<number, Option>());
	const free = event.slots.map((slot) => new Set(slot.available));
	for (const run of contiguousRuns(event, grid)) {
		const n = run.length;
		if (n < k) continue;
		// streak.get(p)[j]: how many consecutive slots person p is free, starting at run[j].
		const streak = new Map<number, Int32Array>();
		for (const p of considered) {
			const s = new Int32Array(n + 1);
			for (let j = n - 1; j >= 0; j--) s[j] = free[run[j]].has(p) ? s[j + 1] + 1 : 0;
			streak.set(p, s);
		}
		for (let s = 0; s + k <= n; s++) {
			const slot = run[s];
			const attendees = considered.filter((p) => streak.get(p)![s] >= k);
			const inGroup = new Set(attendees);
			const missing = considered.filter((p) => !inGroup.has(p));
			const start = DateTime.fromSeconds(event.slots[slot].time, { zone: grid.zone });
			const minute = start.hour * 60 + start.minute;
			byDay[grid.dayOfSlot[slot]].set(minute, {
				slot,
				minute,
				attendees,
				missing,
				requiredMissing: missing.filter((p) => requiredSet.has(p))
			});
		}
	}
	return byDay;
};

/**
 * Every way to pick `count` days with at least MIN_DAY_GAP between each, including from the last
 * one around to the first one next week, so the pattern repeats cleanly (no Sunday then Monday).
 */
export const dayCombos = (grid: Grid, count: number): number[][] => {
	const ordinal = grid.days.map((d) =>
		Math.round(DateTime.fromISO(d.key, { zone: 'utc' }).toSeconds() / 86_400)
	);
	const out: number[][] = [];
	const extend = (combo: number[]) => {
		if (combo.length === count) {
			if (ordinal[combo[0]] + 7 - ordinal[combo[count - 1]] >= MIN_DAY_GAP) out.push(combo);
			return;
		}
		const last = combo[combo.length - 1];
		for (let d = combo.length ? last + 1 : 0; d < grid.days.length; d++) {
			if (combo.length && ordinal[d] - ordinal[combo[0]] > 7 - MIN_DAY_GAP) break;
			if (combo.length && ordinal[d] - ordinal[last] < MIN_DAY_GAP) continue;
			extend([...combo, d]);
		}
	};
	extend([]);
	return out;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const evaluate = (
	days: number[],
	options: Option[],
	requiredSet: Set<number>,
	requiredCount: number
): Candidate => {
	const missing = [...new Set(options.flatMap((o) => o.missing))];
	const requiredMissing = missing.filter((p) => requiredSet.has(p));
	const tier = classify(missing.length, requiredMissing.length, requiredCount);
	const minutes = options.map((o) => o.minute);
	const spread = Math.max(...minutes) - Math.min(...minutes);
	return {
		days,
		options,
		tier,
		spread,
		missing,
		requiredMissing,
		// Worst meeting first, then the whole set, then how close together the start times are.
		rank: [
			TIER_RANK[tier],
			Math.max(...options.map((o) => o.requiredMissing.length)),
			sum(options.map((o) => o.requiredMissing.length)),
			Math.max(...options.map((o) => o.missing.length)),
			sum(options.map((o) => o.missing.length)),
			spread
		],
		shape: [
			days.join(','),
			minutes.map((m) => m - minutes[0]).join(','),
			...options.map((o) => o.attendees.join('.'))
		].join('|')
	};
};

const compareRanks = (a: number[], b: number[]) => {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
};

/**
 * Merges candidates that differ only by every meeting starting one slot later with the same
 * people, so "Tue & Thu, anywhere from 2:00 to 2:30" is one result with a flexible start.
 */
const mergeRuns = (
	found: Candidate[],
	event: W2MEvent,
	grid: Grid,
	requiredCount: number,
	considered: number[],
	k: number
): { rank: number[]; set: MeetingSet }[] => {
	const byShape = new Map<string, Candidate[]>();
	for (const c of found) {
		const list = byShape.get(c.shape);
		if (list) list.push(c);
		else byShape.set(c.shape, [c]);
	}

	const out: { rank: number[]; set: MeetingSet }[] = [];
	for (const list of byShape.values()) {
		list.sort((a, b) => a.options[0].slot - b.options[0].slot);
		let run: Candidate[] = [];
		const flush = () => {
			if (run.length)
				out.push({ rank: run[0].rank, set: toSet(run, event, grid, requiredCount, considered, k) });
			run = [];
		};
		for (const c of list) {
			const prev = run[run.length - 1];
			const next = prev && c.options.every((o, i) => o.slot === prev.options[i].slot + 1);
			if (!next) flush();
			run.push(c);
		}
		flush();
	}
	return out;
};

const toSet = (
	run: Candidate[],
	event: W2MEvent,
	grid: Grid,
	requiredCount: number,
	considered: number[],
	k: number
): MeetingSet => {
	const first = run[0];
	const last = run[run.length - 1];
	const sessions: TimeBlock[] = first.days.map((day, i) => {
		const option = first.options[i];
		const startSlot = option.slot;
		const endSlot = last.options[i].slot + k - 1;
		return {
			id: `${startSlot}-${endSlot}-${option.attendees.join('.')}`,
			tier: classify(option.missing.length, option.requiredMissing.length, requiredCount),
			day,
			startSlot,
			endSlot,
			start: event.slots[startSlot].time,
			end: event.slots[endSlot].time + event.slotSeconds,
			attendees: option.attendees,
			missing: option.missing,
			requiredMissing: option.requiredMissing
		};
	});
	const missingSet = new Set(first.missing);
	return {
		id: sessions.map((s) => s.id).join('_'),
		tier: first.tier,
		sessions,
		starts: first.options.map((o) => event.slots[o.slot].time),
		flex: (run.length - 1) * event.slotSeconds,
		spread: first.spread,
		always: considered.filter((p) => !missingSet.has(p)),
		missing: first.missing,
		requiredMissing: first.requiredMissing
	};
};

/** Same days, and every meeting's window overlaps the other set's on that day. */
const overlaps = (a: MeetingSet, b: MeetingSet) =>
	a.sessions.every((s, i) => {
		const t = b.sessions[i];
		return s.day === t.day && s.start < t.end && t.start < s.end;
	});
