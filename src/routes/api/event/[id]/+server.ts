import { json } from '@sveltejs/kit';
import { demoEventHtml } from '$lib/w2m/demo';
import { DEMO_ID, eventUrl, isEventId } from '$lib/w2m/id';
import { EventNotFoundError, parseEvent } from '$lib/w2m/parse';
import type { RequestHandler } from './$types';

const fail = (status: number, message: string) =>
	json({ message }, { status, headers: { 'cache-control': 'no-store' } });

export const GET: RequestHandler = async ({ params, fetch }) => {
	const { id } = params;
	if (!isEventId(id)) return fail(400, "That doesn't look like a When2Meet link.");

	let html: string;
	if (id === DEMO_ID) {
		html = demoEventHtml();
	} else {
		try {
			const response = await fetch(eventUrl(id), {
				headers: {
					Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
				}
			});
			if (!response.ok) return fail(502, `When2Meet responded with an error (${response.status}).`);
			html = await response.text();
		} catch {
			return fail(502, "Couldn't reach When2Meet. Check your connection and try again.");
		}
	}

	try {
		return json(parseEvent(html, id), { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		if (e instanceof EventNotFoundError) {
			return fail(404, 'No When2Meet event found at that link. Double-check it and try again.');
		}
		return fail(500, "That event loaded, but its format wasn't recognized.");
	}
};
