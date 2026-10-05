import {
	collection,
	doc,
	getDoc,
	getDocs,
	limit,
	orderBy,
	query,
	setDoc,
	where,
	type Firestore
} from 'firebase/firestore';
import {
	forFirestore,
	readEventData,
	readRecent,
	readSettings,
	type RecentEvent,
	type UserEventData,
	type UserSettings
} from './userModel';

/*
 * A user's own data in Firestore, through the web SDK, in the browser as that user. The rules
 * (firestore.rules) only let a user reach `users/<their uid>`.
 */

const settingsRef = (db: Firestore, uid: string) => doc(db, 'users', uid);
const eventRef = (db: Firestore, uid: string, eventId: string) =>
	doc(db, 'users', uid, 'events', eventId);

export const loadSettings = async (db: Firestore, uid: string): Promise<UserSettings | null> => {
	const snap = await getDoc(settingsRef(db, uid));
	return snap.exists() ? readSettings(snap.data()) : null;
};

export const saveSettings = (db: Firestore, uid: string, settings: UserSettings): Promise<void> =>
	setDoc(settingsRef(db, uid), forFirestore(settings), { merge: true });

export const loadEventData = async (
	db: Firestore,
	uid: string,
	eventId: string
): Promise<UserEventData | null> => {
	const snap = await getDoc(eventRef(db, uid, eventId));
	return snap.exists() ? readEventData(snap.data()) : null;
};

/**
 * Writes some fields of an event's document, replacing each one whole. (A plain merge would fold
 * a map like roles into the old one, so a role set back to "required" would never go away.)
 */
export const saveEventData = (
	db: Firestore,
	uid: string,
	eventId: string,
	fields: UserEventData
): Promise<void> => {
	const clean = forFirestore(fields);
	return setDoc(eventRef(db, uid, eventId), clean, { mergeFields: Object.keys(clean) });
};

/** The events opened most recently, newest first; ones taken off the list (openedAt 0) are skipped. */
export const loadRecent = async (
	db: Firestore,
	uid: string,
	max: number
): Promise<RecentEvent[]> => {
	const found = await getDocs(
		query(
			collection(db, 'users', uid, 'events'),
			where('openedAt', '>', 0),
			orderBy('openedAt', 'desc'),
			limit(max)
		)
	);
	return found.docs.flatMap((d) => readRecent(d.id, d.data()) ?? []);
};
