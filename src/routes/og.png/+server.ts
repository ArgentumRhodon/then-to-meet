import { renderHeatmapImage } from '$lib/server/og/heatmapImage';
import { EventLoadError, getEvent } from '$lib/server/w2m';
import { sharedView } from '$lib/share/sharedView';
import { readShareParams } from '$lib/share/url';
import type { RequestHandler } from './$types';

const fail = (status: number, message: string) =>
	new Response(message, { status, headers: { 'cache-control': 'no-store' } });

/**
 * The heatmap for a shared link's preview image, drawn with the same query string as the link:
 * the sharer's timezone, roles, and group, with the time or times the link is about outlined.
 */
export const GET: RequestHandler = async ({ url, fetch }) => {
	const share = readShareParams(url);
	if (!share.id) return fail(400, 'Missing event');

	try {
		const event = await getEvent(share.id, fetch);
		const { grid, roles, featured } = sharedView(event, share);
		const png = await renderHeatmapImage({ event, grid, roles, featured });
		return new Response(png, {
			headers: {
				'content-type': 'image/png',
				// Unfurlers fetch this once per post; the CDN keeps a burst of them off When2Meet.
				'cache-control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600'
			}
		});
	} catch (e) {
		if (e instanceof EventLoadError) return fail(e.status, e.message);
		// Shows up in the host's function logs; the response only says it failed.
		console.error('Preview image failed', e);
		return fail(500, 'Couldn’t draw that event');
	}
};
