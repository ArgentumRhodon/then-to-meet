import { isNativeEventId } from '$lib/events/id';
import { NativeEventNotFound } from '$lib/events/model';
import { loadNativeEvent } from '$lib/events/store';
import { accountsEnabled } from '$lib/firebase/config';
import { getClientDb } from '$lib/firebase/client';
import type { W2MEvent } from '$lib/types';
import { EventLoadError, getEvent } from '../w2m';

/** Longest to wait on Firestore, which otherwise retries for the better part of a minute. */
const TIMEOUT_MS = 10_000;

/**
 * How long a read of a ThenToMeet event is reused. Opening a shared link reads the event for the
 * page and again for its preview image (and each unfurler does both), and every read is one per
 * response, so a burst of them shares one. The page itself follows the event live, so nobody
 * looking at it sees these seconds-old copies for long.
 */
export const CACHE_MS = 30_000;
const MAX_CACHED = 100;
const cache = new Map<string, { at: number; event: Promise<W2MEvent> }>();

/** Forgets what was read, for tests. */
export const clearEventCache = () => cache.clear();

/**
 * Loads an event from wherever it lives: When2Meet (fetched and parsed, as always) or ThenToMeet's
 * own store. Both come back as the same `W2MEvent`, so nothing past this point cares which. The
 * server reads Firestore as a signed-out visitor, which the rules allow for anyone with the link.
 */
export const loadEvent = (
	id: string,
	fetcher: typeof fetch = fetch,
	options: { fresh?: boolean; reread?: boolean } = {}
): Promise<W2MEvent> => {
	if (!isNativeEventId(id)) return getEvent(id, fetcher, { fresh: options.fresh });
	if (!accountsEnabled()) {
		return Promise.reject(new EventLoadError(404, 'No event found at that link.'));
	}
	const now = Date.now();
	// `reread` is for a page someone is about to look at: it reads the event itself (and shares the
	// result with what follows), where a preview image makes do with a copy a few seconds old.
	const hit = options.fresh || options.reread ? undefined : cache.get(id);
	if (hit && now - hit.at < CACHE_MS) return hit.event;

	const event = withDeadline(
		loadNativeEvent(getClientDb(), id).catch((e) => {
			if (e instanceof NativeEventNotFound) throw new EventLoadError(404, e.message);
			throw new EventLoadError(502, "Couldn't load that ThenToMeet event. Try again.");
		})
	);
	cache.delete(id);
	cache.set(id, { at: now, event });
	// A failed read isn't kept, so the next request tries again.
	event.catch(() => {
		if (cache.get(id)?.event === event) cache.delete(id);
	});
	while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
	return event;
};

const withDeadline = <T>(work: Promise<T>): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new EventLoadError(504, 'ThenToMeet took too long to respond. Try again.')),
			TIMEOUT_MS
		);
	});
	// The abandoned read may still fail later; that's expected, not worth an unhandled rejection.
	work.catch(() => {});
	return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
};
