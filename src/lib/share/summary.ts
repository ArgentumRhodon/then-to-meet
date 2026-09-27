import {
	formatDay,
	formatDuration,
	formatList,
	formatMeetingSet,
	formatTimeRange,
	formatWeekday
} from '$lib/analysis/format';
import type { BestTimes, TimeBlock } from '$lib/analysis/bestTimes';
import type { MeetingSet, MeetingSets } from '$lib/analysis/meetingSets';
import type { W2MEvent } from '$lib/types';

const PER_GROUP = 5;

interface SummaryInput {
	event: W2MEvent;
	best: BestTimes;
	/** Sets of meetings, when meeting two or three times a week. */
	sets?: MeetingSets | null;
	perWeek?: number;
	duration: number;
	zone: string;
	/** Name of the group being viewed, if any. */
	group?: string;
	link: string;
}

export const perWeekPhrase = (count: number) =>
	count === 3 ? 'three times a week' : count === 2 ? 'twice a week' : 'once a week';

/** Plain-text summary that pastes cleanly into Slack, Discord, email, or a text. */
export const buildSummary = ({
	event,
	best,
	sets,
	perWeek = 1,
	duration,
	zone,
	group,
	link
}: SummaryInput): string => {
	const names = new Map(event.people.map((p) => [p.id, p.name]));
	const line = (b: TimeBlock, note = '') =>
		`• ${formatDay(b.start, zone, event.weekly)} · ${formatTimeRange(b.start, b.end, zone)}${note}`;
	const missing = (b: TimeBlock) => ` (without ${b.missing.map((id) => names.get(id)).join(', ')})`;
	const setLine = (set: MeetingSet, withMissing: boolean) => {
		const { days, times } = formatMeetingSet(set.starts, duration, zone);
		const misses = set.missing.map((id) => {
			const when = set.sessions.filter((s) => s.missing.includes(id));
			return `${names.get(id)} on ${formatList(when.map((s) => formatWeekday(s.start, zone)))}`;
		});
		return `• ${days} · ${times}${withMissing && misses.length ? ` (without ${misses.join('; ')})` : ''}`;
	};

	const zoneNote = event.weekly ? '' : ` · times in ${zone.replaceAll('_', ' ')}`;
	const who = group ? ` (${group})` : '';
	const how = sets
		? `${formatDuration(duration)} ${perWeekPhrase(perWeek)}`
		: formatDuration(duration);
	const out = [`${event.title}${who}: best times for ${how}${zoneNote}`];

	const section = <T>(heading: string, items: T[], format: (item: T) => string) => {
		if (!items.length) return;
		out.push('', heading);
		for (const item of items.slice(0, PER_GROUP)) out.push(format(item));
		if (items.length > PER_GROUP) out.push(`• …and ${items.length - PER_GROUP} more`);
	};

	if (sets) {
		section('Everyone, every time', sets.everyone, (s) => setLine(s, false));
		section('All required people, every time', sets.required, (s) => setLine(s, true));
		if (!sets.everyone.length && !sets.required.length) {
			section('One person short', sets.near, (s) => setLine(s, true));
		}
		if (out.length === 1)
			section('Most people (nothing fits everyone)', sets.fewer, (s) => setLine(s, true));
	} else {
		section('Everyone can make it', best.everyone, (b) => line(b));
		section('All required people', best.required, (b) => line(b, missing(b)));
		if (!best.everyone.length && !best.required.length) {
			section('One person short', best.near, (b) => line(b, missing(b)));
		}
		if (out.length === 1)
			section('Most people (nothing fits everyone)', best.fewer, (b) => line(b, missing(b)));
	}
	if (out.length === 1) out.push('', 'No time works for everyone yet.');

	out.push('', link);
	return out.join('\n');
};
