import { describe, expect, it } from 'vitest';
import { sameRoles, withGroup } from './roles';

const people = [
	{ id: 1, name: 'Alex' },
	{ id: 2, name: 'Sam' },
	{ id: 3, name: 'Mei' }
];

describe('withGroup', () => {
	it('skips everyone outside the group and keeps members’ own roles', () => {
		const group = { id: 'g', name: 'Leads', members: [1, 2] };
		expect(withGroup({ 2: 'optional', 3: 'optional' }, group, people)).toEqual({
			2: 'optional',
			3: 'skip'
		});
	});

	it('returns the roles untouched with no group', () => {
		const roles = { 1: 'skip' as const };
		expect(withGroup(roles, undefined, people)).toBe(roles);
	});
});

describe('sameRoles', () => {
	it('treats a missing entry as required', () => {
		expect(sameRoles({ 1: 'required', 2: 'skip' }, { 2: 'skip' })).toBe(true);
		expect(sameRoles({ 2: 'skip' }, { 2: 'optional' })).toBe(false);
		expect(sameRoles({}, { 3: 'skip' })).toBe(false);
	});
});
