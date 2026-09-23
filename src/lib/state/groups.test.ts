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

	it('keeps each event’s groups separate', () => {
		groups.create('Leads', [1]);
		groups.load('event-b');
		expect(groups.items).toEqual([]);
		groups.load(null);
		expect(groups.items).toEqual([]);
	});
});
