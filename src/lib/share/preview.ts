import { DateTime } from 'luxon';
import type { BestTimes, TimeBlock } from '$lib/analysis/bestTimes';
import {
	formatDay,
	formatDuration,
	formatList,
	formatMeetingSet,
	formatTimeRange
} from '$lib/analysis/format';
import type { MeetingSet, MeetingSets } from '$lib/analysis/meetingSets';
import type { TimeRange, W2MEvent } from '$lib/types';
import { perWeekPhrase } from './summary';

export interface LinkPreview {
	title: string;
	description: string;
}

interface PreviewInput {
	event: W2MEvent;
	best: BestTimes;
	duration: number;
	/** The grid's zone, so weekly polls stay on their wall-clock times. */
	zone: string;
	group?: string;
	/** Specific times the link proposes. */
	picks?: TimeBlock[];
	/** Sets of meetings, when the link is about meeting two or three times a week. */
	sets?: MeetingSets | null;
	perWeek?: number;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Title and description for link unfurls in Slack, Discord, iMessage, and the like. */
export const buildPreview = ({
	event,
	best,
	duration,
	zone,
	group,
	picks = [],
	sets,
	perWeek = 1
}: PreviewInput): LinkPreview => {
	const names = new Map(event.people.map((p) => [p.id, p.name]));
	// Weekly polls are wall-clock times with no zone of their own.
	const zoneLabel = (start: number) =>
		event.weekly ? '' : ` ${DateTime.fromSeconds(start, { zone }).toFormat('ZZZZ')}`;
	const when = ({ start, end }: TimeRange) =>
		`${formatDay(start, zone, event.weekly)}, ${formatTimeRange(start, end, zone)}${zoneLabel(start)}`;
	const whenSet = (set: MeetingSet) => {
		const { days, times } = formatMeetingSet(set.starts, duration, zone);
		return `${days}, ${times}${zoneLabel(set.starts[0])}`;
	};
	const length = formatDuration(duration);
	const often = perWeekPhrase(perWeek);

	let lead: string;
	if (picks.length) {
		// Who can make every proposed time, and who misses at least one.
		const missing = [...new Set(picks.flatMap((p) => p.missing))];
		const always = best.considered - missing.length;
		const without = missing.map((id) => names.get(id)).join(', ');
		const it = picks.length > 1 ? 'every one' : 'it';
		const who = !missing.length
			? `Everyone can make ${it}.`
			: `${always} of ${best.considered} can make ${it}` +
				(missing.length <= 3 ? ` (not ${without}).` : '.');
		lead = `Proposed: ${formatList(picks.map(when))}. ${who}`;
	} else if (sets) {
		if (sets.everyone.length) {
			lead = `Meeting ${often} for ${length}: everyone can make ${whenSet(sets.everyone[0])}.`;
		} else if (sets.required.length) {
			lead = `Meeting ${often} for ${length}: all required people can make ${whenSet(sets.required[0])}.`;
		} else if (sets.near.length) {
			lead = `Nothing fits everyone ${often} yet, but ${count(sets.near.length, 'option')} ${sets.near.length === 1 ? 'is' : 'are'} one person short.`;
		} else {
			lead = `Nothing fits everyone ${often} yet.`;
		}
	} else if (best.everyone.length === 1) {
		lead = `Everyone’s free for a ${length} meeting: ${when(best.everyone[0])}.`;
	} else if (best.everyone.length) {
		lead = `Everyone’s free for a ${length} meeting at ${best.everyone.length} times. Earliest: ${when(best.everyone[0])}.`;
	} else if (best.required.length) {
		lead = `All required people can make a ${length} meeting at ${count(best.required.length, 'time')}. Best: ${when(best.required[0])}.`;
	} else if (best.near.length) {
		lead = `No ${length} time fits everyone yet, but ${count(best.near.length, 'time')} ${best.near.length === 1 ? 'is' : 'are'} one person short.`;
	} else {
		lead = `No ${length} time fits everyone yet.`;
	}

	return {
		title: group ? `${event.title} (${group})` : event.title,
		description: `${lead} ${count(event.people.length, 'person', 'people')} responded.`
	};
};
