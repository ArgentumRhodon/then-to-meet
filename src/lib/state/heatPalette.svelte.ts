import { browser } from '$app/environment';

export type HeatPalette = 'standard' | 'deuteranopia' | 'protanopia' | 'tritanopia';

export const HEAT_PALETTES: { value: HeatPalette; label: string; hint: string }[] = [
	{ value: 'standard', label: 'Standard', hint: 'Red to green' },
	{ value: 'deuteranopia', label: 'Deuteranopia', hint: 'Red-green, green-weak (most common)' },
	{ value: 'protanopia', label: 'Protanopia', hint: 'Red-green, red-weak' },
	{ value: 'tritanopia', label: 'Tritanopia', hint: 'Blue-yellow' }
];

const KEY = 'ttm:heat';

/** Heatmap color palette, including ones tuned for each type of colorblindness. */
class HeatPaletteSetting {
	current = $state<HeatPalette>('standard');

	constructor() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(KEY);
			if (HEAT_PALETTES.some((p) => p.value === saved)) this.current = saved as HeatPalette;
		} catch {
			// Storage unavailable; stay on the default.
		}
	}

	get label(): string {
		return HEAT_PALETTES.find((p) => p.value === this.current)!.label;
	}

	set(palette: HeatPalette) {
		this.current = palette;
		const root = document.documentElement;
		if (palette === 'standard') delete root.dataset.heat;
		else root.dataset.heat = palette;
		// Stored as a bare string so the inline script in app.html can apply it before paint.
		try {
			localStorage.setItem(KEY, palette);
		} catch {
			// Ignore.
		}
	}
}

export const heatPalette = new HeatPaletteSetting();
