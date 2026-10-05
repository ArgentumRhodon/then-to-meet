import type { PeopleGroup, Person, Roles } from '$lib/types';
import { userData } from './userData';

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');
const sameName = (a: string, b: string) =>
	cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase();

const newId = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2);

/** The roles that aren't required, for just these people. */
const rolesFor = (members: number[], roles: Roles): Roles => {
	const out: Roles = {};
	for (const id of members) {
		if (roles[id] && roles[id] !== 'required') out[id] = roles[id];
	}
	return out;
};

/** The group with new members, and roles for only those still in it. */
const withMembers = (group: PeopleGroup, members: number[]): PeopleGroup => ({
	...group,
	members,
	roles: rolesFor(members, group.roles ?? {})
});

/** The people in this event who belong to the group, in the event's order. */
export const membersIn = (group: PeopleGroup, people: Person[]): Person[] => {
	const ids = new Set(group.members);
	return people.filter((p) => ids.has(p.id));
};

/**
 * Saved groups of people for the open event. Each event keeps its own groups, in the signed-in
 * user's account (signed out, they last for the visit).
 */
class Groups {
	items = $state.raw<PeopleGroup[]>([]);
	#eventId: string | null = null;

	/**
	 * Switches to an event's groups (as loaded from the account), or clears them for `null`.
	 * Groups saved before each one had its own roles start from `fallbackRoles`, the roles they
	 * used to share.
	 */
	load(eventId: string | null, stored: PeopleGroup[] = [], fallbackRoles: Roles = {}) {
		this.#eventId = eventId;
		this.items = stored.map((g) =>
			g.roles && typeof g.roles === 'object'
				? g
				: { ...g, roles: rolesFor(g.members, fallbackRoles) }
		);
	}

	get(id: string | null): PeopleGroup | undefined {
		return id ? this.items.find((g) => g.id === id) : undefined;
	}

	hasName(name: string): boolean {
		return this.items.some((g) => sameName(g.name, name));
	}

	/** A placeholder name no group uses yet: "Group 1", "Group 2", and so on. */
	nextName(): string {
		let n = this.items.length + 1;
		while (this.hasName(`Group ${n}`)) n++;
		return `Group ${n}`;
	}

	/** Creates a group, or adds to the existing one if the name is already taken. */
	create(name: string, members: Iterable<number>): PeopleGroup {
		const existing = this.items.find((g) => sameName(g.name, name));
		if (existing) {
			this.addMembers(existing.id, members);
			return this.get(existing.id)!;
		}
		const group = { id: newId(), name: cleanName(name), members: [...new Set(members)], roles: {} };
		this.#save([...this.items, group]);
		return group;
	}

	rename(id: string, name: string) {
		if (cleanName(name)) this.#update(id, (g) => ({ ...g, name: cleanName(name) }));
	}

	/** Replaces the group's roles, keeping only its members'. */
	setRoles(id: string, roles: Roles) {
		this.#update(id, (g) => ({ ...g, roles: rolesFor(g.members, roles) }));
	}

	setMembers(id: string, members: Iterable<number>) {
		this.#update(id, (g) => withMembers(g, [...new Set(members)]));
	}

	/** New members start out required. */
	addMembers(id: string, members: Iterable<number>) {
		this.#update(id, (g) => withMembers(g, [...new Set([...g.members, ...members])]));
	}

	removeMembers(id: string, members: Iterable<number>) {
		const drop = new Set(members);
		this.#update(id, (g) =>
			withMembers(
				g,
				g.members.filter((m) => !drop.has(m))
			)
		);
	}

	/** Deletes a group and returns a function that puts it back where it was. */
	remove(id: string): () => void {
		const index = this.items.findIndex((g) => g.id === id);
		const group = this.items[index];
		this.#save(this.items.filter((g) => g.id !== id));
		return () => {
			if (!group || this.get(id)) return;
			this.#save(this.items.toSpliced(index, 0, group));
		};
	}

	#update(id: string, fn: (g: PeopleGroup) => PeopleGroup) {
		this.#save(this.items.map((g) => (g.id === id ? fn(g) : g)));
	}

	#save(items: PeopleGroup[]) {
		this.items = items;
		if (this.#eventId) userData.queueEvent(this.#eventId, { groups: items });
	}
}

export const groups = new Groups();
