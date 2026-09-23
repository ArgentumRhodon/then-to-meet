import { browser } from '$app/environment';
import type { W2MEvent } from '$lib/types';
import { DEMO_ID } from '$lib/w2m/id';
import { readJson, removeKey, writeJson } from './storage';

export interface RecentEvent {
	id: string;
	title: string;
	people: number;
	openedAt: number;
}

const KEY = 'ttm:recent';
const LEGACY_KEY = 'linkMemory';
const MAX = 12;

/** v1 stored `{ title, link }` pairs under `linkMemory`; carry them over once. */
const migrateLegacy = (): RecentEvent[] => {
	const legacy = readJson<{ title?: string; link?: string }[] | null>(LEGACY_KEY, null);
	if (!Array.isArray(legacy)) return [];
	removeKey(LEGACY_KEY);
	return legacy
		.filter((e) => e?.link && e?.title)
		.reverse()
		.map((e, i) => ({ id: e.link!, title: e.title!, people: 0, openedAt: i }));
};

class RecentEvents {
	items = $state<RecentEvent[]>([]);

	constructor() {
		if (!browser) return;
		const stored = readJson<RecentEvent[] | null>(KEY, null);
		this.items = stored ?? migrateLegacy();
		if (!stored) writeJson(KEY, this.items);
	}

	remember(event: W2MEvent) {
		if (event.id === DEMO_ID) return;
		const entry = {
			id: event.id,
			title: event.title,
			people: event.people.length,
			openedAt: Date.now()
		};
		this.items = [entry, ...this.items.filter((e) => e.id !== event.id)].slice(0, MAX);
		writeJson(KEY, this.items);
	}

	forget(id: string) {
		this.items = this.items.filter((e) => e.id !== id);
		writeJson(KEY, this.items);
	}
}

export const recent = new RecentEvents();
