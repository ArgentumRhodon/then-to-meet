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
import { createEvent } from '$lib/events/store';
import { client, closeClients, denied, resetFirestore, SLOTS } from './helpers';

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

	it('lets anyone bump the counters, which is how joining works, but nothing else with them', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		await updateDoc(doc(visitor.db, 'events', id), {
			nextPersonId: 2,
			responseCount: 1,
			updatedAt: 5
		});
		expect(
			await denied(updateDoc(doc(visitor.db, 'events', id), { nextPersonId: 3, title: 'x' }))
		).toBe(true);
		expect(await denied(updateDoc(doc(visitor.db, 'events', id), { slots: [1] }))).toBe(true);
	});

	it('lets a signed-in user add themselves to the members, and only themselves', async () => {
		const { owner, id } = await owned();
		const joiner = await client();
		const ref = doc(joiner.db, 'events', id);
		const counters = { nextPersonId: 2, responseCount: 1, updatedAt: 5 };

		await updateDoc(ref, { ...counters, memberUids: arrayUnion(joiner.user!.uid) });
		expect((await getDoc(ref)).data()?.memberUids).toEqual([owner.user!.uid, joiner.user!.uid]);

		expect(
			await denied(updateDoc(ref, { ...counters, memberUids: arrayUnion('someone-else') }))
		).toBe(true);
		expect(await denied(updateDoc(ref, { ...counters, memberUids: [joiner.user!.uid] }))).toBe(
			true
		);
	});

	it('does not let a signed-out visitor touch the members', async () => {
		const { id } = await owned();
		const visitor = await client(false);
		expect(
			await denied(
				updateDoc(doc(visitor.db, 'events', id), {
					nextPersonId: 2,
					responseCount: 1,
					updatedAt: 5,
					memberUids: arrayUnion('anon')
				})
			)
		).toBe(true);
	});
});
