import { clampDuration, DEFAULT_DURATION } from '$lib/analysis/duration';
import type { MeetingsPerWeek } from '$lib/analysis/meetingSets';
import type { Roles, TimeRange } from '$lib/types';
import { isEventId } from '$lib/w2m/id';

export interface ShareState {
	id: string | null;
	duration?: number;
	roles?: Roles;
	/** Name of the group the link was made from, shown to whoever opens it. */
	group?: string;
	/** Specific times the link points at. */
	picks?: TimeRange[];
	/** Meetings a week, when the link is about two or three. */
	perWeek?: MeetingsPerWeek;
	/** The sharer's timezone, used to spell out times in link previews. */
	zone?: string;
}

export interface ShareLink {
	id: string;
	duration: number;
	roles: Roles;
	group?: string | null;
	picks?: TimeRange[];
	perWeek?: MeetingsPerWeek;
	zone?: string | null;
}

const MAX_GROUP_NAME = 60;
/** More picked times than anyone would share by hand; keeps a crafted link from getting silly. */
const MAX_PICKS = 10;

const idList = (value: string | null): number[] =>
	(value ?? '')
		.split(',')
		.map(Number)
		.filter((n) => Number.isInteger(n) && n > 0);

const isZone = (zone: string): boolean => {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
};

/**
 * Reads `?e=<id>&d=60&opt=1,2&skip=3&g=<group>&at=<unix>,<unix>&len=90,60&n=2&tz=<zone>`, and
 * v1's bare `?<id>` links. `len` gives each picked time's length when it isn't the meeting length.
 */
export const readShareParams = (url: URL): ShareState => {
	const params = url.searchParams;
	let id = params.get('e');
	if (!id) {
		const bare = decodeURIComponent(url.search.slice(1));
		if (isEventId(bare)) id = bare;
	}
	if (!id || !isEventId(id)) return { id: null };

	const state: ShareState = { id };
	const duration = Number(params.get('d'));
	const hasDuration = Number.isFinite(duration) && duration > 0;
	if (hasDuration) state.duration = clampDuration(duration);

	// Full state links (from shareSearch) always carry `d`, so no opt/skip there means
	// "everyone required". A bare `?e=` link falls back to the viewer's saved setup.
	if (params.has('d') || params.has('opt') || params.has('skip')) {
		const roles: Roles = {};
		for (const pid of idList(params.get('opt'))) roles[pid] = 'optional';
		for (const pid of idList(params.get('skip'))) roles[pid] = 'skip';
		state.roles = roles;
	}

	const group = params.get('g')?.trim().replace(/\s+/g, ' ').slice(0, MAX_GROUP_NAME);
	if (group) state.group = group;

	const starts = idList(params.get('at')).slice(0, MAX_PICKS);
	if (starts.length) {
		const lengths = idList(params.get('len'));
		// Picked times keep the length the link gave them, even one the length buttons don't offer.
		state.picks = starts.map((start, i) => {
			const len = Math.min(lengths[i] ?? (hasDuration ? duration : DEFAULT_DURATION), 24 * 60);
			return { start, end: start + len * 60 };
		});
	}

	const perWeek = params.get('n');
	if (perWeek === '2' || perWeek === '3') state.perWeek = Number(perWeek) as 2 | 3;

	const zone = params.get('tz');
	if (zone && isZone(zone)) state.zone = zone;
	return state;
};

export const shareSearch = ({
	id,
	duration,
	roles,
	group,
	picks,
	perWeek,
	zone
}: ShareLink): string => {
	const params = new URLSearchParams({ e: id, d: String(duration) });
	const opt = Object.keys(roles).filter((pid) => roles[Number(pid)] === 'optional');
	const skip = Object.keys(roles).filter((pid) => roles[Number(pid)] === 'skip');
	if (opt.length) params.set('opt', opt.join(','));
	if (skip.length) params.set('skip', skip.join(','));
	if (group) params.set('g', group);
	if (picks?.length) {
		params.set('at', picks.map((p) => p.start).join(','));
		const lengths = picks.map((p) => (p.end - p.start) / 60);
		if (lengths.some((len) => len !== duration)) params.set('len', lengths.join(','));
	}
	if (perWeek && perWeek > 1) params.set('n', String(perWeek));
	if (zone) params.set('tz', zone);
	// Commas and slashes read better than %2C and %2F in a shared link and are safe in a query.
	return '?' + params.toString().replaceAll('%2C', ',').replaceAll('%2F', '/');
};
