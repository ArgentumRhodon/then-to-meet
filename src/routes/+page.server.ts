import { getEvent } from '$lib/server/w2m';
import { buildPreview, type LinkPreview } from '$lib/share/preview';
import { sharedView } from '$lib/share/sharedView';
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
 * On a first page load of an event link, fetches the event so link unfurlers get a real title,
 * description, and heatmap image, and hands it to the page so it doesn't have to fetch it again.
 */
export const load: PageServerLoad = async ({
	url,
	fetch,
	isDataRequest
}): Promise<{ event: W2MEvent | null; preview: LinkPreview | null; image: string | null }> => {
	const none = { event: null, preview: null, image: null };
	// In-app navigation loads the event client-side, with a loading state.
	if (isDataRequest) return none;
	const share = readShareParams(url);
	if (!share.id) return none;

	try {
		const event = await within(getEvent(share.id, fetch), WAIT_MS);
		const view = sharedView(event, share);
		const preview = buildPreview({
			event,
			best: view.best,
			sets: view.sets,
			perWeek: view.perWeek,
			duration: view.duration,
			zone: view.grid.zone,
			group: share.group,
			picks: view.picks
		});
		// Same settings, drawn as a heatmap (see og.png/+server.ts). Unfurlers need a full URL.
		return { event, preview, image: `${url.origin}/og.png${url.search}` };
	} catch {
		// The page fetches the event itself and reports any error there.
		return none;
	}
};
