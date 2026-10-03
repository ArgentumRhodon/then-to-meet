import { json } from '@sveltejs/kit';
import { isAnyEventId } from '$lib/events/id';
import { loadEvent } from '$lib/server/events/load';
import { EventLoadError } from '$lib/server/w2m';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

const fail = (status: number, message: string) => json({ message }, { status, headers: NO_STORE });

/** `?fresh=1` skips the short server cache, for the refresh button. */
export const GET: RequestHandler = async ({ params, fetch, url }) => {
	const { id } = params;
	if (!isAnyEventId(id)) return fail(400, "That doesn't look like an event link.");

	try {
		const event = await loadEvent(id, fetch, { fresh: url.searchParams.has('fresh') });
		return json(event, { headers: NO_STORE });
	} catch (e) {
		if (e instanceof EventLoadError) return fail(e.status, e.message);
		return fail(500, 'Something went wrong loading that event. Try again.');
	}
};
