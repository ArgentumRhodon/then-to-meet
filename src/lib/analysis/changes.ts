import type { W2MEvent } from '$lib/types';

/**
 * Whether two copies of an event say the same thing: the same title, times, people, and who is free
 * when. A fresh copy of an unchanged event differs only in when it was fetched.
 */
export const sameContent = (a: W2MEvent, b: W2MEvent): boolean =>
	a.title === b.title &&
	a.weekly === b.weekly &&
	a.slotSeconds === b.slotSeconds &&
	a.slots.length === b.slots.length &&
	a.slots.every(
		(slot, i) =>
			slot.time === b.slots[i].time &&
			slot.available.length === b.slots[i].available.length &&
			slot.available.every((id, j) => id === b.slots[i].available[j])
	) &&
	JSON.stringify([a.people, a.noTimes]) === JSON.stringify([b.people, b.noTimes]);

/** A short fingerprint of each person's marked times, keyed by person ID. */
export type Snapshot = Record<number, string>;

/** People who responded, or changed their times, since an earlier snapshot. */
export interface Changes {
	added: number[];
	updated: number[];
}

export const NO_CHANGES: Changes = { added: [], updated: [] };

/** FNV-1a: enough to notice that someone's times changed without storing them all. */
const hash = (text: string): string => {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
};

export const snapshot = (event: W2MEvent): Snapshot => {
	const times = new Map<number, number[]>();
	for (const slot of event.slots) {
		for (const id of slot.available) {
			if (!times.has(id)) times.set(id, []);
			times.get(id)!.push(slot.time);
		}
	}
	return Object.fromEntries(
		event.people.map((p) => [p.id, hash((times.get(p.id) ?? []).join(','))])
	);
};

/** What changed since `before`, in the event's order. A first visit has nothing to compare. */
export const changesSince = (before: Snapshot | undefined, event: W2MEvent): Changes => {
	if (!before || typeof before !== 'object') return NO_CHANGES;
	const now = snapshot(event);
	const added: number[] = [];
	const updated: number[] = [];
	for (const { id } of event.people) {
		if (!(id in before)) added.push(id);
		else if (before[id] !== now[id]) updated.push(id);
	}
	return added.length || updated.length ? { added, updated } : NO_CHANGES;
};

/** Everything in either set of changes; anyone new counts as new, not updated. */
export const mergeChanges = (a: Changes, b: Changes): Changes => {
	const added = [...new Set([...a.added, ...b.added])];
	const isNew = new Set(added);
	const updated = [...new Set([...a.updated, ...b.updated])].filter((id) => !isNew.has(id));
	return added.length || updated.length ? { added, updated } : NO_CHANGES;
};
