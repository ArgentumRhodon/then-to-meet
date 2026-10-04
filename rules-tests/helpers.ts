import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
	connectFirestoreEmulator,
	doc,
	getDoc,
	getFirestore,
	terminate,
	type Firestore
} from 'firebase/firestore';
import type { SessionUser } from '$lib/firebase/user';
import type { W2MEvent } from '$lib/types';

/*
 * Helpers for the tests in this folder, which run against the Auth and Firestore emulators with the
 * rules from firestore.rules. Each "client" is its own Firebase app, signed in as a fresh user or
 * not signed in at all, so a test can play several people with different access.
 */

export const PROJECT = 'demo-thentomeet';
const FIRESTORE = { host: '127.0.0.1', port: 8080 };
const AUTH = 'http://127.0.0.1:9099';

export interface Client {
	db: Firestore;
	/** Null for a signed-out visitor. */
	user: SessionUser | null;
}

const apps: FirebaseApp[] = [];
let counter = 0;

/** A new client: signed in as a brand-new user, or (with `signedIn` false) not signed in. */
export const client = async (signedIn = true): Promise<Client> => {
	const name = `rules-test-${counter++}`;
	const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key' }, name);
	apps.push(app);
	const db = getFirestore(app);
	connectFirestoreEmulator(db, FIRESTORE.host, FIRESTORE.port);
	if (!signedIn) return { db, user: null };
	const auth = getAuth(app);
	connectAuthEmulator(auth, AUTH, { disableWarnings: true });
	const { user } = await signInAnonymously(auth);
	return { db, user: { uid: user.uid, name: `User ${counter}`, email: null, picture: null } };
};

/** Wipes every document, between tests. */
export const resetFirestore = async (): Promise<void> => {
	const url = `http://${FIRESTORE.host}:${FIRESTORE.port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
	const response = await fetch(url, { method: 'DELETE' });
	if (!response.ok) throw new Error(`Couldn't reset the emulator: ${response.status}`);
};

/** Shuts every client down, once a file's tests are done. */
export const closeClients = async (): Promise<void> => {
	await Promise.all(
		apps.splice(0).map(async (app) => {
			await terminate(getFirestore(app)).catch(() => {});
			await deleteApp(app).catch(() => {});
		})
	);
};

/** Whether a document exists, read as the given client. */
export const exists = async (db: Firestore, ...path: [string, ...string[]]): Promise<boolean> =>
	(await getDoc(doc(db, ...path))).exists();

/** The slot times for a small event, 15 minutes apart. */
export const SLOTS = [0, 900, 1800, 2700].map((t) => t + 1_800_000_000);

/**
 * Whether a promise was refused by the rules, and with what. A successful call fails the test
 * that expects a denial.
 */
export const denied = async (promise: Promise<unknown>): Promise<boolean> => {
	try {
		await promise;
		return false;
	} catch (e) {
		const code = (e as { code?: string }).code;
		if (code === 'permission-denied') return true;
		throw e;
	}
};

/** A When2Meet poll with these people, each free in the first slot. */
export const pollOf = (names: string[]): W2MEvent => ({
	id: '12345678-AbCdE',
	title: 'Imported',
	weekly: false,
	slotSeconds: 900,
	slots: SLOTS.map((time, i) => ({ time, available: i === 0 ? names.map((_, n) => n + 1) : [] })),
	people: names.map((name, n) => ({ id: n + 1, name })),
	noTimes: [],
	fetchedAt: 1
});
