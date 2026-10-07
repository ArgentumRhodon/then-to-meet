import type { EventOverview } from '$lib/analysis/overview';
import { isNativeEventId } from '$lib/events/id';
import { pulseOf, type EventPulse } from '$lib/events/model';
import type { RecentEvent } from '$lib/events/userModel';
import { accounts } from './accounts.svelte';
import type { W2MEvent } from '$lib/types';
import { DEMO_ID } from '$lib/w2m/id';
import { RECENT_MAX, userData } from './userData';

export type { RecentEvent };

/** How long what Firestore said about a ThenToMeet event counts as current, in milliseconds. */
export const PULSE_MAX_AGE = 2 * 60_000;

/**
 * The events opened lately. A signed-in user's list lives in their account (as each event's
 * `openedAt`); signed out, it's just this visit's.
 */
class RecentEvents {
	items = $state<RecentEvent[]>([]);
	/** Whether the account's list is being read. */
	loading = $state(false);
	/**
	 * The latest counts for listed ThenToMeet events, by ID, which the home page compares with
	 * each one's overview to say who's new. Read when someone signs in and when the home page
	 * shows, and kept current while an event is open.
	 */
	pulses = $state.raw<Record<string, EventPulse>>({});
	#pulsedAt = new Map<string, number>();

	/** Replaces the list with the account's, once someone is signed in. */
	async load() {
		this.loading = true;
		try {
			const saved = await userData.loadRecent();
			// Anything opened while the list was loading stays on top.
			const fresh = this.items.filter((e) => !saved.some((s) => s.id === e.id));
			this.items = [...fresh, ...saved]
				.sort((a, b) => b.openedAt - a.openedAt)
				.slice(0, RECENT_MAX);
		} finally {
			this.loading = false;
		}
		void this.check();
	}

	/**
	 * Reads the listed ThenToMeet events that haven't been in the last `maxAge` milliseconds. Ones
	 * their owners have deleted since leave the list, which only the account that opened them can
	 * clean up; the rest's counts are kept. A check that fails changes nothing.
	 */
	async check({ maxAge = PULSE_MAX_AGE } = {}) {
		const now = Date.now();
		const due = this.items
			.map((e) => e.id)
			.filter((id) => isNativeEventId(id) && now - (this.#pulsedAt.get(id) ?? 0) >= maxAge);
		if (!due.length) return;
		const { found, missing } = await accounts.peekEvents(due);
		this.note(found);
		for (const id of missing) this.forget(id);
	}

	/** Keeps the latest counts for some ThenToMeet events, however they were read. */
	note(pulses: (EventPulse & { id: string })[]) {
		if (!pulses.length) return;
		const now = Date.now();
		const next = { ...this.pulses };
		for (const { id, responseCount, role } of pulses) {
			next[id] = { responseCount, role };
			this.#pulsedAt.set(id, now);
		}
		this.pulses = next;
	}

	/** Empties the list, when someone signs out, so the next person on this browser doesn't see it. */
	clear() {
		this.items = [];
		this.pulses = {};
		this.#pulsedAt.clear();
	}

	/**
	 * Puts an event first. Opening it counts as a visit and is saved; a background refresh only
	 * saves when the event's title or headcount changed.
	 */
	remember(event: W2MEvent, { opened = true } = {}) {
		if (event.id === DEMO_ID) return;
		const prior = this.items.find((e) => e.id === event.id);
		const entry: RecentEvent = {
			id: event.id,
			title: event.title,
			people: event.people.length,
			openedAt: opened || !prior ? Date.now() : prior.openedAt
		};
		if (prior?.overview) entry.overview = prior.overview;
		this.items = [entry, ...this.items.filter((e) => e.id !== event.id)].slice(0, RECENT_MAX);
		// What's on screen is as current as a read would be, so the home page needn't make one.
		if (isNativeEventId(event.id)) {
			this.note([{ id: event.id, ...pulseOf(event, accounts.user?.uid ?? null) }]);
		}
		if (opened || !prior || prior.title !== entry.title || prior.people !== entry.people) {
			userData.queueEvent(entry.id, {
				title: entry.title,
				people: entry.people,
				openedAt: entry.openedAt
			});
		}
	}

	/**
	 * Keeps what the home page shows about a listed event, as it's set up now, and saves it when it
	 * changed. Does nothing for an event that isn't listed, like the demo.
	 */
	describe(id: string, overview: EventOverview) {
		const item = this.items.find((e) => e.id === id);
		if (!item) return;
		if (JSON.stringify(item.overview) !== JSON.stringify(overview)) {
			this.items = this.items.map((e) => (e.id === id ? { ...e, overview } : e));
		}
		userData.queueEvent(id, { overview });
	}

	/** Takes an event off the list; its saved setup and groups stay. Does nothing if it isn't listed. */
	forget(id: string) {
		if (!this.items.some((e) => e.id === id)) return;
		this.items = this.items.filter((e) => e.id !== id);
		userData.queueEvent(id, { openedAt: 0 });
	}
}

export const recent = new RecentEvents();
