import type { Roles } from '$lib/types';
import { isEventId } from '$lib/w2m/id';

export interface ShareState {
	id: string | null;
	duration?: number;
	roles?: Roles;
}

const idList = (value: string | null): number[] =>
	(value ?? '')
		.split(',')
		.map(Number)
		.filter((n) => Number.isInteger(n) && n > 0);

/** Reads `?e=<id>&d=60&opt=1,2&skip=3`, and v1's bare `?<id>` links. */
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
	if (Number.isInteger(duration) && duration >= 15 && duration <= 24 * 60)
		state.duration = duration;

	// Full state links (from shareSearch) always carry `d`, so no opt/skip there means
	// "everyone required". A bare `?e=` link falls back to the viewer's saved setup.
	if (params.has('d') || params.has('opt') || params.has('skip')) {
		const roles: Roles = {};
		for (const pid of idList(params.get('opt'))) roles[pid] = 'optional';
		for (const pid of idList(params.get('skip'))) roles[pid] = 'skip';
		state.roles = roles;
	}
	return state;
};

export const shareSearch = (id: string, duration: number, roles: Roles): string => {
	const params = new URLSearchParams({ e: id, d: String(duration) });
	const opt = Object.keys(roles).filter((pid) => roles[Number(pid)] === 'optional');
	const skip = Object.keys(roles).filter((pid) => roles[Number(pid)] === 'skip');
	if (opt.length) params.set('opt', opt.join(','));
	if (skip.length) params.set('skip', skip.join(','));
	// Commas read better than %2C in a shared link and are safe in a query string.
	return '?' + params.toString().replaceAll('%2C', ',');
};
