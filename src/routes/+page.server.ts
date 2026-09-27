import { blockForSlots, findBestTimes, slotSpan } from '$lib/analysis/bestTimes';
import { DEFAULT_DURATION } from '$lib/analysis/duration';
import { buildGrid } from '$lib/analysis/grid';
import { findMeetingSets } from '$lib/analysis/meetingSets';
import { getEvent } from '$lib/server/w2m';
import { buildPreview, type LinkPreview } from '$lib/share/preview';
import { readShareParams } from '$lib/share/url';
import type { W2MEvent } from '$lib/types';
import type { PageServerLoad } from './$types';

/** Longest a first page load waits on When2Meet before rendering without a preview. */
const WAIT_MS = 4000;

const within = <T>(promise: Promise<T>, ms: number): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('Timed out')), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * On a first page load of an event link, fetches the event so link unfurlers get a real title and
 * description, and hands it to the page so it doesn't have to fetch it again.
 */
export const load: PageServerLoad = async ({
	url,
	fetch,
	isDataRequest
}): Promise<{ event: W2MEvent | null; preview: LinkPreview | null }> => {
	// In-app navigation loads the event client-side, with a loading state.
	if (isDataRequest) return { event: null, preview: null };
	const share = readShareParams(url);
	if (!share.id) return { event: null, preview: null };

	try {
		const event = await within(getEvent(share.id, fetch), WAIT_MS);
		const grid = buildGrid(event, share.zone ?? 'UTC');
		const roles = share.roles ?? {};
		const duration = share.duration ?? DEFAULT_DURATION;
		const picks = (share.picks ?? []).flatMap((range) => {
			const span = slotSpan(event, grid, range.start, range.end);
			return span ? [blockForSlots(event, grid, roles, span.startSlot, span.endSlot)] : [];
		});
		const perWeek = share.perWeek ?? 1;
		const preview = buildPreview({
			event,
			best: findBestTimes(event, grid, roles, duration),
			sets: perWeek > 1 ? findMeetingSets(event, grid, roles, duration, perWeek as 2 | 3) : null,
			perWeek,
			duration,
			zone: grid.zone,
			group: share.group,
			picks
		});
		return { event, preview };
	} catch {
		// The page fetches the event itself and reports any error there.
		return { event: null, preview: null };
	}
};
