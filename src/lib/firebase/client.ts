import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig, useEmulators } from './config';

/*
 * Browser-side Firebase. Import this only from code that runs in the browser, and only after
 * `accountsEnabled()` is true; sign-in loads it on demand so it stays out of the main bundle.
 */

let auth: Auth | undefined;
let db: Firestore | undefined;

const app = (): FirebaseApp => (getApps().length ? getApp() : initializeApp(firebaseConfig()));

export const getClientAuth = (): Auth => {
	if (!auth) {
		auth = getAuth(app());
		if (useEmulators())
			connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
	}
	return auth;
};

/**
 * Firestore for reading the signed-in user's own events (see firestore.rules). Writes go through
 * the server, which the rules require.
 */
export const getClientDb = (): Firestore => {
	if (!db) {
		db = getFirestore(app());
		if (useEmulators()) connectFirestoreEmulator(db, '127.0.0.1', 8080);
	}
	return db;
};
