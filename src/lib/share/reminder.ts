import { formatList } from '$lib/analysis/format';
import type { Person, W2MEvent } from '$lib/types';
import { DEMO_ID, eventUrl } from '$lib/w2m/id';

/** A friendly nudge for people who signed in to the poll but never marked any times. */
export const buildReminder = (event: W2MEvent, people: Person[]): string => {
	const who = formatList(people.map((p) => p.name));
	const link = event.id === DEMO_ID ? '' : ` ${eventUrl(event.id)}`;
	return (
		`Hi ${who}! You signed in to “${event.title}” on When2Meet but haven’t marked any times ` +
		`yet. Could you add yours?${link}`
	);
};
