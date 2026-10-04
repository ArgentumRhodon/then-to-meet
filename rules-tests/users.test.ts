import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
	loadEventData,
	loadRecent,
	loadSettings,
	saveEventData,
	saveSettings
} from '$lib/events/userStore';
import { client, closeClients, denied, resetFirestore } from './helpers';

beforeEach(resetFirestore);
afterAll(closeClients);

describe('a user’s own data', () => {
	it('round-trips settings', async () => {
		const me = await client();
		expect(await loadSettings(me.db, me.user!.uid)).toBeNull();
		await saveSettings(me.db, me.user!.uid, { theme: 'light' });
		await saveSettings(me.db, me.user!.uid, { heat: 'tritanopia' });
		expect(await loadSettings(me.db, me.user!.uid)).toEqual({ theme: 'light', heat: 'tritanopia' });
	});

	it('round-trips an event’s setup, replacing whole fields rather than merging into them', async () => {
		const me = await client();
		const uid = me.user!.uid;
		await saveEventData(me.db, uid, '12345678-AbCdE', {
			prefs: { roles: { 1: 'skip', 2: 'optional' }, duration: 90 }
		});
		// A role put back to "required" is simply absent; it has to disappear, not linger.
		await saveEventData(me.db, uid, '12345678-AbCdE', { prefs: { roles: { 2: 'optional' } } });
		expect(await loadEventData(me.db, uid, '12345678-AbCdE')).toEqual({
			prefs: { roles: { 2: 'optional' } }
		});
	});

	it('lists recent events newest first, skipping any taken off the list', async () => {
		const me = await client();
		const uid = me.user!.uid;
		await saveEventData(me.db, uid, '1-aaa', { title: 'Old', people: 2, openedAt: 100 });
		await saveEventData(me.db, uid, '2-bbb', { title: 'New', people: 3, openedAt: 300 });
		await saveEventData(me.db, uid, '3-ccc', { title: 'Hidden', people: 1, openedAt: 200 });
		await saveEventData(me.db, uid, '3-ccc', { openedAt: 0 });
		await saveEventData(me.db, uid, '4-ddd', { prefs: { duration: 60 } });
		expect((await loadRecent(me.db, uid, 12)).map((e) => e.title)).toEqual(['New', 'Old']);
		expect(await loadRecent(me.db, uid, 1)).toHaveLength(1);
	});
});

describe('keeping it private', () => {
	it('lets no one else read or write a user’s settings or event data', async () => {
		const me = await client();
		const other = await client();
		const visitor = await client(false);
		await saveSettings(me.db, me.user!.uid, { theme: 'dark' });
		await saveEventData(me.db, me.user!.uid, '1-aaa', { title: 'Mine', openedAt: 5 });

		for (const intruder of [other, visitor]) {
			expect(await denied(getDoc(doc(intruder.db, 'users', me.user!.uid)))).toBe(true);
			expect(
				await denied(setDoc(doc(intruder.db, 'users', me.user!.uid), { theme: 'light' }))
			).toBe(true);
			expect(await denied(getDoc(doc(intruder.db, 'users', me.user!.uid, 'events', '1-aaa')))).toBe(
				true
			);
			expect(
				await denied(
					setDoc(doc(intruder.db, 'users', me.user!.uid, 'events', '1-aaa'), { title: 'Pwned' })
				)
			).toBe(true);
			expect(await denied(getDocs(collection(intruder.db, 'users', me.user!.uid, 'events')))).toBe(
				true
			);
		}
		expect(await loadSettings(me.db, me.user!.uid)).toEqual({ theme: 'dark' });
	});

	it('does not let anyone list users', async () => {
		const me = await client();
		expect(await denied(getDocs(collection(me.db, 'users')))).toBe(true);
	});

	it('refuses anything outside the documented collections', async () => {
		const me = await client();
		expect(await denied(setDoc(doc(me.db, 'elsewhere', 'x'), { a: 1 }))).toBe(true);
		expect(await denied(getDoc(doc(me.db, 'elsewhere', 'x')))).toBe(true);
	});
});
