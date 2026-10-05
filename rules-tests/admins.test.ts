import { deleteDoc, doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
	deleteEntry,
	deleteEvent,
	resyncWhen2Meet,
	setAdmin,
	transferOwnership
} from '$lib/events/manage';
import { InvalidInput, MAX_RESPONSES, responseKey } from '$lib/events/model';
import {
	createEvent,
	importWhen2Meet,
	listEventsFor,
	loadNativeEvent,
	submitResponse
} from '$lib/events/store';
import {
	client,
	closeClients,
	denied,
	exists,
	pollOf,
	resetFirestore,
	SLOTS,
	type Client
} from './helpers';

/*
 * Admins: accounts an event's owner picks to help run it. They can do everything the owner can
 * except delete the event, hand it on, or choose who the admins are (they can step down).
 */

beforeEach(resetFirestore);
afterAll(closeClients);

const newEvent = { title: 'Lunch', weekly: false, slotSeconds: 900, slots: SLOTS };

const join = async (id: string, name: string, who: Client, extra: object = {}) => {
	await submitResponse(who.db, who.user, id, { name, available: [SLOTS[0]], ...extra });
	return who;
};

/** An event with an owner, an admin (who responded signed in), and a signed-in member who isn't. */
const staffed = async () => {
	const owner = await client();
	const id = await createEvent(owner.db, owner.user!, newEvent);
	const admin = await join(id, 'Ada', await client());
	const member = await join(id, 'Bo', await client());
	await setAdmin(owner.db, id, admin.user!.uid, true);
	return { owner, admin, member, id };
};

const adminsOf = async (who: Client, id: string): Promise<string[]> =>
	(await getDoc(doc(who.db, 'events', id))).data()?.adminUids ?? [];

describe('choosing admins', () => {
	it('lets the owner make a responder an admin, and take it back', async () => {
		const { owner, admin, id } = await staffed();
		expect(await adminsOf(owner, id)).toEqual([admin.user!.uid]);
		expect((await loadNativeEvent(owner.db, id)).adminUids).toEqual([admin.user!.uid]);

		await setAdmin(owner.db, id, admin.user!.uid, false);
		expect(await adminsOf(owner, id)).toEqual([]);
		expect((await loadNativeEvent(owner.db, id)).adminUids).toBeUndefined();
	});

	it('only makes admins of accounts that responded, other than the owner', async () => {
		const owner = await client();
		const id = await createEvent(owner.db, owner.user!, newEvent);
		const stranger = await client();
		await expect(setAdmin(owner.db, id, stranger.user!.uid, true)).rejects.toThrow(InvalidInput);
		await expect(setAdmin(owner.db, id, owner.user!.uid, true)).rejects.toThrow(InvalidInput);
	});

	it('does not let anyone else choose admins, themselves included', async () => {
		const { admin, member, id } = await staffed();
		// An admin can't add another, or take one off who isn't them.
		expect(await denied(setAdmin(admin.db, id, member.user!.uid, true))).toBe(true);
		const ref = (who: Client) => doc(who.db, 'events', id);
		expect(
			await denied(
				updateDoc(ref(member), { adminUids: arrayUnion(member.user!.uid), updatedAt: 1 })
			)
		).toBe(true);
		expect(await denied(setAdmin(member.db, id, admin.user!.uid, false))).toBe(true);
		expect(await adminsOf(admin, id)).toEqual([admin.user!.uid]);
	});

	it('lets an admin step down, and then they manage nothing', async () => {
		const { owner, admin, member, id } = await staffed();
		const other = await join(id, 'Cy', await client());
		await setAdmin(owner.db, id, other.user!.uid, true);
		// Stepping down can't take anyone else along.
		expect(
			await denied(updateDoc(doc(admin.db, 'events', id), { adminUids: [], updatedAt: 1 }))
		).toBe(true);

		await setAdmin(admin.db, id, admin.user!.uid, false);
		expect(await adminsOf(owner, id)).toEqual([other.user!.uid]);
		expect(await denied(deleteEntry(admin.db, id, 'Bo'))).toBe(true);
		expect(await exists(member.db, 'events', id, 'responses', responseKey('Bo'))).toBe(true);
	});
});

describe('what admins can do', () => {
	it('removes people, password and all, and keeps admins in their own list', async () => {
		const { owner, admin, id } = await staffed();
		await join(id, 'Locked', await client(false), { password: 'pw' });
		expect(await deleteEntry(admin.db, id, 'Locked')).toBe(true);
		expect(await exists(owner.db, 'events', id, 'responses', responseKey('Locked'))).toBe(false);
		// The name is free again, password and all.
		await join(id, 'Locked', await client(false));

		// An admin whose own entry is removed is still an admin, and still finds the event.
		await deleteEntry(owner.db, id, 'Ada');
		expect((await listEventsFor(admin.db, admin.user!.uid)).map((e) => e.id)).toEqual([id]);
		expect(await deleteEntry(admin.db, id, 'Bo')).toBe(true);
	});

	it('adds people without the join counters, like an owner, which a member cannot', async () => {
		const { admin, member, id } = await staffed();
		const response = (name: string, personId: number) => ({
			personId,
			name,
			uid: null,
			available: [],
			updatedAt: 1
		});
		const add = (who: Client, name: string) =>
			setDoc(doc(who.db, 'events', id, 'responses', responseKey(name)), response(name, 90));
		expect(await denied(add(member, 'By member'))).toBe(true);
		await add(admin, 'By admin');
		expect(await exists(admin.db, 'events', id, 'responses', responseKey('By admin'))).toBe(true);
	});

	it('updates an import from When2Meet', async () => {
		const owner = await client();
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(['Ada']));
		const admin = await join(id, 'Helper', await client());
		const member = await join(id, 'Member', await client());
		await setAdmin(owner.db, id, admin.user!.uid, true);

		const next = pollOf(['Ada', 'Bo']);
		expect(await denied(resyncWhen2Meet(member.db, id, next))).toBe(true);
		expect(await resyncWhen2Meet(admin.db, id, next)).toMatchObject({ added: 1 });
		const names = (await loadNativeEvent(owner.db, id)).people.map((p) => p.name);
		expect(names).toContain('Bo');
	});

	it('adds people past the limit, like the owner', async () => {
		const owner = await client();
		const names = Array.from({ length: MAX_RESPONSES - 1 }, (_, i) => `Person ${i}`);
		const { id } = await importWhen2Meet(owner.db, owner.user!, pollOf(names));
		const admin = await join(id, 'Helper', await client());
		await setAdmin(owner.db, id, admin.user!.uid, true);
		await join(id, 'One more', admin);
		expect((await getDoc(doc(owner.db, 'events', id))).data()?.responseCount).toBe(
			MAX_RESPONSES + 1
		);
	}, 60_000);
});

describe('what only the owner can do', () => {
	it('does not let an admin delete the event', async () => {
		const { admin, id } = await staffed();
		expect(await denied(deleteDoc(doc(admin.db, 'events', id)))).toBe(true);
		expect(await denied(deleteEvent(admin.db, id))).toBe(true);
		expect(await exists(admin.db, 'events', id)).toBe(true);
	});

	it('does not let an admin take or hand on the event', async () => {
		const { admin, member, id } = await staffed();
		expect(await denied(transferOwnership(admin.db, id, member.user!.uid))).toBe(true);
		expect(await denied(updateDoc(doc(admin.db, 'events', id), { ownerId: admin.user!.uid }))).toBe(
			true
		);
	});

	it('hands the event to an admin, who stops being listed as one', async () => {
		const { owner, admin, id } = await staffed();
		await transferOwnership(owner.db, id, admin.user!.uid);
		const stored = (await getDoc(doc(owner.db, 'events', id))).data()!;
		expect(stored.ownerId).toBe(admin.user!.uid);
		expect(stored.adminUids).toEqual([]);
		// The old owner is an ordinary member now.
		expect(await denied(deleteEntry(owner.db, id, 'Bo'))).toBe(true);
	});
});
