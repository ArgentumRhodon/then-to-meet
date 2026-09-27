import {
	blockForSlots,
	findBestTimes,
	slotSpan,
	type BestTimes,
	type TimeBlock
} from '$lib/analysis/bestTimes';
import { DEFAULT_DURATION } from '$lib/analysis/duration';
import { buildGrid, type Grid } from '$lib/analysis/grid';
import { findMeetingSets, type MeetingSets, type MeetingsPerWeek } from '$lib/analysis/meetingSets';
import type { Roles, W2MEvent } from '$lib/types';
import type { ShareState } from './url';

/** An event seen the way a shared link sets it up, for the link's preview text and image. */
export interface SharedView {
	grid: Grid;
	roles: Roles;
	duration: number;
	perWeek: MeetingsPerWeek;
	best: BestTimes;
	/** Sets of meetings, when the link is about meeting two or three times a week. */
	sets: MeetingSets | null;
	/** The times the link picks out, as blocks. */
	picks: TimeBlock[];
	/** What the link is about: its picked times, or else the best set or time its preview names. */
	featured: TimeBlock[];
}

export const sharedView = (event: W2MEvent, share: ShareState): SharedView => {
	// Times read in the sharer's zone; without one, UTC.
	const grid = buildGrid(event, share.zone ?? 'UTC');
	const roles = share.roles ?? {};
	const duration = share.duration ?? DEFAULT_DURATION;
	const perWeek = share.perWeek ?? 1;
	const picks = (share.picks ?? []).flatMap((range) => {
		const span = slotSpan(event, grid, range.start, range.end);
		return span ? [blockForSlots(event, grid, roles, span.startSlot, span.endSlot)] : [];
	});
	const best = findBestTimes(event, grid, roles, duration);
	const sets = perWeek === 1 ? null : findMeetingSets(event, grid, roles, duration, perWeek);

	const topSet = sets && (sets.everyone[0] ?? sets.required[0]);
	const topTime = best.everyone[0] ?? best.required[0];
	const featured = picks.length
		? picks
		: sets
			? (topSet?.sessions ?? [])
			: topTime
				? [topTime]
				: [];
	return { grid, roles, duration, perWeek, best, sets, picks, featured };
};
