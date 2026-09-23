const EVENT_ID = /^\d+-\w+$/;
const EVENT_ID_IN_TEXT = /(\d+-\w+)/;

/** The special ID that loads the built-in demo event. */
export const DEMO_ID = 'demo';

export const isEventId = (value: string): boolean => value === DEMO_ID || EVENT_ID.test(value);

/**
 * Pulls a When2Meet event ID out of whatever the user pasted: a full link
 * (`https://www.when2meet.com/?12345678-AbCdE`), a link with extra params, or the bare ID.
 */
export const extractEventId = (input: string): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (trimmed.toLowerCase() === DEMO_ID) return DEMO_ID;
	return trimmed.match(EVENT_ID_IN_TEXT)?.[1] ?? null;
};

export const eventUrl = (id: string): string => `https://www.when2meet.com/?${id}`;
