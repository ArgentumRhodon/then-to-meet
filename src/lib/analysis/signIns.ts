import type { Person } from '$lib/types';

/** Shortest name that counts as the start of a longer one, so "Al" doesn't match "Alexandra". */
const MIN_PREFIX = 3;

const plain = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** "Amy L." → "amyl": letters and digits only, lowercase, accents dropped. */
const key = (name: string) => plain(name).replace(/[^\p{L}\p{N}]/gu, '');

const words = (name: string) =>
	plain(name)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

/**
 * Whether two sign-in names are probably the same person: equal once case, spaces, punctuation,
 * and accents are ignored ("AmyL" and "Amy L"), or one the start of the other ("Noah" and
 * "Noah Smith", "arrr" and "arrrr"), including a short first name on its own ("Ed" and "Ed Ruiz").
 */
export const sameName = (a: string, b: string): boolean => {
	const ka = key(a);
	const kb = key(b);
	if (!ka || !kb) return false;
	if (ka === kb) return true;
	const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
	if (short.length >= MIN_PREFIX && long.startsWith(short)) return true;
	const [wa, wb] = [words(a), words(b)];
	const [fewer, more] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
	return fewer.every((word, i) => more[i] === word);
};

export interface SignIns {
	/** Signed in without marking times, and not someone who responded under another name. */
	waiting: Person[];
	/** Empty sign-ins that look like someone else in the poll, usually an abandoned first try. */
	extras: { person: Person; like: Person }[];
}

/**
 * Sorts out who's really still to respond. When2Meet keeps every sign-in, so someone who signed in
 * as "AmyL", then again as "Amy L" to mark their times, leaves an empty "AmyL" behind.
 */
export const splitSignIns = (noTimes: Person[], people: Person[]): SignIns => {
	const waiting: Person[] = [];
	const extras: SignIns['extras'] = [];
	for (const person of noTimes) {
		const like =
			people.find((p) => sameName(p.name, person.name)) ??
			waiting.find((p) => sameName(p.name, person.name));
		if (like) extras.push({ person, like });
		else waiting.push(person);
	}
	return { waiting, extras };
};
