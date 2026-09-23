import { browser } from '$app/environment';

/** localStorage JSON helpers that never throw (private mode, quota, disabled storage). */
export const readJson = <T>(key: string, fallback: T): T => {
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
};

export const writeJson = (key: string, value: unknown): void => {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage full or unavailable; preferences just won't persist.
	}
};

export const removeKey = (key: string): void => {
	if (!browser) return;
	try {
		localStorage.removeItem(key);
	} catch {
		// Ignore.
	}
};
