import type { W2MEvent } from '$lib/types';
import { demoEventHtml } from '$lib/w2m/demo';
import { DEMO_ID, eventUrl } from '$lib/w2m/id';
import { EventFormatError, EventNotFoundError, parseEvent } from '$lib/w2m/parse';

/** How long a fetched event is reused, so a link shared with a big group fetches it once. */
const FRESH_MS = 20_000;
/** Even a request for a fresh copy reuses one this new, so the endpoint can't hammer When2Meet. */
const MIN_REFETCH_MS = 5_000;
/** Longest to wait on When2Meet before giving up. */
const TIMEOUT_MS = 10_000;
const MAX_CACHED = 200;

/** A failure worth showing the user, with the HTTP status that fits it. */
export class EventLoadError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'EventLoadError';
	}
}

const cache = new Map<string, { at: number; event: Promise<W2MEvent> }>();

/**
 * Fetches and parses an event. A recent result, or a request still in flight, is shared rather
 * than fetched again; `fresh` asks for a new copy unless the last one is only seconds old.
 */
export const getEvent = (
	id: string,
	fetcher: typeof fetch = fetch,
	{ fresh = false }: { fresh?: boolean } = {}
): Promise<W2MEvent> => {
	const now = Date.now();
	const hit = cache.get(id);
	if (hit && now - hit.at < (fresh ? MIN_REFETCH_MS : FRESH_MS)) return hit.event;

	const event = loadEvent(id, fetcher);
	// Delete first so the Map's order tracks recency for eviction.
	cache.delete(id);
	cache.set(id, { at: now, event });
	event.catch(() => {
		if (cache.get(id)?.event === event) cache.delete(id);
	});
	while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
	return event;
};

const loadEvent = async (id: string, fetcher: typeof fetch): Promise<W2MEvent> => {
	const html = id === DEMO_ID ? demoEventHtml() : await download(id, fetcher);
	try {
		return parseEvent(html, id);
	} catch (e) {
		if (e instanceof EventNotFoundError) {
			throw new EventLoadError(
				404,
				'No When2Meet poll found at that link. Double-check it and try again.'
			);
		}
		if (e instanceof EventFormatError) {
			throw new EventLoadError(
				502,
				'When2Meet changed how its event pages work, so ThenToMeet can’t read them right now.'
			);
		}
		throw new EventLoadError(500, "That event loaded, but its format wasn't recognized.");
	}
};

const download = async (id: string, fetcher: typeof fetch): Promise<string> => {
	try {
		const response = await fetcher(eventUrl(id), {
			headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!response.ok) {
			throw new EventLoadError(502, `When2Meet responded with an error (${response.status}).`);
		}
		return await response.text();
	} catch (e) {
		if (e instanceof EventLoadError) throw e;
		if ((e as Error)?.name === 'TimeoutError') {
			throw new EventLoadError(504, 'When2Meet took too long to respond. Try again in a moment.');
		}
		throw new EventLoadError(502, "Couldn't reach When2Meet. Try again in a moment.");
	}
};
