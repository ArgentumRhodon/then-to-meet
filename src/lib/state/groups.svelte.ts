import { browser } from '$app/environment';
import type { PeopleGroup, Person } from '$lib/types';
import { readJson, removeKey, writeJson } from './storage';

const keyFor = (eventId: string) => `ttm:groups:${eventId}`;

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');
const sameName = (a: string, b: string) =>
	cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase();

const newId = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);

/** The people in this event who belong to the group, in the event's order. */
export const membersIn = (group: PeopleGroup, people: Person[]): Person[] => {
	const ids = new Set(group.members);
	return people.filter((p) => ids.has(p.id));
};

/** Saved groups of people for the open event. Each event keeps its own groups. */
class Groups {
	items = $state.raw<PeopleGroup[]>([]);
	#eventId: string | null = null;

	/** Switches to the groups saved for an event, or clears them for `null`. */
	load(eventId: string | null) {
		this.#eventId = eventId;
		const stored = eventId && browser ? readJson<PeopleGroup[]>(keyFor(eventId), []) : [];
		this.items = Array.isArray(stored)
			? stored.filter((g) => g?.id && g?.name && Array.isArray(g.members))
			: [];
	}

	get(id: string | null): PeopleGroup | undefined {
		return id ? this.items.find((g) => g.id === id) : undefined;
	}

	hasName(name: string): boolean {
		return this.items.some((g) => sameName(g.name, name));
	}

	/** Creates a group, or adds to the existing one if the name is already taken. */
	create(name: string, members: Iterable<number>): PeopleGroup {
		const existing = this.items.find((g) => sameName(g.name, name));
		if (existing) {
			this.addMembers(existing.id, members);
			return this.get(existing.id)!;
		}
		const group = { id: newId(), name: cleanName(name), members: [...new Set(members)] };
		this.#save([...this.items, group]);
		return group;
	}

	rename(id: string, name: string) {
		if (cleanName(name)) this.#update(id, (g) => ({ ...g, name: cleanName(name) }));
	}

	setMembers(id: string, members: Iterable<number>) {
		this.#update(id, (g) => ({ ...g, members: [...new Set(members)] }));
	}

	addMembers(id: string, members: Iterable<number>) {
		this.#update(id, (g) => ({ ...g, members: [...new Set([...g.members, ...members])] }));
	}

	removeMembers(id: string, members: Iterable<number>) {
		const drop = new Set(members);
		this.#update(id, (g) => ({ ...g, members: g.members.filter((m) => !drop.has(m)) }));
	}

	remove(id: string) {
		this.#save(this.items.filter((g) => g.id !== id));
	}

	#update(id: string, fn: (g: PeopleGroup) => PeopleGroup) {
		this.#save(this.items.map((g) => (g.id === id ? fn(g) : g)));
	}

	#save(items: PeopleGroup[]) {
		this.items = items;
		if (!this.#eventId) return;
		if (items.length) writeJson(keyFor(this.#eventId), items);
		else removeKey(keyFor(this.#eventId));
	}
}

export const groups = new Groups();
