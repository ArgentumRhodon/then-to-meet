import { browser } from '$app/environment';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'ttm:theme';
export const DEFAULT_THEME: ThemePref = 'dark';

class Theme {
	pref = $state<ThemePref>(DEFAULT_THEME);

	constructor() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'light' || saved === 'dark' || saved === 'system') this.pref = saved;
		} catch {
			// Storage unavailable; stay on the default.
		}
	}

	set(pref: ThemePref) {
		this.pref = pref;
		const root = document.documentElement;
		if (pref === 'system') delete root.dataset.theme;
		else root.dataset.theme = pref;
		// Stored as a bare string so the inline script in app.html can read it before paint.
		try {
			localStorage.setItem(KEY, pref);
		} catch {
			// Ignore.
		}
	}
}

export const theme = new Theme();
