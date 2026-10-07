import { browser } from '$app/environment';
import { isNativeEventId } from '$lib/events/id';
import type { EventSummary, NewEvent, ResyncReport } from '$lib/events/model';
import { accountsEnabled } from '$lib/firebase/config';
import type { SessionUser } from '$lib/firebase/user';
import type { W2MEvent } from '$lib/types';
import { toast } from '$lib/ui/toast.svelte';

/** Popup closed or replaced by another one: the person changed their mind, not an error. */
const CANCELLED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

/** Errors from our own checks already read well; anything else is turned into plain words. */
const DOMAIN_ERRORS = ['InvalidInput', 'PasswordRequired', 'WrongPassword', 'NativeEventNotFound'];

/** Who an action is for, so a refusal can say. */
type Allowed = 'anyone' | 'managers' | 'owner';

const explain = (e: unknown, what: string, allowed: Allowed = 'anyone'): Error => {
	if (e instanceof Error && DOMAIN_ERRORS.includes(e.name)) return e;
	if ((e as { code?: string }).code === 'permission-denied') {
		return new Error(
			allowed === 'owner'
				? `Only the event's owner can ${what}, and only while signed in.`
				: allowed === 'managers'
					? `Only the event's owner and admins can ${what}, and only while signed in.`
					: `That wasn't allowed. You can't ${what} right now.`
		);
	}
	return new Error(`Couldn't ${what}. Check your connection and try again.`);
};

/** Owner and password management, loaded when someone first uses it. */
const manage = async () => {
	const [client, tools] = await Promise.all([
		import('$lib/firebase/client'),
		import('$lib/events/manage')
	]);
	return { db: client.getClientDb(), ...tools };
};

/** Firebase and Firestore are loaded on first use, so they stay out of the main bundle. */
const firebase = async () => {
	const [client, store] = await Promise.all([
		import('$lib/firebase/client'),
		import('$lib/events/store')
	]);
	return { ...client, ...store };
};

const asUser = (u: {
	uid: string;
	displayName: string | null;
	email: string | null;
	photoURL: string | null;
}): SessionUser => ({
	uid: u.uid,
	name: u.displayName,
	email: u.email,
	picture: u.photoURL
});

/**
 * Who's signed in, and the account calls. Firebase Auth lives in the browser, so `user` is only
 * ever set there (server-rendered pages always see a signed-out visitor), and the browser talks
 * to Firestore directly.
 */
class Accounts {
	/** Whether this deployment has Firebase configured. When it doesn't, nothing here is used. */
	enabled = accountsEnabled();
	user = $state.raw<SessionUser | null>(null);
	/** The name last used to add times, so the next form can start with it. For this visit only. */
	lastName = $state('');
	/** Whether Firebase has said who's signed in yet (or there's no Firebase to ask). */
	resolved = $state(false);
	/** Settles when `resolved` turns true, for code that must know who's signed in before it reads. */
	ready: Promise<void>;
	busy = $state(false);
	#started = false;
	#resolve!: () => void;

	constructor() {
		this.ready = new Promise((resolve) => (this.#resolve = resolve));
		// Nothing to wait for when accounts are off (and on the server, which never signs in).
		if (!this.enabled || !browser) this.#settle();
	}

	#settle() {
		this.resolved = true;
		this.#resolve();
	}

	/** Starts following sign-in state; call once from the browser. */
	async init(): Promise<void> {
		if (!browser || !this.enabled || this.#started) return;
		this.#started = true;
		try {
			const [{ onAuthStateChanged }, { getClientAuth }] = await Promise.all([
				import('firebase/auth'),
				import('$lib/firebase/client')
			]);
			onAuthStateChanged(getClientAuth(), (u) => {
				this.user = u ? asUser(u) : null;
				this.#settle();
			});
		} catch {
			// Nobody counts as signed in; the app works without it.
			this.#started = false;
			this.#settle();
		}
	}

	/** Signs in with Google. Returns false if it didn't happen. */
	async signIn(): Promise<boolean> {
		if (this.busy) return false;
		this.busy = true;
		try {
			const [{ GoogleAuthProvider, signInWithPopup }, { getClientAuth }] = await Promise.all([
				import('firebase/auth'),
				import('$lib/firebase/client')
			]);
			const credential = await signInWithPopup(getClientAuth(), new GoogleAuthProvider());
			this.user = asUser(credential.user);
			return true;
		} catch (e) {
			if (!CANCELLED.includes((e as { code?: string }).code ?? '')) {
				toast.fail('Sign-in failed. Try again.');
			}
			return false;
		} finally {
			this.busy = false;
		}
	}

	async signOut(): Promise<void> {
		this.busy = true;
		try {
			const { getClientAuth } = await import('$lib/firebase/client');
			await getClientAuth().signOut();
			this.user = null;
		} catch {
			toast.fail("Couldn't sign out. Try again.");
		} finally {
			this.busy = false;
		}
	}

	/** A ThenToMeet event, read straight from Firestore. */
	async loadEvent(id: string): Promise<W2MEvent> {
		if (!this.enabled) throw new Error('No event found at that link.');
		try {
			const { getClientDb, loadNativeEvent } = await firebase();
			return await loadNativeEvent(getClientDb(), id);
		} catch (e) {
			// Keeps the error's name for a missing event, so callers can tell it from a bad connection.
			if ((e as Error).name === 'NativeEventNotFound') throw e;
			throw new Error("Couldn't load that ThenToMeet event. Check your connection and try again.");
		}
	}

	/**
	 * Reads the documents of whichever of these are ThenToMeet events (see `peekEvents`): sums up
	 * the ones that exist and says which no longer do. Other IDs, and failed checks, are in neither.
	 */
	async peekEvents(ids: string[]): Promise<{ found: EventSummary[]; missing: string[] }> {
		const native = ids.filter(isNativeEventId);
		const none = { found: [], missing: [] };
		if (!this.enabled || !native.length) return none;
		try {
			const { getClientDb, peekEvents } = await firebase();
			return await peekEvents(getClientDb(), this.user?.uid ?? null, native);
		} catch {
			return none;
		}
	}

	/**
	 * Follows a ThenToMeet event live (see `watchNativeEvent`). Resolves to a function that stops it.
	 */
	async watchEvent(
		id: string,
		onEvent: (event: W2MEvent) => void,
		onError: (error: Error) => void
	): Promise<() => void> {
		const { getClientDb, watchNativeEvent } = await firebase();
		return watchNativeEvent(getClientDb(), id, onEvent, onError);
	}

	/** Makes a ThenToMeet event owned by the signed-in user. Returns its ID. */
	async createEvent(input: NewEvent): Promise<string> {
		const user = this.user;
		if (!user) throw new Error('Sign in to create an event.');
		const { getClientDb, createEvent } = await firebase();
		return createEvent(getClientDb(), user, input);
	}

	/**
	 * Saves someone's times for a ThenToMeet event (see `submitResponse`). Anyone can, signed in
	 * or not; the errors that matter to a form (`PasswordRequired`, `WrongPassword`,
	 * `InvalidInput`) are thrown as they are.
	 */
	async respond(eventId: string, body: unknown): Promise<{ personId: number }> {
		const { getClientDb, submitResponse } = await firebase();
		return submitResponse(getClientDb(), this.user, eventId, body);
	}

	/** Whether the signed-in user owns this event: they can do anything to it, deleting included. */
	owns(event: W2MEvent): boolean {
		return event.ownerId !== undefined && event.ownerId === this.user?.uid;
	}

	/** Whether the signed-in user is one of this event's admins (the owner isn't listed as one). */
	administers(event: W2MEvent): boolean {
		const uid = this.user?.uid;
		return uid !== undefined && !!event.adminUids?.includes(uid);
	}

	/** Whether the signed-in user can manage this event's people and its When2Meet sync. */
	manages(event: W2MEvent): boolean {
		return this.owns(event) || this.administers(event);
	}

	/** Deletes an event and all its responses. Only its owner can. */
	async deleteEvent(eventId: string): Promise<void> {
		try {
			const { db, deleteEvent } = await manage();
			await deleteEvent(db, eventId);
		} catch (e) {
			throw explain(e, 'delete this event', 'owner');
		}
	}

	/** Removes one person's entry (and its password) from an event. Only its owner and admins can. */
	async deleteEntry(eventId: string, name: string): Promise<void> {
		try {
			const { db, deleteEntry } = await manage();
			await deleteEntry(db, eventId, name);
		} catch (e) {
			throw explain(e, 'remove people from this event', 'managers');
		}
	}

	/** Gives a password-protected entry a new password; takes the current one. */
	async changePassword(
		eventId: string,
		name: string,
		current: string,
		next: string
	): Promise<void> {
		try {
			const { db, changePassword } = await manage();
			await changePassword(db, eventId, name, current, next);
		} catch (e) {
			throw explain(e, 'change the password');
		}
	}

	/** Gives an entry that has no password one. */
	async addPassword(eventId: string, name: string, password: string): Promise<void> {
		try {
			const { db, addPassword } = await manage();
			await addPassword(db, eventId, name, password);
		} catch (e) {
			throw explain(e, 'add a password to this name');
		}
	}

	/** Takes the password off an entry; takes the current one. */
	async removePassword(eventId: string, name: string, current: string): Promise<void> {
		try {
			const { db, removePassword } = await manage();
			await removePassword(db, eventId, name, current);
		} catch (e) {
			throw explain(e, 'remove the password');
		}
	}

	/** Brings an imported event up to date with its When2Meet poll (see `planResync`). */
	async resyncWhen2Meet(eventId: string, poll: W2MEvent): Promise<ResyncReport> {
		try {
			const { db, resyncWhen2Meet } = await manage();
			return await resyncWhen2Meet(db, eventId, poll);
		} catch (e) {
			throw explain(e, 'update this event', 'managers');
		}
	}

	/** Hands an event to another account that responded to it. Only its owner can. */
	async transferOwnership(eventId: string, newOwnerUid: string): Promise<void> {
		try {
			const { db, transferOwnership } = await manage();
			await transferOwnership(db, eventId, newOwnerUid);
		} catch (e) {
			throw explain(e, 'transfer this event', 'owner');
		}
	}

	/**
	 * Makes an account that responded an admin of an event, or stops it being one. The owner chooses
	 * admins; an admin can only step down.
	 */
	async setAdmin(eventId: string, uid: string, admin: boolean): Promise<void> {
		try {
			const { db, setAdmin } = await manage();
			await setAdmin(db, eventId, uid, admin);
		} catch (e) {
			throw explain(e, 'change who the admins are', 'owner');
		}
	}

	/** Copies a When2Meet poll into the account. Returns the copy's ID, or null if it failed. */
	async importWhen2Meet(poll: W2MEvent): Promise<{ id: string; created: boolean } | null> {
		const user = this.user;
		if (!user) return null;
		try {
			const { getClientDb, importWhen2Meet } = await firebase();
			return await importWhen2Meet(getClientDb(), user, poll);
		} catch {
			toast.fail("Couldn't import that event. Try again.");
			return null;
		}
	}

	/** Up to `max` of the account's events, most recently active first. Each one is a read. */
	async events(max: number): Promise<EventSummary[]> {
		const user = this.user;
		if (!user) return [];
		const { getClientDb, listEventsFor } = await firebase();
		return listEventsFor(getClientDb(), user.uid, max);
	}
}

export const accounts = new Accounts();
