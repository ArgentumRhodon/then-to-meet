import type { Person, Slot, W2MEvent } from '$lib/types';
import { MAX_PASSWORD } from './password';

/*
 * ThenToMeet's own events, as stored in Firestore:
 *
 *   events/{eventId}                       EventDoc
 *   events/{eventId}/responses/{id}        ResponseDoc, one per person
 *
 * Everything the analysis code knows about is a W2MEvent, so a stored event is turned into one
 * (`toEvent`) and the rest of the app can't tell where it came from. Importing a When2Meet poll
 * goes the other way (`importDocs`) and keeps its people's IDs, so the copy reads the same.
 * Times are Unix seconds, like everywhere else.
 */

export type EventSource =
	| { type: 'thentomeet' }
	/** `syncedAt` is the last time the copy was brought up to date with the poll (see `planResync`). */
	| { type: 'when2meet'; id: string; importedAt: number; syncedAt?: number };

export interface EventDoc {
	ownerId: string;
	title: string;
	weekly: boolean;
	slotSeconds: number;
	/** Start of every slot, sorted. */
	slots: number[];
	/** The ID the next person to respond gets. Person IDs are numbers, as on When2Meet. */
	nextPersonId: number;
	responseCount: number;
	/** The owner and everyone who responded; what "my events" and the security rules look at. */
	memberUids: string[];
	source: EventSource;
	/** Milliseconds. */
	createdAt: number;
	updatedAt: number;
}

export interface ResponseDoc {
	personId: number;
	name: string;
	/** The account that joined under this name, if they were signed in; null otherwise. */
	uid: string | null;
	/** Start of each slot this person can make. Empty if they haven't marked any. */
	available: number[];
	updatedAt: number;
	/**
	 * Present when the person set a password (see ./password.ts). The salt and nonce are public;
	 * the secret they unlock is in a document nobody can read. `proof` is the last change's.
	 */
	salt?: string;
	nonce?: string;
	proof?: string;
}

export interface ResponseEntry {
	id: string;
	doc: ResponseDoc;
}

export interface EventSummary {
	id: string;
	title: string;
	responseCount: number;
	updatedAt: number;
	owned: boolean;
	importedFrom?: string;
}

/** Most slots one event may have: a month of 15-minute slots is 2,880. */
export const MAX_SLOTS = 5000;
export const MAX_TITLE = 120;
export const MAX_NAME = 60;
export const SLOT_SECONDS = [900, 1800, 3600] as const;

/** A ThenToMeet event with its responses, as the rest of the app reads events. */
export const toEvent = (
	id: string,
	doc: EventDoc,
	responses: ResponseDoc[],
	fetchedAt = Date.now()
): W2MEvent => {
	const ordered = [...responses].sort((a, b) => a.personId - b.personId);
	const people: Person[] = [];
	const noTimes: Person[] = [];
	const free = new Map<number, number[]>();
	for (const r of ordered) {
		const person: Person = { id: r.personId, name: r.name };
		if (r.salt !== undefined) person.locked = true;
		if (r.uid) person.uid = r.uid;
		(r.available.length ? people : noTimes).push(person);
		for (const time of r.available) {
			const list = free.get(time);
			if (list) list.push(r.personId);
			else free.set(time, [r.personId]);
		}
	}
	const slots: Slot[] = doc.slots.map((time) => ({ time, available: free.get(time) ?? [] }));
	const event: W2MEvent = {
		id,
		title: doc.title,
		weekly: doc.weekly,
		slotSeconds: doc.slotSeconds,
		slots,
		people,
		noTimes,
		fetchedAt,
		source: 'thentomeet',
		ownerId: doc.ownerId
	};
	if (doc.source.type === 'when2meet') event.importedFrom = doc.source.id;
	return event;
};

/**
 * Document ID for a person's response, from their name: the same name, however it's capitalized
 * or spaced, is the same person, as on When2Meet where signing in under a name edits that name's
 * times. The prefix keeps IDs clear of the ones Firestore reserves.
 */
export const responseKey = (name: string): string =>
	'n:' + encodeURIComponent(name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase());

/** The slot times each person in a poll is free for, by person ID. */
const timesByPerson = (poll: W2MEvent): Map<number, number[]> => {
	const times = new Map<number, number[]>();
	for (const slot of poll.slots) {
		for (const pid of slot.available) {
			const list = times.get(pid);
			if (list) list.push(slot.time);
			else times.set(pid, [slot.time]);
		}
	}
	return times;
};

/**
 * The document ID each person in a poll is filed under. A poll never has two people with one name,
 * but if it somehow does, neither is lost.
 */
const pollKeys = (people: Person[]): Map<number, string> => {
	const taken = new Set<string>();
	const keys = new Map<number, string>();
	for (const { id, name } of people) {
		let key = responseKey(name);
		if (taken.has(key)) key += `~${id}`;
		taken.add(key);
		keys.set(id, key);
	}
	return keys;
};

/** The documents for a copy of a When2Meet poll owned by `ownerId`. */
export const importDocs = (
	poll: W2MEvent,
	ownerId: string,
	now = Date.now()
): { event: EventDoc; responses: ResponseEntry[] } => {
	const times = timesByPerson(poll);
	const everyone = [...poll.people, ...poll.noTimes];
	const keys = pollKeys(everyone);
	const responses = everyone.map(({ id, name }) => {
		return {
			id: keys.get(id)!,
			doc: {
				personId: id,
				name,
				uid: null,
				available: times.get(id) ?? [],
				updatedAt: now
			}
		};
	});
	const event: EventDoc = {
		ownerId,
		title: poll.title,
		weekly: poll.weekly,
		slotSeconds: poll.slotSeconds,
		slots: poll.slots.map((slot) => slot.time),
		nextPersonId: everyone.reduce((max, p) => Math.max(max, p.id), 0) + 1,
		responseCount: responses.length,
		memberUids: [ownerId],
		source: { type: 'when2meet', id: poll.id, importedAt: now },
		createdAt: now,
		updatedAt: now
	};
	return { event, responses };
};

/** What bringing an imported copy up to date with its poll did, or would do. */
export interface ResyncReport {
	/** People who are new on When2Meet. */
	added: number;
	/** People whose times changed on When2Meet. */
	updated: number;
	/** People changed in this copy since the import, whose times were left as they are. */
	kept: number;
	/** Times the poll gained since the last sync. */
	slotsAdded: number;
	/** Person IDs added or updated. */
	touched: number[];
}

export interface ResyncPlan {
	report: ResyncReport;
	/** The fields of the event document that change. Empty when nothing needs writing. */
	event: Partial<EventDoc>;
	/** Responses to write, in full (a new entry or a changed one). */
	responses: ResponseEntry[];
}

const sameTimes = (a: readonly number[], b: readonly number[]) =>
	a.length === b.length && a.every((t) => b.includes(t));

/**
 * Works out how to bring an imported copy up to date with its When2Meet poll, as it is now.
 *
 * The poll wins for the people who came from it, but never over something done in the copy. An
 * entry counts as the poll's when nobody here has touched it since the last sync: no account has
 * claimed it, it has no password, and it hasn't changed since. Those get the poll's times.
 * Anyone else is left as they are and counted as `kept`. People new on the poll are added, with
 * IDs from the copy's own counter (the poll's could clash with people who joined here). People
 * who left the poll stay, and the poll's new times are added to the copy's.
 */
export const planResync = (
	event: EventDoc,
	existing: ResponseEntry[],
	poll: W2MEvent,
	now = Date.now()
): ResyncPlan => {
	if (event.source.type !== 'when2meet') {
		throw new InvalidInput("This event wasn't imported from When2Meet.");
	}
	if (poll.weekly !== event.weekly || poll.slotSeconds !== event.slotSeconds) {
		throw new InvalidInput(
			'That poll has different kinds of times than this copy, so it can’t be merged.'
		);
	}
	const baseline = event.source.syncedAt ?? event.source.importedAt;
	const report: ResyncReport = { added: 0, updated: 0, kept: 0, slotsAdded: 0, touched: [] };

	const known = new Set(event.slots);
	const gained = poll.slots.map((s) => s.time).filter((t) => !known.has(t));
	if (event.slots.length + gained.length > MAX_SLOTS) {
		throw new InvalidInput('That poll has more times than ThenToMeet can hold.');
	}
	report.slotsAdded = gained.length;

	const times = timesByPerson(poll);
	const everyone = [...poll.people, ...poll.noTimes];
	const keys = pollKeys(everyone);
	const byKey = new Map(existing.map((e) => [e.id, e.doc]));
	let nextPersonId = event.nextPersonId;
	const responses: ResponseEntry[] = [];

	for (const { id, name } of everyone) {
		const key = keys.get(id)!;
		const available = [...(times.get(id) ?? [])].sort((a, b) => a - b);
		const prior = byKey.get(key);
		if (!prior) {
			const personId = nextPersonId++;
			responses.push({ id: key, doc: { personId, name, uid: null, available, updatedAt: now } });
			report.added++;
			report.touched.push(personId);
		} else if (!sameTimes(prior.available, available)) {
			if (prior.uid === null && prior.salt === undefined && prior.updatedAt <= baseline) {
				responses.push({ id: key, doc: { ...prior, available, updatedAt: now } });
				report.updated++;
				report.touched.push(prior.personId);
			} else {
				report.kept++;
			}
		}
	}

	const changed = report.added || report.updated || report.slotsAdded;
	if (!changed) return { report, event: {}, responses: [] };
	return {
		report,
		responses,
		event: {
			...(gained.length ? { slots: [...event.slots, ...gained].sort((a, b) => a - b) } : {}),
			nextPersonId,
			responseCount: event.responseCount + report.added,
			source: { ...event.source, syncedAt: now },
			updatedAt: now
		}
	};
};

export interface NewEvent {
	title: string;
	weekly: boolean;
	slotSeconds: number;
	slots: number[];
}

/** No ThenToMeet event has the requested ID. */
export class NativeEventNotFound extends Error {
	constructor() {
		super('No ThenToMeet event found at that link.');
		this.name = 'NativeEventNotFound';
	}
}

/** A failure in the times or event someone sent, worded for them. */
export class InvalidInput extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidInput';
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, max: number): string =>
	typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Slot times from a request: whole, positive, and with duplicates dropped, in order. */
const slotTimes = (value: unknown, what: string): number[] => {
	if (!Array.isArray(value) || value.length > MAX_SLOTS) {
		throw new InvalidInput(`${what} must be a list of up to ${MAX_SLOTS} times.`);
	}
	if (!value.every((t) => Number.isSafeInteger(t) && t >= 0)) {
		throw new InvalidInput(`${what} must be Unix times in seconds.`);
	}
	return [...new Set(value as number[])].sort((a, b) => a - b);
};

export const parseNewEvent = (body: unknown): NewEvent => {
	if (!isRecord(body)) throw new InvalidInput('Send the event as JSON.');
	const title = cleanText(body.title, MAX_TITLE);
	if (!title) throw new InvalidInput('Give the event a title.');
	const slotSeconds = body.slotSeconds ?? SLOT_SECONDS[0];
	if (!SLOT_SECONDS.includes(slotSeconds as (typeof SLOT_SECONDS)[number])) {
		throw new InvalidInput('Slots can be 15, 30, or 60 minutes long.');
	}
	const slots = slotTimes(body.slots, 'Slots');
	if (!slots.length) throw new InvalidInput('An event needs at least one slot.');
	return { title, weekly: body.weekly === true, slotSeconds: slotSeconds as number, slots };
};

export interface NamedTimes {
	name: string;
	available: number[];
}

/** Someone's entry has a password, and the one given is missing. */
export class PasswordRequired extends Error {
	constructor() {
		super('That name has a password. Enter it to make changes.');
		this.name = 'PasswordRequired';
	}
}

/** The password for an entry was wrong. */
export class WrongPassword extends Error {
	constructor() {
		super('That password is wrong.');
		this.name = 'WrongPassword';
	}
}

/** The password someone is setting or entering, if any. An empty one counts as none. */
export const parsePassword = (body: unknown): string | null => {
	const password = isRecord(body) ? body.password : undefined;
	if (password === undefined || password === null || password === '') return null;
	if (typeof password !== 'string') throw new InvalidInput('That password is not text.');
	if (password.length > MAX_PASSWORD) {
		throw new InvalidInput(`Passwords can be up to ${MAX_PASSWORD} characters.`);
	}
	return password;
};

/** The name someone is responding under. It picks the response, so it's needed first. */
export const parseName = (body: unknown): string => {
	if (!isRecord(body)) throw new InvalidInput('Send your name and times as JSON.');
	const name = cleanText(body.name, MAX_NAME);
	if (!name) throw new InvalidInput('Enter your name.');
	return name;
};

/** Someone's name and times for an event: the times must be the event's own. */
export const parseResponse = (body: unknown, eventSlots: readonly number[]): NamedTimes => {
	const name = parseName(body);
	const available = slotTimes((body as Record<string, unknown>).available, 'Times');
	const valid = new Set(eventSlots);
	if (!available.every((t) => valid.has(t))) {
		throw new InvalidInput("Some of those times aren't part of this event.");
	}
	return { name, available };
};
