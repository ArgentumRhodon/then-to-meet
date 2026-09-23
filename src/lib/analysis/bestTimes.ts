import type { Roles, W2MEvent } from '$lib/types';
import type { Grid } from './grid';

export type Tier = 'everyone' | 'required' | 'near' | 'fewer';

export interface TimeBlock {
	id: string;
	tier: Tier;
	/** Grid day index. */
	day: number;
	/** Inclusive indices into `event.slots`. */
	startSlot: number;
	endSlot: number;
	/** Unix seconds; `end` is exclusive (the end of the last slot). */
	start: number;
	end: number;
	attendees: number[];
	missing: number[];
	requiredMissing: number[];
}

export interface BestTimes {
	everyone: TimeBlock[];
	/** All required people, but some optional ones can't make it. */
	required: TimeBlock[];
	/** Exactly one person short (one required person, or one of an all-optional group). */
	near: TimeBlock[];
	/** Everything else with at least two people, most people first. A fallback for tough polls. */
	fewer: TimeBlock[];
	considered: number;
	requiredCount: number;
}

export const roleOf = (roles: Roles, id: number) => roles[id] ?? 'required';

/**
 * Finds every time window at least `durationMinutes` long, grouped by how many people can make
 * it. Each block is the maximal stretch during which one particular group of people is all free,
 * so a long free afternoon shows up once rather than as dozens of overlapping sub-windows.
 */
export const findBestTimes = (
	event: W2MEvent,
	grid: Grid,
	roles: Roles,
	durationMinutes: number
): BestTimes => {
	const considered = event.people.map((p) => p.id).filter((id) => roleOf(roles, id) !== 'skip');
	const required = considered.filter((id) => roleOf(roles, id) === 'required');
	const requiredSet = new Set(required);
	const result: BestTimes = {
		everyone: [],
		required: [],
		near: [],
		fewer: [],
		considered: considered.length,
		requiredCount: required.length
	};
	if (!considered.length) return result;

	const k = Math.max(1, Math.ceil((durationMinutes * 60) / event.slotSeconds));
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

		// Each distinct "who can make a k-slot meeting starting here" group is a candidate.
		const candidates = new Map<string, number[]>();
		for (let s = 0; s + k <= n; s++) {
			const group = considered.filter((p) => streak.get(p)![s] >= k);
			if (group.length) candidates.set(group.join(','), group);
		}

		const blocks: TimeBlock[] = [];
		for (const group of candidates.values()) {
			const inGroup = new Set(group);
			const missing = considered.filter((p) => !inGroup.has(p));
			const requiredMissing = missing.filter((p) => requiredSet.has(p));
			const tier = classify(missing.length, requiredMissing.length, required.length);
			if (tier === 'fewer' && group.length < 2) continue;

			// Maximal stretches where the whole group is free, at least k slots long.
			let from = 0;
			while (from < n) {
				let len = Infinity;
				for (const p of group) len = Math.min(len, streak.get(p)![from]);
				if (len >= k) {
					const startSlot = run[from];
					const endSlot = run[from + len - 1];
					blocks.push({
						id: `${startSlot}-${endSlot}-${group.join('.')}`,
						tier,
						day: grid.dayOfSlot[startSlot],
						startSlot,
						endSlot,
						start: event.slots[startSlot].time,
						end: event.slots[endSlot].time + event.slotSeconds,
						attendees: group,
						missing,
						requiredMissing
					});
				}
				from += Math.max(1, len);
			}
		}

		for (const block of dropDominated(blocks)) result[block.tier].push(block);
	}

	const byStart = (a: TimeBlock, b: TimeBlock) => a.start - b.start || b.end - a.end;
	result.everyone.sort(byStart);
	result.required.sort((a, b) => a.missing.length - b.missing.length || byStart(a, b));
	result.near.sort(byStart);
	result.fewer.sort(
		(a, b) =>
			a.requiredMissing.length - b.requiredMissing.length ||
			a.missing.length - b.missing.length ||
			byStart(a, b)
	);
	return result;
};

const classify = (missing: number, requiredMissing: number, requiredCount: number): Tier => {
	if (missing === 0) return 'everyone';
	if (requiredCount > 0 && requiredMissing === 0) return 'required';
	if (requiredCount >= 2 && requiredMissing === 1) return 'near';
	if (requiredCount === 0 && missing === 1) return 'near';
	return 'fewer';
};

/** Splits slots into runs of back-to-back slots on the same displayed day. */
const contiguousRuns = (event: W2MEvent, grid: Grid): number[][] => {
	const runs: number[][] = [];
	let current: number[] = [];
	event.slots.forEach((slot, i) => {
		const prev = current[current.length - 1];
		const continues =
			prev !== undefined &&
			grid.dayOfSlot[prev] === grid.dayOfSlot[i] &&
			slot.time - event.slots[prev].time === event.slotSeconds;
		if (!continues && current.length) {
			runs.push(current);
			current = [];
		}
		current.push(i);
	});
	if (current.length) runs.push(current);
	return runs;
};

/** Drops a block when a bigger group is free for exactly the same stretch. */
const dropDominated = (blocks: TimeBlock[]): TimeBlock[] => {
	// Only blocks covering the same stretch can dominate each other, so compare within those.
	const byRange = new Map<string, TimeBlock[]>();
	for (const block of blocks) {
		const key = `${block.startSlot}-${block.endSlot}`;
		byRange.set(key, [...(byRange.get(key) ?? []), block]);
	}
	return blocks.filter((block) => {
		const peers = byRange.get(`${block.startSlot}-${block.endSlot}`)!;
		return !peers.some((other) => {
			if (other.attendees.length <= block.attendees.length) return false;
			const theirs = new Set(other.attendees);
			return block.attendees.every((p) => theirs.has(p));
		});
	});
};

/** Everyone considered who is free during a single slot. */
export const slotAttendance = (event: W2MEvent, roles: Roles) => {
	const considered = event.people.filter((p) => roleOf(roles, p.id) !== 'skip');
	const ids = new Set(considered.map((p) => p.id));
	return {
		total: considered.length,
		counts: event.slots.map((slot) => slot.available.filter((id) => ids.has(id)).length)
	};
};
