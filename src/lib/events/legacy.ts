import { isAnyEventId } from './id';
import {
	readEventData,
	readPrefs,
	readSettings,
	type UserEventData,
	type UserSettings
} from './userModel';

/*
 * What earlier versions kept in the browser's own storage, read into the shapes that live in
 * Firestore now, so a user's recent events, per-event setup, groups, and theme follow them to their
 * account the first time they sign in. Nothing here touches storage except by the `Pick<Storage>`
 * it's handed.
 *
 *   ttm:theme, ttm:heat       a bare string each
 *   ttm:recent                [{ id, title, people, openedAt }]
 *   ttm:event:<id>            the event's setup (roles, duration, zone, ...)
 *   ttm:groups:<id>           the event's saved groups
 *   linkMemory                v1's [{ title, link }], oldest last
 */

export type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem'>;

export interface LegacyData {
	settings: UserSettings;
	/** Per event ID, in the shape of an event's document under the user. */
	events: Map<string, UserEventData>;
	/** Every storage key that was read, to remove once it has been saved. */
	keys: string[];
}

/** Most events carried over. Older ones are dropped rather than writing hundreds of documents. */
export const MAX_LEGACY_EVENTS = 100;

const PREFIXES = ['ttm:event:', 'ttm:groups:'];
const FIXED = ['ttm:theme', 'ttm:heat', 'ttm:recent', 'linkMemory'];

const parse = (raw: string | null): unknown => {
	if (raw === null) return undefined;
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
};

/** IDs the app can open, minus the demo, which is rebuilt every week and has nothing to keep. */
const keepable = (id: string) => id !== 'demo' && isAnyEventId(id) && !id.includes('/');

const hasAnything = (data: UserEventData) => Object.keys(data).length > 0;

export const readLegacy = (storage: StorageLike): LegacyData => {
	const keys: string[] = [];
	const all: string[] = [];
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (key) all.push(key);
	}
	const present = all.filter(
		(key) => FIXED.includes(key) || PREFIXES.some((prefix) => key.startsWith(prefix))
	);
	keys.push(...present);

	const settings = readSettings({
		theme: storage.getItem('ttm:theme') ?? undefined,
		heat: storage.getItem('ttm:heat') ?? undefined
	});

	const events = new Map<string, UserEventData>();
	const touch = (id: string): UserEventData => {
		let data = events.get(id);
		if (!data) events.set(id, (data = {}));
		return data;
	};

	// The recent list, newest first as it was stored. v1's list comes after, so the current one
	// wins for an event in both.
	const recent = parse(storage.getItem('ttm:recent'));
	for (const entry of Array.isArray(recent) ? recent : []) {
		const { id, title, people, openedAt } = (entry ?? {}) as Record<string, unknown>;
		if (typeof id !== 'string' || !keepable(id) || typeof title !== 'string' || !title) continue;
		if (typeof openedAt !== 'number' || openedAt <= 0) continue;
		Object.assign(touch(id), {
			title,
			people: typeof people === 'number' ? people : 0,
			openedAt
		});
	}

	const v1 = parse(storage.getItem('linkMemory'));
	if (Array.isArray(v1)) {
		// v1 listed the newest last, with no times; keep their order just below real visits.
		v1.forEach((entry, i) => {
			const { title, link } = (entry ?? {}) as Record<string, unknown>;
			if (typeof link !== 'string' || !keepable(link) || typeof title !== 'string' || !title)
				return;
			if (events.get(link)?.title) return;
			Object.assign(touch(link), { title, people: 0, openedAt: i + 1 });
		});
	}

	for (const key of present) {
		const prefix = PREFIXES.find((p) => key.startsWith(p));
		if (!prefix) continue;
		const id = key.slice(prefix.length);
		if (!keepable(id)) continue;
		const value = parse(storage.getItem(key));
		if (prefix === 'ttm:event:') {
			const prefs = readPrefs(value);
			if (Object.keys(prefs).length) touch(id).prefs = prefs;
		} else {
			const { groups } = readEventData({ groups: value });
			if (groups?.length) touch(id).groups = groups;
		}
	}

	// Past the cap, keep the most recently opened (events never on the list sort last).
	const kept = [...events].filter(([, data]) => hasAnything(data));
	kept.sort(([, a], [, b]) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
	return { settings, events: new Map(kept.slice(0, MAX_LEGACY_EVENTS)), keys };
};

/**
 * What's in `incoming` that `existing` doesn't already have. Whatever the account holds wins, so
 * signing in on an old browser can't undo choices made elsewhere.
 */
export const onlyNew = <T extends object>(existing: T | null, incoming: T): Partial<T> => {
	const out: Partial<T> = {};
	for (const key of Object.keys(incoming) as (keyof T)[]) {
		if (existing === null || existing[key] === undefined) out[key] = incoming[key];
	}
	return out;
};
