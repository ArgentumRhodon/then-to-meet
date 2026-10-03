import type { ThemePref } from '$lib/events/userModel';
import { userData } from './userData';

export type { ThemePref };

export const DEFAULT_THEME: ThemePref = 'dark';

/**
 * The color theme. The page starts on the default (see the inline script in app.html), and a
 * signed-in user's saved choice is applied once it's loaded. Choices are saved to their account.
 */
class Theme {
	pref = $state<ThemePref>(DEFAULT_THEME);

	/** Shows a theme without saving it, like one just loaded from the account. */
	apply(pref: ThemePref) {
		this.pref = pref;
		const root = document.documentElement;
		if (pref === 'system') delete root.dataset.theme;
		else root.dataset.theme = pref;
	}

	set(pref: ThemePref) {
		this.apply(pref);
		userData.saveSettings({ theme: pref });
	}
}

export const theme = new Theme();
