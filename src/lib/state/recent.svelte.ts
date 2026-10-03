import type { RecentEvent } from '$lib/events/userModel';
import type { W2MEvent } from '$lib/types';
import { DEMO_ID } from '$lib/w2m/id';
import { RECENT_MAX, userData } from './userData';

export type { RecentEvent };

/**
 * The events opened lately. A signed-in user's list lives in their account (as each event's
 * `openedAt`); signed out, it's just this visit's.
 */
class RecentEvents {
	items = $state<RecentEvent[]>([]);

	/** Replaces the list with the account's, once someone is signed in. */
	async load() {
		const saved = await userData.loadRecent();
		// Anything opened while the list was loading stays on top.
		const fresh = this.items.filter((e) => !saved.some((s) => s.id === e.id));
		this.items = [...fresh, ...saved].sort((a, b) => b.openedAt - a.openedAt).slice(0, RECENT_MAX);
	}

	/** Empties the list, when someone signs out, so the next person on this browser doesn't see it. */
	clear() {
		this.items = [];
	}

	/**
	 * Puts an event first. Opening it counts as a visit and is saved; a background refresh only
	 * saves when the event's title or headcount changed.
	 */
	remember(event: W2MEvent, { opened = true } = {}) {
		if (event.id === DEMO_ID) return;
		const prior = this.items.find((e) => e.id === event.id);
		const entry = {
			id: event.id,
			title: event.title,
			people: event.people.length,
			openedAt: opened || !prior ? Date.now() : prior.openedAt
		};
		this.items = [entry, ...this.items.filter((e) => e.id !== event.id)].slice(0, RECENT_MAX);
		if (opened || !prior || prior.title !== entry.title || prior.people !== entry.people) {
			userData.queueEvent(entry.id, {
				title: entry.title,
				people: entry.people,
				openedAt: entry.openedAt
			});
		}
	}

	/** Takes an event off the list; its saved setup and groups stay. */
	forget(id: string) {
		this.items = this.items.filter((e) => e.id !== id);
		userData.queueEvent(id, { openedAt: 0 });
	}
}

export const recent = new RecentEvents();
