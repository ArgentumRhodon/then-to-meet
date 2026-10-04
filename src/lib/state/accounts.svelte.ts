import { browser } from '$app/environment';
import type { EventSummary, NewEvent } from '$lib/events/model';
import { accountsEnabled } from '$lib/firebase/config';
import type { SessionUser } from '$lib/firebase/user';
import type { W2MEvent } from '$lib/types';
import { toast } from '$lib/ui/toast.svelte';

/** Popup closed or replaced by another one: the person changed their mind, not an error. */
const CANCELLED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

/** Errors from our own checks already read well; anything else is turned into plain words. */
const DOMAIN_ERRORS = ['InvalidInput', 'PasswordRequired', 'WrongPassword', 'NativeEventNotFound'];

const explain = (e: unknown, what: string, ownerOnly = false): Error => {
	if (e instanceof Error && DOMAIN_ERRORS.includes(e.name)) return e;
	if ((e as { code?: string }).code === 'permission-denied') {
		return new Error(
			ownerOnly
				? `Only the event's owner can ${what}, and only while signed in.`
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
	lastName = '';
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
				toast.show('Sign-in failed. Try again.');
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
			toast.show("Couldn't sign out. Try again.");
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
			throw new Error(
				(e as Error).name === 'NativeEventNotFound'
					? (e as Error).message
					: "Couldn't load that ThenToMeet event. Check your connection and try again."
			);
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

	/** Whether the signed-in user owns this event, and so can manage it. */
	owns(event: W2MEvent): boolean {
		return event.ownerId !== undefined && event.ownerId === this.user?.uid;
	}

	/** Deletes an event and all its responses. Only its owner can. */
	async deleteEvent(eventId: string): Promise<void> {
		try {
			const { db, deleteEvent } = await manage();
			await deleteEvent(db, eventId);
		} catch (e) {
			throw explain(e, 'delete this event', true);
		}
	}

	/** Removes one person's entry (and its password) from an event. Only its owner can. */
	async deleteEntry(eventId: string, name: string): Promise<void> {
		try {
			const { db, deleteEntry } = await manage();
			await deleteEntry(db, eventId, name);
		} catch (e) {
			throw explain(e, 'remove people from this event', true);
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

	/** Takes the password off an entry; takes the current one. */
	async removePassword(eventId: string, name: string, current: string): Promise<void> {
		try {
			const { db, removePassword } = await manage();
			await removePassword(db, eventId, name, current);
		} catch (e) {
			throw explain(e, 'remove the password');
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
			toast.show("Couldn't import that event. Try again.");
			return null;
		}
	}

	/** The account's events, most recently active first. */
	async events(): Promise<EventSummary[]> {
		const user = this.user;
		if (!user) return [];
		const { getClientDb, listEventsFor } = await firebase();
		return listEventsFor(getClientDb(), user.uid);
	}
}

export const accounts = new Accounts();
