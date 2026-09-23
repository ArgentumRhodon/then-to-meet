import { formatDay, formatDuration, formatTimeRange } from '$lib/analysis/format';
import type { BestTimes, TimeBlock } from '$lib/analysis/bestTimes';
import type { W2MEvent } from '$lib/types';

const PER_GROUP = 5;

interface SummaryInput {
	event: W2MEvent;
	best: BestTimes;
	duration: number;
	zone: string;
	/** Name of the group being viewed, if any. */
	group?: string;
	link: string;
}

/** Plain-text summary that pastes cleanly into Slack, Discord, email, or a text. */
export const buildSummary = ({
	event,
	best,
	duration,
	zone,
	group,
	link
}: SummaryInput): string => {
	const names = new Map(event.people.map((p) => [p.id, p.name]));
	const line = (b: TimeBlock, note = '') =>
		`• ${formatDay(b.start, zone, event.weekly)} · ${formatTimeRange(b.start, b.end, zone)}${note}`;
	const missing = (b: TimeBlock) => ` (without ${b.missing.map((id) => names.get(id)).join(', ')})`;

	const zoneNote = event.weekly ? '' : ` · times in ${zone.replaceAll('_', ' ')}`;
	const who = group ? ` (${group})` : '';
	const out = [`${event.title}${who}: best times for ${formatDuration(duration)}${zoneNote}`];

	const section = (heading: string, blocks: TimeBlock[], withMissing: boolean) => {
		if (!blocks.length) return;
		out.push('', heading);
		for (const b of blocks.slice(0, PER_GROUP)) out.push(line(b, withMissing ? missing(b) : ''));
		if (blocks.length > PER_GROUP) out.push(`• …and ${blocks.length - PER_GROUP} more`);
	};

	section('Everyone can make it', best.everyone, false);
	section('All required people', best.required, true);
	if (!best.everyone.length && !best.required.length) section('One person short', best.near, true);
	if (out.length === 1) section('Most people (nothing fits everyone)', best.fewer, true);
	if (out.length === 1) out.push('', 'No time works for everyone yet.');

	out.push('', link);
	return out.join('\n');
};
