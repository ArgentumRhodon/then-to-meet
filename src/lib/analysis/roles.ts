import type { PeopleGroup, Person, Roles } from '$lib/types';

/**
 * The roles the analysis should use while a group is selected (saved, or just the people checked
 * right now): members keep their own role and everyone else is treated as skipped. The saved roles
 * themselves are left alone.
 */
export const withGroup = (
	roles: Roles,
	group: Pick<PeopleGroup, 'members'> | undefined,
	people: Person[]
): Roles => {
	if (!group) return roles;
	const members = new Set(group.members);
	const out: Roles = { ...roles };
	for (const person of people) {
		if (!members.has(person.id)) out[person.id] = 'skip';
	}
	return out;
};

/** True when two role maps mean the same thing (a missing entry means required). */
export const sameRoles = (a: Roles, b: Roles): boolean => {
	const norm = (r: Roles) =>
		Object.entries(r)
			.filter(([, role]) => role !== 'required')
			.map(([id, role]) => `${id}:${role}`)
			.sort()
			.join(',');
	return norm(a) === norm(b);
};
