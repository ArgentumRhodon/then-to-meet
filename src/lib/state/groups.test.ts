import { beforeEach, describe, expect, it } from 'vitest';
import { groups, membersIn } from './groups.svelte';

const people = [
	{ id: 1, name: 'Alex' },
	{ id: 2, name: 'Sam' },
	{ id: 3, name: 'Mei' }
];

describe('groups', () => {
	beforeEach(() => groups.load('event-a'));

	it('creates groups and finds their members by ID', () => {
		const leads = groups.create('  Leads ', [3, 1, 1]);
		expect(leads.name).toBe('Leads');
		expect(membersIn(leads, people).map((p) => p.name)).toEqual(['Alex', 'Mei']);
	});

	it('adds to an existing group instead of duplicating a name', () => {
		groups.create('Leads', [1]);
		groups.create('leads', [2]);
		expect(groups.items).toHaveLength(1);
		expect(groups.items[0].members).toEqual([1, 2]);
		expect(groups.hasName('LEADS')).toBe(true);
	});

	it('edits and removes members', () => {
		const { id } = groups.create('Design', [1, 2]);
		groups.addMembers(id, [3]);
		groups.removeMembers(id, [1]);
		expect(groups.get(id)!.members).toEqual([2, 3]);
		groups.setMembers(id, [1]);
		groups.rename(id, 'Design team');
		expect(groups.get(id)).toMatchObject({ name: 'Design team', members: [1] });
		groups.remove(id);
		expect(groups.items).toEqual([]);
	});

	it('keeps roles per group, only for members', () => {
		const leads = groups.create('Leads', [1, 2]);
		const design = groups.create('Design', [2, 3]);
		expect(leads.roles).toEqual({});
		groups.setRoles(leads.id, { 1: 'optional', 2: 'skip', 3: 'optional' });
		expect(groups.get(leads.id)!.roles).toEqual({ 1: 'optional', 2: 'skip' });
		expect(groups.get(design.id)!.roles).toEqual({});
		groups.removeMembers(leads.id, [2]);
		groups.addMembers(leads.id, [2]);
		expect(groups.get(leads.id)!.roles).toEqual({ 1: 'optional' });
	});

	it('puts a deleted group back where it was', () => {
		groups.create('A', [1]);
		const { id } = groups.create('B', [2]);
		groups.create('C', [3]);
		const undo = groups.remove(id);
		expect(groups.items.map((g) => g.name)).toEqual(['A', 'C']);
		undo();
		undo();
		expect(groups.items.map((g) => g.name)).toEqual(['A', 'B', 'C']);
	});

	it('suggests a placeholder name that isn’t taken', () => {
		expect(groups.nextName()).toBe('Group 1');
		groups.create('Group 2', [1]);
		expect(groups.nextName()).toBe('Group 3');
	});

	it('keeps each event’s groups separate', () => {
		groups.create('Leads', [1]);
		groups.load('event-b');
		expect(groups.items).toEqual([]);
		groups.load(null);
		expect(groups.items).toEqual([]);
	});
});
