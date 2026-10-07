import { describe, expect, it } from 'vitest';
import { findBestTimes } from '$lib/analysis/bestTimes';
import { buildGrid } from '$lib/analysis/grid';
import type { W2MEvent } from '$lib/types';
import { demoEventHtml } from '$lib/w2m/demo';
import { parseEvent } from '$lib/w2m/parse';
import {
	importDocs,
	InvalidInput,
	parseName,
	parsePassword,
	PasswordRequired,
	WrongPassword,
	parseResponse,
	responseKey,
	parseNewEvent,
	planResync,
	pulseOf,
	summarize,
	toEvent,
	type EventDoc,
	type ResponseDoc
} from './model';

const NOW = new Date('2026-09-23T12:00:00Z');
const poll = parseEvent(demoEventHtml(NOW), 'demo');
const OWNER = 'uid-owner';

/** An imported poll as it comes back out of storage. */
const roundTrip = (event: W2MEvent): W2MEvent => {
	const { event: doc, responses } = importDocs(event, OWNER, 1000);
	return toEvent(
		'copy',
		doc,
		responses.map((r) => r.doc),
		event.fetchedAt
	);
};

describe('importing a When2Meet poll', () => {
	it('reads back as the same event, so everything built on W2MEvent works unchanged', () => {
		const copy = roundTrip(poll);
		expect(copy.title).toBe(poll.title);
		expect(copy.weekly).toBe(poll.weekly);
		expect(copy.slotSeconds).toBe(poll.slotSeconds);
		expect(copy.people).toEqual(poll.people);
		expect(copy.noTimes).toEqual(poll.noTimes);
		expect(copy.slots.map((s) => s.time)).toEqual(poll.slots.map((s) => s.time));
		for (const [i, slot] of copy.slots.entries()) {
			expect([...slot.available].sort()).toEqual([...poll.slots[i].available].sort());
		}
	});

	it('gives the same best times as the original', () => {
		const copy = roundTrip(poll);
		const best = (event: W2MEvent) =>
			findBestTimes(event, buildGrid(event, 'America/New_York'), {}, 60);
		const strip = (b: ReturnType<typeof best>) =>
			JSON.stringify(b, (k, v) => (k === 'id' ? undefined : v));
		expect(strip(best(copy))).toBe(strip(best(poll)));
	});

	it('keeps weekly polls weekly', () => {
		const weekly: W2MEvent = { ...poll, weekly: true };
		expect(roundTrip(weekly).weekly).toBe(true);
	});

	it('keeps each person’s ID, so saved roles and groups still point at them', () => {
		const { responses } = importDocs(poll, OWNER, 1000);
		expect(responses.map((r) => r.doc.personId).sort()).toEqual(
			[...poll.people, ...poll.noTimes].map((p) => p.id).sort()
		);
	});

	it('starts new people after the highest imported ID', () => {
		const { event } = importDocs(poll, OWNER, 1000);
		const highest = Math.max(...[...poll.people, ...poll.noTimes].map((p) => p.id));
		expect(event.nextPersonId).toBe(highest + 1);
	});

	it('records the owner, the source poll, and a response count', () => {
		const { event } = importDocs(poll, OWNER, 1000);
		expect(event.ownerId).toBe(OWNER);
		expect(event.memberUids).toEqual([OWNER]);
		expect(event.source).toEqual({ type: 'when2meet', id: 'demo', importedAt: 1000 });
		expect(event.responseCount).toBe(poll.people.length + poll.noTimes.length);
	});

	it('marks the copy as ThenToMeet’s own and links back to the poll', () => {
		const copy = roundTrip(poll);
		expect(copy.source).toBe('thentomeet');
		expect(copy.importedFrom).toBe('demo');
	});

	it('files each person under their name, like signing in on When2Meet', () => {
		const { responses } = importDocs(poll, OWNER, 1000);
		for (const { id, doc } of responses) expect(id).toBe(responseKey(doc.name));
	});

	it('keeps two people with the same name apart instead of losing one', () => {
		const twins: W2MEvent = {
			...poll,
			people: [
				{ id: 1, name: 'Sam' },
				{ id: 2, name: 'sam ' }
			],
			noTimes: [],
			slots: poll.slots.map((slot) => ({ ...slot, available: [] }))
		};
		const { responses } = importDocs(twins, OWNER, 1000);
		expect(new Set(responses.map((r) => r.id)).size).toBe(2);
		expect(responses.map((r) => r.doc.personId)).toEqual([1, 2]);
	});

	it('leaves every response unowned, since When2Meet has no accounts', () => {
		const { responses } = importDocs(poll, OWNER, 1000);
		expect(responses.every((r) => r.doc.uid === null)).toBe(true);
	});
});

describe('toEvent', () => {
	const doc: EventDoc = {
		ownerId: OWNER,
		title: 'Lunch',
		weekly: false,
		slotSeconds: 900,
		slots: [100, 1000, 1900],
		nextPersonId: 3,
		responseCount: 3,
		memberUids: [OWNER],
		source: { type: 'thentomeet' },
		createdAt: 1,
		updatedAt: 1
	};
	const response = (personId: number, name: string, available: number[]): ResponseDoc => ({
		personId,
		name,
		uid: null,
		available,
		updatedAt: 1
	});

	it('turns responses into per-slot availability and sets aside people with no times', () => {
		const event = toEvent(
			'abc',
			doc,
			[response(2, 'Bo', [100, 1000]), response(1, 'Ada', [1000]), response(3, 'Cy', [])],
			5
		);
		expect(event.people).toEqual([
			{ id: 1, name: 'Ada' },
			{ id: 2, name: 'Bo' }
		]);
		expect(event.noTimes).toEqual([{ id: 3, name: 'Cy' }]);
		expect(event.slots).toEqual([
			{ time: 100, available: [2] },
			{ time: 1000, available: [1, 2] },
			{ time: 1900, available: [] }
		]);
		expect(event.importedFrom).toBeUndefined();
		expect(event.ownerId).toBe(OWNER);
		expect(event.fetchedAt).toBe(5);
	});

	it('marks people whose entries have a password, and no one else', () => {
		const event = toEvent('abc', doc, [
			{ ...response(1, 'Ada', [100]), salt: '1000$' + 'ab'.repeat(16), nonce: 'n'.repeat(32) },
			response(2, 'Bo', [])
		]);
		expect(event.people).toEqual([{ id: 1, name: 'Ada', locked: true }]);
		expect(event.noTimes).toEqual([{ id: 2, name: 'Bo' }]);
	});

	it('keeps which account answered under a name, so the page can tell which entry is yours', () => {
		const event = toEvent('abc', doc, [
			{ ...response(1, 'Ada', [100]), uid: 'uid-ada' },
			response(2, 'Bo', [100])
		]);
		expect(event.people).toEqual([
			{ id: 1, name: 'Ada', uid: 'uid-ada' },
			{ id: 2, name: 'Bo' }
		]);
	});

	it('works for an event nobody has answered yet', () => {
		const event = toEvent('abc', doc, []);
		expect(event.people).toEqual([]);
		expect(event.slots).toHaveLength(3);
	});
});

describe('parseNewEvent', () => {
	it('cleans the title, sorts and dedupes slots, and defaults to 15-minute slots', () => {
		expect(parseNewEvent({ title: '  Team   sync ', slots: [900, 0, 900] })).toEqual({
			title: 'Team sync',
			weekly: false,
			slotSeconds: 900,
			slots: [0, 900]
		});
	});

	it.each([
		['not an object', null],
		['no title', { title: ' ', slots: [0] }],
		['no slots', { title: 'x', slots: [] }],
		['slots not a list', { title: 'x', slots: 'soon' }],
		['fractional times', { title: 'x', slots: [1.5] }],
		['negative times', { title: 'x', slots: [-900] }],
		['odd slot length', { title: 'x', slots: [0], slotSeconds: 7 }],
		['too many slots', { title: 'x', slots: Array.from({ length: 5001 }, (_, i) => i) }]
	])('rejects %s', (_, body) => {
		expect(() => parseNewEvent(body)).toThrow(InvalidInput);
	});
});

describe('parseResponse', () => {
	const slots = [0, 900, 1800];

	it('takes a name and times the event has, in time order', () => {
		expect(parseResponse({ name: ' Ada ', available: [1800, 0] }, slots)).toEqual({
			name: 'Ada',
			available: [0, 1800]
		});
		expect(parseResponse({ name: 'Ada', available: [] }, slots).available).toEqual([]);
	});

	it('needs a name, since the name is who the response is', () => {
		expect(() => parseResponse({ available: [0] }, slots)).toThrow('Enter your name.');
		expect(() => parseResponse({ name: '   ', available: [0] }, slots)).toThrow(InvalidInput);
	});

	it('rejects times outside the event', () => {
		expect(() => parseResponse({ name: 'Ada', available: [450] }, slots)).toThrow(InvalidInput);
	});

	it('rejects a body that is not a name and times', () => {
		expect(() => parseResponse({ name: 'Ada', available: 'all' }, slots)).toThrow(InvalidInput);
		expect(() => parseResponse(undefined, slots)).toThrow(InvalidInput);
	});
});

describe('parseName', () => {
	it('trims and collapses spaces, and caps the length', () => {
		expect(parseName({ name: '  Ada   Lovelace ' })).toBe('Ada Lovelace');
		expect(parseName({ name: 'x'.repeat(100) })).toHaveLength(60);
	});
});

describe('responseKey', () => {
	it('is the same person however the name is capitalized or spaced', () => {
		expect(responseKey('Ada Lovelace')).toBe(responseKey('  ada   LOVELACE '));
	});

	it('tells different names apart', () => {
		expect(responseKey('Ada')).not.toBe(responseKey('Ada L'));
	});

	it('is safe as a Firestore document ID', () => {
		for (const name of ['a/b', '..', '__x__', 'Diego Álvarez', '名前', 'o’brien']) {
			const key = responseKey(name);
			expect(key).not.toContain('/');
			expect(key.startsWith('n:')).toBe(true);
			expect(key.length).toBeLessThan(1500);
		}
	});

	it('treats visually identical Unicode as one name', () => {
		// "Á" as one character, and as "A" plus a combining accent.
		expect(responseKey('Álvarez')).toBe(responseKey('Álvarez'));
	});
});

describe('parsePassword', () => {
	it('is null when there is none, including an empty one', () => {
		expect(parsePassword({ name: 'Ada' })).toBeNull();
		expect(parsePassword({ password: '' })).toBeNull();
		expect(parsePassword({ password: null })).toBeNull();
		expect(parsePassword(undefined)).toBeNull();
	});

	it('keeps the password exactly as typed, spaces included', () => {
		expect(parsePassword({ password: ' open sesame ' })).toBe(' open sesame ');
	});

	it('rejects passwords that are not text or are too long', () => {
		expect(() => parsePassword({ password: 1234 })).toThrow(InvalidInput);
		expect(() => parsePassword({ password: 'x'.repeat(101) })).toThrow(InvalidInput);
		expect(parsePassword({ password: 'x'.repeat(100) })).toHaveLength(100);
	});
});

describe('password errors', () => {
	it('say what to do', () => {
		expect(new PasswordRequired().message).toMatch(/Enter it/);
		expect(new WrongPassword().message).toMatch(/wrong/);
		expect(new PasswordRequired()).toBeInstanceOf(Error);
	});
});

describe('planResync', () => {
	const T = [1000, 1900, 2800, 3700];
	const pollWith = (
		people: [number, string, number[]][],
		times = T,
		extra: Partial<W2MEvent> = {}
	): W2MEvent => ({
		id: '1-abc',
		title: 'Sync',
		weekly: false,
		slotSeconds: 900,
		slots: times.map((time) => ({
			time,
			available: people.filter(([, , free]) => free.includes(time)).map(([id]) => id)
		})),
		people: people.map(([id, name]) => ({ id, name })),
		noTimes: [],
		fetchedAt: 1,
		...extra
	});
	const copyOf = (p: W2MEvent) => importDocs(p, OWNER, 1000);

	it('does nothing when the poll is unchanged', () => {
		const p = pollWith([[1, 'Ada', [T[0]]]]);
		const { event, responses } = copyOf(p);
		const plan = planResync(event, responses, p, 5000);
		expect(plan.event).toEqual({});
		expect(plan.responses).toEqual([]);
		expect(plan.report).toEqual({ added: 0, updated: 0, kept: 0, slotsAdded: 0, touched: [] });
	});

	it('updates people whose times changed, and adds new ones with the copy’s own IDs', () => {
		const before = pollWith([
			[1, 'Ada', [T[0]]],
			[2, 'Bo', [T[1]]]
		]);
		const { event, responses } = copyOf(before);
		const after = pollWith([
			[1, 'Ada', [T[0], T[2]]],
			[2, 'Bo', [T[1]]],
			[2000, 'Cy', [T[3]]]
		]);
		const plan = planResync(event, responses, after, 5000);
		expect(plan.report).toMatchObject({ added: 1, updated: 1, kept: 0, touched: [1, 3] });
		expect(plan.responses.map((r) => [r.doc.name, r.doc.personId, r.doc.available])).toEqual([
			['Ada', 1, [T[0], T[2]]],
			['Cy', 3, [T[3]]]
		]);
		expect(plan.event).toMatchObject({
			nextPersonId: 4,
			responseCount: 3,
			updatedAt: 5000,
			source: { type: 'when2meet', id: '1-abc', importedAt: 1000, syncedAt: 5000 }
		});
	});

	it('leaves people alone who changed here, own an account, or have a password', () => {
		const before = pollWith([
			[1, 'Ada', [T[0]]],
			[2, 'Bo', [T[0]]],
			[3, 'Cy', [T[0]]],
			[4, 'Di', [T[0]]]
		]);
		const { event, responses } = copyOf(before);
		const edited = responses.map((r) => {
			if (r.doc.name === 'Ada') return { ...r, doc: { ...r.doc, updatedAt: 2000 } };
			if (r.doc.name === 'Bo') return { ...r, doc: { ...r.doc, uid: 'u-bo' } };
			if (r.doc.name === 'Cy') return { ...r, doc: { ...r.doc, salt: 's', nonce: 'n' } };
			return r;
		});
		const after = pollWith(
			before.people.map((p) => [p.id, p.name, [T[1]]] as [number, string, number[]])
		);
		const plan = planResync(event, edited, after, 5000);
		expect(plan.report).toMatchObject({ added: 0, updated: 1, kept: 3, touched: [4] });
		expect(plan.responses.map((r) => r.doc.name)).toEqual(['Di']);
	});

	it('treats a person as the poll’s again once synced, unless they change after that', () => {
		const before = pollWith([[1, 'Ada', [T[0]]]]);
		const { event, responses } = copyOf(before);
		const second = planResync(event, responses, pollWith([[1, 'Ada', [T[1]]]]), 5000);
		const synced = { ...event, ...second.event } as EventDoc;
		const third = planResync(synced, second.responses, pollWith([[1, 'Ada', [T[2]]]]), 9000);
		expect(third.report.updated).toBe(1);
		const touched = [
			{ ...second.responses[0], doc: { ...second.responses[0].doc, updatedAt: 6000 } }
		];
		const fourth = planResync(synced, touched, pollWith([[1, 'Ada', [T[2]]]]), 9000);
		expect(fourth.report).toMatchObject({ updated: 0, kept: 1 });
	});

	it('keeps people who left the poll, and adds the poll’s new times', () => {
		const before = pollWith([
			[1, 'Ada', [T[0]]],
			[2, 'Bo', [T[0]]]
		]);
		const { event, responses } = copyOf(before);
		const after = pollWith([[1, 'Ada', [T[0]]]], [...T, 4600]);
		const plan = planResync(event, responses, after, 5000);
		expect(plan.report).toMatchObject({ added: 0, updated: 0, slotsAdded: 1 });
		expect(plan.event.slots).toEqual([...T, 4600]);
		expect(plan.responses).toEqual([]);
	});

	it('refuses a poll of another kind, or an event that was not imported', () => {
		const p = pollWith([[1, 'Ada', [T[0]]]]);
		const { event, responses } = copyOf(p);
		expect(() => planResync(event, responses, { ...p, slotSeconds: 1800 }, 1)).toThrow(
			InvalidInput
		);
		expect(() => planResync(event, responses, { ...p, weekly: true }, 1)).toThrow(InvalidInput);
		expect(() => planResync({ ...event, source: { type: 'thentomeet' } }, responses, p, 1)).toThrow(
			InvalidInput
		);
	});
});

describe('summarize', () => {
	const doc: EventDoc = {
		ownerId: OWNER,
		title: 'Standup',
		weekly: false,
		slotSeconds: 900,
		slots: [1000, 1900, 2800],
		nextPersonId: 4,
		responseCount: 3,
		memberUids: [OWNER, 'uid-member', 'uid-admin'],
		adminUids: ['uid-admin'],
		source: { type: 'thentomeet' },
		createdAt: 1,
		updatedAt: 2
	};

	it('sums up an event from its document, with the slots it spans', () => {
		expect(summarize('e1', doc, 'uid-member')).toEqual({
			id: 'e1',
			title: 'Standup',
			responseCount: 3,
			updatedAt: 2,
			role: 'member',
			weekly: false,
			start: 1000,
			end: 3700
		});
	});

	it('gives each account its part, and none to a stranger or someone signed out', () => {
		expect(summarize('e1', doc, OWNER).role).toBe('owner');
		expect(summarize('e1', doc, 'uid-admin').role).toBe('admin');
		expect(summarize('e1', doc, 'uid-stranger').role).toBeNull();
		expect(summarize('e1', doc, null).role).toBeNull();
	});

	it('names the poll an import came from', () => {
		const imported: EventDoc = {
			...doc,
			source: { type: 'when2meet', id: '123-abc', importedAt: 1 }
		};
		expect(summarize('e1', imported, OWNER).importedFrom).toBe('123-abc');
	});
});

describe('pulseOf', () => {
	const event: W2MEvent = {
		...poll,
		people: [{ id: 1, name: 'Ana', uid: 'uid-ana' }],
		noTimes: [{ id: 2, name: 'Ben', uid: 'uid-ben' }],
		ownerId: OWNER,
		adminUids: ['uid-admin']
	};

	it('counts everyone who responded, with or without times', () => {
		expect(pulseOf(event, null)).toEqual({ responseCount: 2, role: null });
	});

	it('finds the part an account has in an open event', () => {
		expect(pulseOf(event, OWNER).role).toBe('owner');
		expect(pulseOf(event, 'uid-admin').role).toBe('admin');
		expect(pulseOf(event, 'uid-ben').role).toBe('member');
		expect(pulseOf(event, 'uid-stranger').role).toBeNull();
	});
});
