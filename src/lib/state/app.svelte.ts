import { browser } from '$app/environment';
import { findBestTimes, roleOf, slotAttendance, type TimeBlock } from '$lib/analysis/bestTimes';
import { buildGrid } from '$lib/analysis/grid';
import { sameRoles, withGroup } from '$lib/analysis/roles';
import type { Role, Roles, W2MEvent } from '$lib/types';
import { groups } from './groups.svelte';
import { recent } from './recent.svelte';
import { readJson, writeJson } from './storage';

interface EventPrefs {
	roles?: Roles;
	duration?: number;
	zone?: string;
	/** The group being viewed, if any. */
	group?: string;
}

export interface LoadOverrides {
	roles?: Roles;
	duration?: number;
}

const DEFAULT_DURATION = 60;
const prefsKey = (id: string) => `ttm:event:${id}`;

export const localZone = (): string => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
};

class AppState {
	event = $state.raw<W2MEvent | null>(null);
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	error = $state<string | null>(null);
	refreshing = $state(false);

	/** Each person's own role; a selected group narrows these without changing them. */
	roles = $state.raw<Roles>({});
	/** The group whose overlap is being shown, or null for everyone. */
	groupId = $state<string | null>(null);
	duration = $state(DEFAULT_DURATION);
	zone = $state(browser ? localZone() : 'UTC');

	/** Slot under the pointer or keyboard focus in the heatmap. */
	hoveredSlot = $state<number | null>(null);
	/** Person whose availability the heatmap is showing on its own. */
	hoveredPerson = $state<number | null>(null);
	pinnedPerson = $state<number | null>(null);
	/** Time block previewed from the sidebar, and the one clicked to keep highlighted. */
	hoveredBlock = $state.raw<TimeBlock | null>(null);
	pinnedBlock = $state.raw<TimeBlock | null>(null);
	/** People checked in the sidebar for bulk actions. */
	selected = $state.raw<ReadonlySet<number>>(new Set());

	group = $derived(groups.get(this.groupId));
	/** The roles the heatmap and best times actually use. */
	effectiveRoles = $derived(withGroup(this.roles, this.group, this.event?.people ?? []));
	grid = $derived(this.event ? buildGrid(this.event, this.zone) : null);
	best = $derived(
		this.event && this.grid
			? findBestTimes(this.event, this.grid, this.effectiveRoles, this.duration)
			: null
	);
	attendance = $derived(this.event ? slotAttendance(this.event, this.effectiveRoles) : null);
	spotlight = $derived(this.hoveredPerson ?? this.pinnedPerson);
	activeBlock = $derived(this.hoveredBlock ?? this.pinnedBlock);

	#loadToken = 0;

	async load(id: string, overrides: LoadOverrides = {}) {
		const token = ++this.#loadToken;
		this.status = 'loading';
		this.error = null;
		try {
			const event = await fetchEvent(id);
			if (token !== this.#loadToken) return;
			const saved = readJson<EventPrefs>(prefsKey(id), {});
			groups.load(event.id);
			const savedRoles = saved.roles ?? {};
			const savedGroup = groups.get(saved.group ?? null);
			// A link we wrote ourselves carries the group's view of the roles; restore the saved roles
			// and group behind it. Anyone else's link is taken as-is, with no group.
			const ownLink =
				!overrides.roles ||
				sameRoles(overrides.roles, withGroup(savedRoles, savedGroup, event.people));
			this.event = event;
			this.roles = ownLink ? savedRoles : overrides.roles!;
			this.groupId = ownLink ? (savedGroup?.id ?? null) : null;
			this.duration = overrides.duration ?? saved.duration ?? DEFAULT_DURATION;
			this.zone = saved.zone ?? localZone();
			this.clearHighlights();
			this.status = 'ready';
			recent.remember(event);
		} catch (e) {
			if (token !== this.#loadToken) return;
			this.error = e instanceof Error ? e.message : String(e);
			// Keep showing the current event if switching to another one failed.
			this.status = this.event ? 'ready' : 'error';
		}
	}

	async refresh() {
		if (!this.event || this.refreshing) return;
		const id = this.event.id;
		this.refreshing = true;
		try {
			const event = await fetchEvent(id);
			if (this.event?.id !== id) return;
			this.event = event;
			// Slot indices can shift if the event changed, so drop anything pinned to them.
			this.pinnedBlock = null;
			this.hoveredBlock = null;
			recent.remember(event);
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.refreshing = false;
		}
	}

	reset() {
		this.#loadToken++;
		this.event = null;
		this.status = 'idle';
		this.error = null;
		this.groupId = null;
		groups.load(null);
		this.clearHighlights();
	}

	roleOf(id: number): Role {
		return roleOf(this.roles, id);
	}

	/** The role the analysis uses, which treats people outside the selected group as skipped. */
	effectiveRoleOf(id: number): Role {
		return roleOf(this.effectiveRoles, id);
	}

	setRole(id: number, role: Role) {
		this.setRoles([id], role);
	}

	setRoles(ids: Iterable<number>, role: Role) {
		const next = { ...this.roles };
		for (const id of ids) {
			if (role === 'required') delete next[id];
			else next[id] = role;
		}
		this.roles = next;
		this.pinnedBlock = null;
	}

	/** Shows the overlap for one group (or everyone, with null). */
	setGroup(id: string | null) {
		this.groupId = id;
		this.selected = new Set();
		this.pinnedBlock = null;
		this.hoveredBlock = null;
	}

	toggleSelected(id: number) {
		const next = new Set(this.selected);
		if (!next.delete(id)) next.add(id);
		this.selected = next;
	}

	setSelected(ids: Iterable<number>) {
		this.selected = new Set(ids);
	}

	resetRoles() {
		this.roles = {};
		this.pinnedBlock = null;
	}

	setDuration(minutes: number) {
		this.duration = Math.min(8 * 60, Math.max(15, Math.round(minutes / 15) * 15));
		this.pinnedBlock = null;
	}

	setZone(zone: string) {
		this.zone = zone;
		// Blocks carry grid day indices, which shift with the timezone.
		this.pinnedBlock = null;
		this.hoveredBlock = null;
	}

	/** Saves this event's roles, group, duration, and timezone so they come back next visit. */
	persist() {
		if (!this.event) return;
		const prefs: EventPrefs = { roles: this.roles, duration: this.duration };
		if (this.zone !== localZone()) prefs.zone = this.zone;
		if (this.group) prefs.group = this.group.id;
		writeJson(prefsKey(this.event.id), prefs);
	}

	clearHighlights() {
		this.hoveredSlot = null;
		this.hoveredPerson = null;
		this.pinnedPerson = null;
		this.hoveredBlock = null;
		this.pinnedBlock = null;
		this.selected = new Set();
	}
}

const fetchEvent = async (id: string): Promise<W2MEvent> => {
	let response: Response;
	try {
		response = await fetch(`/api/event/${encodeURIComponent(id)}`);
	} catch {
		throw new Error("Couldn't connect. Check your internet connection and try again.");
	}
	const body = await response.json().catch(() => null);
	if (!response.ok || !body) {
		throw new Error(body?.message ?? 'Something went wrong loading that event. Try again.');
	}
	return body as W2MEvent;
};

export const app = new AppState();
