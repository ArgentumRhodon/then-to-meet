import type { HeatPaletteId } from '$lib/events/userModel';
import { userData } from './userData';

export type HeatPalette = HeatPaletteId;

export const HEAT_PALETTES: { value: HeatPalette; label: string; hint: string }[] = [
	{ value: 'standard', label: 'Standard', hint: 'Red to green' },
	{ value: 'deuteranopia', label: 'Deuteranopia', hint: 'Red-green, green-weak (most common)' },
	{ value: 'protanopia', label: 'Protanopia', hint: 'Red-green, red-weak' },
	{ value: 'tritanopia', label: 'Tritanopia', hint: 'Blue-yellow' }
];

/**
 * Heatmap color palette, including ones tuned for each type of colorblindness. A signed-in user's
 * choice is saved to their account and applied once loaded.
 */
class HeatPaletteSetting {
	current = $state<HeatPalette>('standard');

	get label(): string {
		return HEAT_PALETTES.find((p) => p.value === this.current)!.label;
	}

	/** Shows a palette without saving it, like one just loaded from the account. */
	apply(palette: HeatPalette) {
		this.current = palette;
		const root = document.documentElement;
		if (palette === 'standard') delete root.dataset.heat;
		else root.dataset.heat = palette;
	}

	set(palette: HeatPalette) {
		this.apply(palette);
		userData.saveSettings({ heat: palette });
	}
}

export const heatPalette = new HeatPaletteSetting();
