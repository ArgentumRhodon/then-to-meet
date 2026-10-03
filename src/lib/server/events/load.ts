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
 * Loads an event from wherever it lives: When2Meet (fetched and parsed, as always) or ThenToMeet's
 * own store. Both come back as the same `W2MEvent`, so nothing past this point cares which. The
 * server reads Firestore as a signed-out visitor, which the rules allow for anyone with the link.
 */
export const loadEvent = (
	id: string,
	fetcher: typeof fetch = fetch,
	options: { fresh?: boolean } = {}
): Promise<W2MEvent> => {
	if (!isNativeEventId(id)) return getEvent(id, fetcher, options);
	if (!accountsEnabled()) {
		return Promise.reject(new EventLoadError(404, 'No event found at that link.'));
	}
	return withDeadline(
		loadNativeEvent(getClientDb(), id).catch((e) => {
			if (e instanceof NativeEventNotFound) throw new EventLoadError(404, e.message);
			throw new EventLoadError(502, "Couldn't load that ThenToMeet event. Try again.");
		})
	);
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
