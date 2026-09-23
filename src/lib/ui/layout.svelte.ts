import { MediaQuery } from 'svelte/reactivity';
import { app } from '$lib/state/app.svelte';

/** Narrowest day column that still reads comfortably in the heatmap. */
const MIN_DAY_WIDTH = 60;
/** Time labels plus page padding around the heatmap. */
const HEATMAP_CHROME = 100;
/** Phones never get the heatmap. */
const MIN_WIDTH = 640;

const desktop = new MediaQuery('(min-width: 1024px)');

class Layout {
	/** Room for every day at a readable width, as a media query so it tracks resizes and rotation. */
	#fits = $derived(
		new MediaQuery(
			`(min-width: ${Math.max(MIN_WIDTH, HEATMAP_CHROME + (app.grid?.days.length ?? 7) * MIN_DAY_WIDTH)}px)`
		)
	);

	/**
	 * Whether there's room for the heatmap. Phones never get it, and on tablets it only shows
	 * when every day fits; there, best times takes over. Desktop keeps it and scrolls sideways.
	 */
	showHeatmap = $derived(desktop.current || this.#fits.current);
}

export const layout = new Layout();
