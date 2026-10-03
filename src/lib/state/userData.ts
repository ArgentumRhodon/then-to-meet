import { browser } from '$app/environment';
import type { RecentEvent, UserEventData, UserSettings } from '$lib/events/userModel';
import { toast } from '$lib/ui/toast.svelte';
import { accounts } from './accounts.svelte';

/**
 * The signed-in user's saved settings and per-event setup, in Firestore. Nothing here touches the
 * browser's own storage: signed out (or with accounts off), every call does nothing and the app
 * simply keeps its state in memory for the visit.
 *
 * The app saves on every change, so event writes wait a moment and go out together, and a value
 * that's already what Firestore holds is never sent again.
 */

/** How long a change waits for more before it's written. */
const DELAY_MS = 1500;
export const RECENT_MAX = 12;

/** Firebase and the stores are loaded on first use, so they stay out of the main bundle. */
const backend = async () => {
	const [client, store] = await Promise.all([
		import('$lib/firebase/client'),
		import('$lib/events/userStore')
	]);
	return { db: client.getClientDb(), ...store };
};

const queued = new Map<string, { uid: string; eventId: string; fields: UserEventData }>();
/** What Firestore is known to hold, as JSON, per `uid/eventId/field`. */
const known = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let warned = false;

const knownKey = (uid: string, eventId: string, field: string) => `${uid}/${eventId}/${field}`;

/** Said once per visit, so a rules or connection problem doesn't bury the page in messages. */
const warn = (e: unknown) => {
	console.warn('Saving to your account failed', e);
	if (warned) return;
	warned = true;
	toast.show("Couldn't save to your account. Recent changes may not stick.");
};

const flush = async () => {
	clearTimeout(timer);
	const batch = [...queued.values()];
	queued.clear();
	for (const { uid, eventId, fields } of batch) {
		// Whoever signed out in the meantime doesn't get their changes written under their account.
		if (accounts.user?.uid !== uid) continue;
		try {
			const { db, saveEventData } = await backend();
			await saveEventData(db, uid, eventId, fields);
			for (const [field, value] of Object.entries(fields)) {
				known.set(knownKey(uid, eventId, field), JSON.stringify(value));
			}
		} catch (e) {
			warn(e);
		}
	}
};

if (browser) {
	addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
}

export const userData = {
	/** The saved theme and palette, or null if signed out or none saved yet. */
	async loadSettings(): Promise<UserSettings | null> {
		await accounts.ready;
		const uid = accounts.user?.uid;
		if (!uid) return null;
		try {
			const { db, loadSettings } = await backend();
			return await loadSettings(db, uid);
		} catch (e) {
			warn(e);
			return null;
		}
	},

	saveSettings(settings: UserSettings) {
		const uid = accounts.user?.uid;
		if (!uid) return;
		backend()
			.then(({ db, saveSettings }) => saveSettings(db, uid, settings))
			.catch(warn);
	},

	/** The saved setup for an event, or null if signed out or never opened. */
	async loadEvent(eventId: string): Promise<UserEventData | null> {
		await accounts.ready;
		const uid = accounts.user?.uid;
		if (!uid) return null;
		try {
			const { db, loadEventData } = await backend();
			const data = await loadEventData(db, uid, eventId);
			for (const [field, value] of Object.entries(data ?? {})) {
				known.set(knownKey(uid, eventId, field), JSON.stringify(value));
			}
			return data;
		} catch (e) {
			warn(e);
			return null;
		}
	},

	/** Saves some of an event's fields soon, skipping any that haven't changed. */
	queueEvent(eventId: string, fields: UserEventData) {
		const uid = accounts.user?.uid;
		if (!uid) return;
		const key = `${uid}/${eventId}`;
		const entry = queued.get(key) ?? { uid, eventId, fields: {} };
		const pending = entry.fields as Record<string, unknown>;
		for (const [field, value] of Object.entries(fields)) {
			// Changed back to what's already saved: nothing left to send for it.
			if (known.get(knownKey(uid, eventId, field)) === JSON.stringify(value)) delete pending[field];
			else pending[field] = value;
		}
		if (Object.keys(pending).length) queued.set(key, entry);
		else queued.delete(key);
		clearTimeout(timer);
		if (queued.size) timer = setTimeout(flush, DELAY_MS);
	},

	/** Sends anything waiting right away, like before leaving an event. */
	flush,

	async loadRecent(): Promise<RecentEvent[]> {
		await accounts.ready;
		const uid = accounts.user?.uid;
		if (!uid) return [];
		try {
			const { db, loadRecent } = await backend();
			return await loadRecent(db, uid, RECENT_MAX);
		} catch (e) {
			warn(e);
			return [];
		}
	}
};
