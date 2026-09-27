import type { Person, Slot, W2MEvent } from '$lib/types';

const TIME_OF_SLOT = /TimeOfSlot\[(\d+)\]\s*=\s*(\d+)\s*;/g;
const AVAILABLE_INIT = /AvailableAtSlot\[(\d+)\]\s*=\s*new Array\(\)\s*;/g;
const AVAILABLE_PUSH = /AvailableAtSlot\[(\d+)\]\.push\((\d+)\)\s*;/g;
const PEOPLE_NAME = /PeopleNames\[(\d+)\]\s*=\s*'((?:[^'\\]|\\.)*)'\s*;/g;
const PEOPLE_ID = /PeopleIDs\[(\d+)\]\s*=\s*(\d+)\s*;/g;
const TITLE = /<title>([\s\S]*?)<\/title>/i;

const DEFAULT_SLOT_SECONDS = 15 * 60;
/** When2Meet's "days of the week" events use timestamps from the 1970s. */
const WEEKLY_CUTOFF = Date.UTC(1980, 0, 1) / 1000;

export class EventNotFoundError extends Error {
	constructor() {
		super('No When2Meet event found at that link.');
		this.name = 'EventNotFoundError';
	}
}

/** The page is a real event, but not in a shape the parser knows: When2Meet likely changed. */
export class EventFormatError extends Error {
	constructor() {
		super("When2Meet's event page changed, so it couldn't be read.");
		this.name = 'EventFormatError';
	}
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/** Decodes the HTML entities and JS string escapes When2Meet uses for names and titles. */
export const decodeText = (raw: string): string =>
	raw
		.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, esc: string) =>
			esc.length === 5 ? String.fromCharCode(parseInt(esc.slice(1), 16)) : esc
		)
		.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
			if (body[0] === '#') {
				const code =
					body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
				return Number.isFinite(code) && code > 0 && code <= 0x10ffff
					? String.fromCodePoint(code)
					: whole;
			}
			return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
		})
		.trim();

const matchAll = (html: string, pattern: RegExp): RegExpExecArray[] =>
	Array.from(html.matchAll(new RegExp(pattern.source, pattern.flags)));

const eventName = (rawTitle: string): string =>
	decodeText(rawTitle).replace(/\s*-\s*When2meet\s*$/i, '');

const parseTitle = (html: string): string =>
	eventName(html.match(TITLE)?.[1] ?? '') || 'Untitled event';

/**
 * Why a page has no slots. When2Meet answers a missing event with a normal page titled
 * " - When2meet", so a page with a real event name but no slots means the format changed.
 */
const noSlotsError = (html: string): Error => {
	const title = html.match(TITLE);
	const name = title ? eventName(title[1]) : null;
	return name === '' || (name && /^when2meet$/i.test(name))
		? new EventNotFoundError()
		: new EventFormatError();
};

/**
 * Parses a When2Meet event page into structured data. It scans the whole document rather than a
 * specific <script> index, so When2Meet reshuffling its scripts doesn't break it.
 */
export const parseEvent = (html: string, id: string): W2MEvent => {
	const times = new Map<number, number>();
	for (const [, index, time] of matchAll(html, TIME_OF_SLOT)) {
		times.set(Number(index), Number(time));
	}
	if (times.size === 0) throw noSlotsError(html);

	const available = new Map<number, Set<number>>();
	for (const [, index] of matchAll(html, AVAILABLE_INIT)) {
		available.set(Number(index), new Set());
	}
	for (const [, index, personId] of matchAll(html, AVAILABLE_PUSH)) {
		const slot = Number(index);
		if (!available.has(slot)) available.set(slot, new Set());
		available.get(slot)!.add(Number(personId));
	}

	const slots: Slot[] = [...times.entries()]
		.map(([index, time]) => ({ time, available: [...(available.get(index) ?? [])] }))
		.sort((a, b) => a.time - b.time);

	const names = new Map<number, string>();
	for (const [, index, name] of matchAll(html, PEOPLE_NAME)) {
		names.set(Number(index), decodeText(name));
	}
	const responded = new Set(slots.flatMap((slot) => slot.available));
	const people: Person[] = [];
	const noTimes: Person[] = [];
	const listed = new Set<number>();
	for (const [, index, personId] of matchAll(html, PEOPLE_ID)) {
		const pid = Number(personId);
		if (listed.has(pid)) continue;
		listed.add(pid);
		const person = { id: pid, name: names.get(Number(index)) || `Person ${listed.size}` };
		// When2Meet lists everyone who signed in, including people who haven't marked a time yet.
		(responded.has(pid) ? people : noTimes).push(person);
	}

	let slotSeconds = Infinity;
	for (let i = 1; i < slots.length; i++) {
		const gap = slots[i].time - slots[i - 1].time;
		if (gap > 0 && gap < slotSeconds) slotSeconds = gap;
	}

	return {
		id,
		title: parseTitle(html),
		weekly: slots[0].time < WEEKLY_CUTOFF,
		slotSeconds: Number.isFinite(slotSeconds) ? slotSeconds : DEFAULT_SLOT_SECONDS,
		slots,
		people,
		noTimes,
		fetchedAt: Date.now()
	};
};
