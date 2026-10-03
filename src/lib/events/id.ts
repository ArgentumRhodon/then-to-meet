import { DEMO_ID, extractEventId, isEventId as isWhen2MeetId } from '$lib/w2m/id';

/**
 * ThenToMeet's own event IDs are Firestore auto-IDs: 20 letters and digits. When2Meet's always
 * contain a hyphen, so the two can never be mistaken for each other.
 */
const NATIVE_ID = /^[A-Za-z0-9]{20}$/;
const NATIVE_ID_IN_LINK = /[?&]e=([A-Za-z0-9]{20})(?![A-Za-z0-9])/;

export const isNativeEventId = (value: string): boolean => NATIVE_ID.test(value);

/** Whether this is an ID the app can open, from either service (or the demo). */
export const isAnyEventId = (value: string): boolean =>
	isWhen2MeetId(value) || isNativeEventId(value);

/** Whether this is a When2Meet poll's ID that can be copied into ThenToMeet (the demo can't). */
export const isImportableId = (value: string): boolean => value !== DEMO_ID && isWhen2MeetId(value);

/**
 * Pulls an event ID out of whatever was pasted: anything `extractEventId` reads (When2Meet links
 * and IDs), or a ThenToMeet link with `?e=<id>`.
 */
export const extractAnyEventId = (input: string): string | null =>
	extractEventId(input) ?? input.match(NATIVE_ID_IN_LINK)?.[1] ?? null;
