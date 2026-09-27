import { json } from '@sveltejs/kit';
import { EventLoadError, getEvent } from '$lib/server/w2m';
import { isEventId } from '$lib/w2m/id';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'no-store' };

const fail = (status: number, message: string) => json({ message }, { status, headers: NO_STORE });

/** `?fresh=1` skips the short server cache, for the refresh button. */
export const GET: RequestHandler = async ({ params, fetch, url }) => {
	const { id } = params;
	if (!isEventId(id)) return fail(400, "That doesn't look like a When2Meet link.");

	try {
		const event = await getEvent(id, fetch, { fresh: url.searchParams.has('fresh') });
		return json(event, { headers: NO_STORE });
	} catch (e) {
		if (e instanceof EventLoadError) return fail(e.status, e.message);
		return fail(500, 'Something went wrong loading that event. Try again.');
	}
};
