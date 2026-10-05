import { app } from './app.svelte';
import { heatPalette } from './heatPalette.svelte';
import { recent } from './recent.svelte';
import { theme } from './theme.svelte';
import { userData } from './userData';

/**
 * Brings the app in line with who's signed in: on sign-in, their saved theme, palette, and recent
 * events replace the visit's, and the open event (if any) picks up its saved setup; on sign-out,
 * their recent events are cleared from the screen. Called whenever the signed-in user changes,
 * including once at startup when Firebase first says who it is.
 */
export const syncAccount = async (uid: string | null): Promise<void> => {
	if (!uid) {
		recent.clear();
		await app.accountChanged(null);
		return;
	}
	const [saved] = await Promise.all([userData.loadSettings(), recent.load()]);
	if (saved) {
		if (saved.theme) theme.apply(saved.theme);
		if (saved.heat) heatPalette.apply(saved.heat);
	} else {
		// A first sign-in: keep whatever was chosen so far, and save it.
		userData.saveSettings({ theme: theme.pref, heat: heatPalette.current });
	}
	await app.accountChanged(uid);
};
