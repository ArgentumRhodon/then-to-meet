import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	arrayUnion,
	where
} from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { responseKey } from '$lib/events/model';
import { createEvent } from '$lib/events/store';
import {
	client,
	closeClients,
	denied,
	joinBatch,
	joinUpdate,
	resetFirestore,
	SLOTS
} from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

const newEvent = { title: 'Lunch', weekly: false, slotSeconds: 900, slots: SLOTS };

/** An event made by a fresh owner. */
const owned = async () => {
	const owner = await client();
	const id = await createEvent(owner.db, owner.user!, newEvent);
	return { owner, id };
};

describe('reading events', () => {
	it('lets anyone with the ID read an event, signed in or not', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const stranger = await client();
		expect((await getDoc(doc(visitor.db, 'events', id))).data()?.title).toBe('Lunch');
		expect((await getDoc(doc(stranger.db, 'events', id))).exists()).toBe(true);
	});

	it('lets a user list the events they belong to, and no one else’s', async () => {
		const { owner, id } = await owned();
		const mine = query(
			collection(owner.db, 'events'),
			where('memberUids', 'array-contains', owner.user!.uid)
		);
		expect((await getDocs(mine)).docs.map((d) => d.id)).toEqual([id]);

		const stranger = await client();
		const theirs = query(
			collection(stranger.db, 'events'),
			where('memberUids', 'array-contains', owner.user!.uid)
		);
		expect(await denied(getDocs(theirs))).toBe(true);
	});

	it('does not let anyone browse every event', async () => {
		await owned();
		const stranger = await client();
		const visitor = await client(false);
		expect(await denied(getDocs(collection(stranger.db, 'events')))).toBe(true);
		expect(await denied(getDocs(collection(visitor.db, 'events')))).toBe(true);
	});
});

describe('creating events', () => {
	const base = (ownerId: string) => ({
		ownerId,
		title: 'x',
		weekly: false,
		slotSeconds: 900,
		slots: SLOTS,
		nextPersonId: 1,
		responseCount: 0,
		memberUids: [ownerId],
		source: { type: 'thentomeet' },
		createdAt: 1,
		updatedAt: 1
	});

	it('needs an account, and makes the creator the owner', async () => {
		const { owner, id } = await owned();
		expect((await getDoc(doc(owner.db, 'events', id))).data()).toMatchObject({
			ownerId: owner.user!.uid,
			memberUids: [owner.user!.uid]
		});
		const visitor = await client(false);
		expect(
			await denied(
				createEvent(visitor.db, { uid: 'x', name: null, email: null, picture: null }, newEvent)
			)
		).toBe(true);
	});

	it('refuses an event owned by someone else, or that leaves its creator out', async () => {
		const a = await client();
		const b = await client();
		expect(await denied(setDoc(doc(a.db, 'events', 'e1'), base(b.user!.uid)))).toBe(true);
		expect(
			await denied(setDoc(doc(a.db, 'events', 'e2'), { ...base(a.user!.uid), memberUids: [] }))
		).toBe(true);
	});

	it('refuses an event with more slots than allowed', async () => {
		const a = await client();
		const slots = Array.from({ length: 5001 }, (_, i) => i);
		expect(await denied(setDoc(doc(a.db, 'events', 'big'), { ...base(a.user!.uid), slots }))).toBe(
			true
		);
	});
});

describe('changing and deleting events', () => {
	it('lets the owner edit and delete', async () => {
		const { owner, id } = await owned();
		await updateDoc(doc(owner.db, 'events', id), { title: 'Dinner' });
		expect((await getDoc(doc(owner.db, 'events', id))).data()?.title).toBe('Dinner');
		await deleteDoc(doc(owner.db, 'events', id));
		expect((await getDoc(doc(owner.db, 'events', id))).exists()).toBe(false);
	});

	it('does not let anyone else edit or delete', async () => {
		const { id } = await owned();
		const stranger = await client();
		const visitor = await client(false);
		for (const other of [stranger, visitor]) {
			expect(await denied(updateDoc(doc(other.db, 'events', id), { title: 'Hijacked' }))).toBe(
				true
			);
			expect(await denied(updateDoc(doc(other.db, 'events', id), { ownerId: 'me' }))).toBe(true);
			expect(await denied(deleteDoc(doc(other.db, 'events', id)))).toBe(true);
		}
	});

	const ada = (uid: string | null = null) => ({
		personId: 1,
		name: 'Ada',
		uid,
		available: [SLOTS[0]],
		updatedAt: 1
	});
	const ADA = responseKey('Ada');

	it('lets anyone join, which moves the counters up by one with the new response, and nothing else', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const ref = doc(visitor.db, 'events', id);
		const other = (change: object) => ({ event: change });

		// Each of these differs from a real join in one way.
		expect(await denied(joinBatch(visitor, id, ADA, ada(), other({ title: 'x' })))).toBe(true);
		expect(await denied(joinBatch(visitor, id, ADA, ada(), other({ slots: [1] })))).toBe(true);
		expect(await denied(joinBatch(visitor, id, ADA, ada(), other({ nextPersonId: 3 })))).toBe(true);
		expect(await denied(joinBatch(visitor, id, ADA, ada(), other({ responseCount: 2 })))).toBe(
			true
		);
		expect(await denied(joinBatch(visitor, id, ADA, ada(), other({ lastJoin: 'n:other' })))).toBe(
			true
		);
		await joinBatch(visitor, id, ADA, ada());
		expect((await getDoc(ref)).data()).toMatchObject({
			nextPersonId: 2,
			responseCount: 1,
			lastJoin: ADA
		});
	});

	it('does not let the counters move without a response, or go down', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const ref = doc(visitor.db, 'events', id);
		// A bump on its own, and one naming a response that was never written.
		expect(await denied(updateDoc(ref, await joinUpdate(visitor.db, id, ADA)))).toBe(true);
		expect(await denied(updateDoc(ref, { nextPersonId: 2, responseCount: 1, updatedAt: 5 }))).toBe(
			true
		);
		await joinBatch(visitor, id, ADA, ada());
		const bump = await joinUpdate(visitor.db, id, 'n:bo');
		// Down, or the same value, are not joins either.
		expect(await denied(updateDoc(ref, { responseCount: 0, updatedAt: 5 }))).toBe(true);
		expect(await denied(updateDoc(ref, { nextPersonId: 1, updatedAt: 5 }))).toBe(true);
		// Only the owner can reset or hand out counters.
		expect(await denied(updateDoc(ref, { ...bump, nextPersonId: 99 }))).toBe(true);
	});

	it('lets an edit note when the event last changed, and nothing more', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const ref = doc(visitor.db, 'events', id);
		await updateDoc(ref, { updatedAt: 7 });
		expect((await getDoc(ref)).data()?.updatedAt).toBe(7);
		expect(await denied(updateDoc(ref, { updatedAt: 8, title: 'x' }))).toBe(true);
	});

	it('lets a signed-in user add themselves to the members, and only themselves', async () => {
		const { owner, id } = await owned();
		const joiner = await client();
		const uid = joiner.user!.uid;
		const withMembers = (memberUids: unknown) => ({ event: { memberUids } });

		expect(
			await denied(joinBatch(joiner, id, ADA, ada(uid), withMembers(arrayUnion('someone-else'))))
		).toBe(true);
		expect(await denied(joinBatch(joiner, id, ADA, ada(uid), withMembers([uid])))).toBe(true);
		await joinBatch(joiner, id, ADA, ada(uid), withMembers(arrayUnion(uid)));
		expect((await getDoc(doc(joiner.db, 'events', id))).data()?.memberUids).toEqual([
			owner.user!.uid,
			uid
		]);
	});

	it('does not let a signed-out visitor touch the members', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		const attempt = (event: object) => joinBatch(visitor, id, ADA, ada(), { event });
		expect(await denied(attempt({ memberUids: arrayUnion('anon') }))).toBe(true);
		await attempt({});
	});
});
