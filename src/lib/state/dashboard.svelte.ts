import type { EventSummary } from '$lib/events/model';
import { accounts } from './accounts.svelte';
import { PULSE_MAX_AGE, recent } from './recent.svelte';

/** How many of the account's events the home page reads; each one is a Firestore read. */
export const YOURS_MAX = 20;

/**
 * What the home page knows beyond the recent list: the ThenToMeet events the account owns or
 * responded to. Read when the home page shows, at most every couple of minutes, and their counts
 * go to the recent list too, so it doesn't read those events again.
 */
class Dashboard {
	yours = $state.raw<EventSummary[]>([]);
	loading = $state(false);
	#uid: string | null = null;
	#readAt = 0;

	/** Brings the account's events and the recent ones' counts up to date, unless they just were. */
	async refresh() {
		const uid = accounts.user?.uid ?? null;
		if (uid !== this.#uid) {
			this.#uid = uid;
			this.yours = [];
			this.#readAt = 0;
		}
		if (uid && Date.now() - this.#readAt >= PULSE_MAX_AGE) {
			this.loading = true;
			try {
				const yours = await accounts.events(YOURS_MAX);
				if (uid === this.#uid) {
					this.yours = yours;
					this.#readAt = Date.now();
					recent.note(yours);
				}
			} catch {
				// The section stays as it was; the recent list still works.
			} finally {
				this.loading = false;
			}
		}
		await recent.check();
	}
}

export const dashboard = new Dashboard();
