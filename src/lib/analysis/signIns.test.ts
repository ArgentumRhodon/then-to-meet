import { describe, expect, it } from 'vitest';
import { sameName, splitSignIns } from './signIns';

const people = (...names: string[]) => names.map((name, i) => ({ id: i + 1, name }));

describe('sameName', () => {
	it('matches the same name written differently', () => {
		expect(sameName('AmyL', 'Amy L')).toBe(true);
		expect(sameName('carrie', 'Carrie')).toBe(true);
		expect(sameName('Rose R.', 'rose r')).toBe(true);
		expect(sameName('Jose', 'José')).toBe(true);
	});

	it('matches a name and a longer version of it', () => {
		expect(sameName('Noah', 'Noah Smith')).toBe(true);
		expect(sameName('Nao Belgrave', 'Nao B')).toBe(true);
		expect(sameName('arrrr', 'arrr')).toBe(true);
		expect(sameName('Kendyl', 'Kendyl Greer')).toBe(true);
		expect(sameName('Ed', 'Ed Ruiz')).toBe(true);
	});

	it('leaves different people apart', () => {
		expect(sameName('jvb3354', 'Jeremy Barruso')).toBe(false);
		expect(sameName('Al', 'Alexandra')).toBe(false);
		expect(sameName('Ed', 'Edward')).toBe(false);
		expect(sameName('Mark', 'Mack')).toBe(false);
		expect(sameName('Amy L', 'Amy K')).toBe(false);
		expect(sameName('!!!', 'Amy')).toBe(false);
	});
});

describe('splitSignIns', () => {
	it('sets aside empty sign-ins that look like someone who responded', () => {
		// The shape of a real poll: most empty sign-ins are a first try under a shorter name.
		const responded = people(
			'Carrie Wilson',
			'Daniel badger',
			'Kendyl Greer',
			'Lucas Corey',
			'Amy L'
		);
		const empty = people('carrie', 'Daniel', 'jvb3354', 'Kendyl', 'Lucas', 'AmyL').map((p) => ({
			...p,
			id: p.id + 100
		}));
		const { waiting, extras } = splitSignIns(empty, responded);
		expect(waiting.map((p) => p.name)).toEqual(['jvb3354']);
		expect(extras.map(({ person, like }) => `${person.name} → ${like.name}`)).toEqual([
			'carrie → Carrie Wilson',
			'Daniel → Daniel badger',
			'Kendyl → Kendyl Greer',
			'Lucas → Lucas Corey',
			'AmyL → Amy L'
		]);
	});

	it('only reminds someone once when they signed in twice without marking times', () => {
		const { waiting, extras } = splitSignIns(people('Priya', 'priya n'), []);
		expect(waiting.map((p) => p.name)).toEqual(['Priya']);
		expect(extras.map((e) => e.person.name)).toEqual(['priya n']);
	});
});
