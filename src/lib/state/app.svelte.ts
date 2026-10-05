import { browser } from '$app/environment';
import {
	blockForSlots,
	findBestTimes,
	roleOf,
	slotAttendance,
	slotSpan,
	type TimeBlock
} from '$lib/analysis/bestTimes';
import {
	changesSince,
	mergeChanges,
	NO_CHANGES,
	sameContent,
	snapshot,
	type Changes,
	type Snapshot
} from '$lib/analysis/changes';
import { clampDuration, DEFAULT_DURATION } from '$lib/analysis/duration';
import { buildGrid } from '$lib/analysis/grid';
import { findMeetingSets, type MeetingSet, type MeetingsPerWeek } from '$lib/analysis/meetingSets';
import { sameRoles, withGroup } from '$lib/analysis/roles';
import { isNativeEventId } from '$lib/events/id';
import type { ResyncReport } from '$lib/events/model';
import { toast } from '$lib/ui/toast.svelte';
import { shareSearch } from '$lib/share/url';
import type { Role, Roles, TimeRange, W2MEvent } from '$lib/types';
import { DEMO_ID } from '$lib/w2m/id';
import type { EventPrefs } from '$lib/events/userModel';
import { accounts } from './accounts.svelte';
import { groups } from './groups.svelte';
import { recent } from './recent.svelte';
import { userData } from './userData';

export interface LoadOverrides {
	roles?: Roles;
	duration?: number;
	/** Name of the group the link was made from. */
	group?: string;
	/** Times the link points at. */
	picks?: TimeRange[];
	perWeek?: MeetingsPerWeek;
	/** The event itself, when the server already fetched it for this page. */
	event?: W2MEvent | null;
}

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
	/** Whether the open event is being followed live, so new responses arrive without asking. */
	live = $state(false);

	/** Each person's role when no group is viewed. Each group keeps its own roles for its members. */
	roles = $state.raw<Roles>({});
	/** The group whose overlap is being shown, or null for everyone. */
	groupId = $state<string | null>(null);
	/** Whether the group being viewed is open for editing, with the people list as its members. */
	editingGroup = $state(false);
	/**
	 * Name of the group someone else's link was showing. Its members aren't known here, only who
	 * the link skipped, so it's a label rather than a saved group.
	 */
	sharedGroup = $state<string | null>(null);
	duration = $state(DEFAULT_DURATION);
	/** How many times a week to meet; two or three look for sets of matching times. */
	perWeek = $state<MeetingsPerWeek>(1);
	zone = $state(browser ? localZone() : 'UTC');

	/** Slot under the pointer or keyboard focus in the heatmap. */
	hoveredSlot = $state<number | null>(null);
	/** Person whose availability the heatmap is showing on its own, picked with their eye button. */
	pinnedPerson = $state<number | null>(null);
	/** Time block previewed from best times, and the one clicked to keep highlighted. */
	hoveredBlock = $state.raw<TimeBlock | null>(null);
	pinnedBlock = $state.raw<TimeBlock | null>(null);
	/** The same for a set of meetings a week. */
	hoveredSet = $state.raw<MeetingSet | null>(null);
	pinnedSet = $state.raw<MeetingSet | null>(null);
	/**
	 * How many slots later than its window's earliest start the pinned time (or set of meetings)
	 * begins. Only a window with room for the meeting more than once can shift.
	 */
	pinShift = $state(0);
	/**
	 * Times picked on the heatmap (Shift adds more) or opened from a link, in time order. Kept as
	 * times rather than slots so they survive refreshes.
	 */
	selection = $state.raw<TimeRange[]>([]);
	/** People checked in the sidebar for bulk actions. */
	selected = $state.raw<ReadonlySet<number>>(new Set());
	/**
	 * Whether the view is narrowed to the checked people, like a group that isn't saved. Only true
	 * while someone is checked, and never saved or put in the address bar: it's a quick look.
	 */
	onlySelected = $state(false);
	/** Who responded or changed their times since the last visit. */
	changes = $state.raw<Changes>(NO_CHANGES);
	#seen: Snapshot | undefined;

	group = $derived(groups.get(this.groupId));
	/** The name of whichever group is narrowing the view, saved or shared. */
	groupLabel = $derived(this.group?.name ?? this.sharedGroup);
	/** Who the view is narrowed to, for labels: the checked people, a group, or null for everyone. */
	viewLabel = $derived(
		this.onlySelected
			? `${this.selected.size} selected ${this.selected.size === 1 ? 'person' : 'people'}`
			: this.groupLabel
	);
	/** The roles being viewed and changed: the selected group's, or everyone's. */
	activeRoles = $derived(this.group ? (this.group.roles ?? {}) : this.roles);
	/** Roles with the selected group applied, before any narrowing to the checked people. */
	#groupRoles = $derived(withGroup(this.activeRoles, this.group, this.event?.people ?? []));
	/** The roles the heatmap and best times actually use. */
	effectiveRoles = $derived(
		this.onlySelected
			? withGroup(this.#groupRoles, { members: [...this.selected] }, this.event?.people ?? [])
			: this.#groupRoles
	);
	grid = $derived(this.event ? buildGrid(this.event, this.zone) : null);
	best = $derived(
		this.event && this.grid
			? findBestTimes(this.event, this.grid, this.effectiveRoles, this.duration)
			: null
	);
	/** Sets of meetings for two or three times a week, or null when meeting once. */
	meetingSets = $derived(
		this.event && this.grid && this.perWeek > 1
			? findMeetingSets(
					this.event,
					this.grid,
					this.effectiveRoles,
					this.duration,
					this.perWeek as 2 | 3
				)
			: null
	);
	attendance = $derived(this.event ? slotAttendance(this.event, this.effectiveRoles) : null);
	/** Who can make each picked time, recomputed as roles change. */
	selectedBlocks = $derived.by(() => {
		const { event, grid } = this;
		if (!event || !grid) return [];
		return this.selection.flatMap((range) => {
			const span = slotSpan(event, grid, range.start, range.end);
			return span
				? [blockForSlots(event, grid, this.effectiveRoles, span.startSlot, span.endSlot)]
				: [];
		});
	});
	/** Slots one meeting takes. */
	meetingSlots = $derived(
		this.event ? Math.max(1, Math.ceil((this.duration * 60) / this.event.slotSeconds)) : 1
	);
	/** How far a pinned window lets its meeting shift, in slots. */
	shiftRoom = (block: Pick<TimeBlock, 'startSlot' | 'endSlot'>) =>
		Math.max(0, block.endSlot - block.startSlot + 1 - this.meetingSlots);
	/** The pinned shift, held to what the given window allows. */
	shiftFor = (block: Pick<TimeBlock, 'startSlot' | 'endSlot'>) =>
		Math.min(this.pinShift, this.shiftRoom(block));
	/**
	 * The slots actually highlighted: a pinned best time's meeting at its chosen start (the window
	 * around it is only outlined), each meeting of a pinned set, or picked times.
	 */
	heldSpans = $derived.by<{ startSlot: number; endSlot: number }[]>(() => {
		const meeting = (block: TimeBlock) => {
			const startSlot = block.startSlot + this.shiftFor(block);
			return { startSlot, endSlot: startSlot + this.meetingSlots - 1 };
		};
		if (this.pinnedBlock) return [meeting(this.pinnedBlock)];
		if (this.pinnedSet) return this.pinnedSet.sessions.map(meeting);
		return this.selectedBlocks;
	});
	/** Blocks that stay outlined: a pinned best time, a pinned set's meetings, or picked times. */
	heldBlocks = $derived<TimeBlock[]>(
		this.pinnedBlock
			? [this.pinnedBlock]
			: this.pinnedSet
				? this.pinnedSet.sessions
				: this.selectedBlocks
	);
	/** Blocks previewed by hovering a result in best times, if any. */
	previewBlocks = $derived<TimeBlock[] | null>(
		this.hoveredBlock ? [this.hoveredBlock] : (this.hoveredSet?.sessions ?? null)
	);
	activeBlocks = $derived(this.previewBlocks ?? this.heldBlocks);

	#loadToken = 0;
	/** Who was signed in when the open event's setup was loaded; undefined before anything is. */
	#knownUid: string | null | undefined;
	#unwatch: (() => void) | null = null;
	/** The newest copy the live listener has delivered, which a load still in progress picks up. */
	#latest: W2MEvent | null = null;
	/** People this browser just saved times for, so their own change isn't announced back to them. */
	#own = new Set<number>();

	async load(id: string, overrides: LoadOverrides = {}) {
		const token = ++this.#loadToken;
		this.status = 'loading';
		this.error = null;
		this.#stopWatching();
		try {
			void accounts.init();
			// What was changed in the event being left goes out before the next one's load begins.
			void userData.flush();
			// The saved setup waits on who's signed in, so it's read while the event is fetched.
			// A ThenToMeet event is opened by following it, so that first snapshot is the one read of its
			// responses; a copy handed over by the server (a first page load) is followed afterwards.
			const handedOver = overrides.event?.id === id;
			const following = !handedOver && isNativeEventId(id);
			let followed = false;
			const [loaded, data] = await Promise.all([
				handedOver
					? overrides.event!
					: following
						? this.#readNative(id, token).then((read) => {
								followed = read.followed;
								return read.event;
							})
						: fetchEvent(id),
				userData.loadEvent(id)
			]);
			if (token !== this.#loadToken) return;
			// Changes that arrived while the saved setup was still loading are already in.
			const event = following && this.#latest?.id === id ? this.#latest : loaded;
			this.#knownUid = accounts.user?.uid ?? null;
			const saved: EventPrefs = data?.prefs ?? {};
			const savedRoles = saved.roles ?? {};
			groups.load(event.id, data?.groups, savedRoles);
			const savedGroup = groups.get(saved.group ?? null);
			// A link we wrote ourselves carries the group's view of the roles; restore the saved roles
			// and group behind it. Anyone else's link is taken as-is, with its group as a label.
			const ownLink =
				!overrides.roles ||
				sameRoles(
					overrides.roles,
					withGroup(savedGroup ? (savedGroup.roles ?? {}) : savedRoles, savedGroup, event.people)
				);
			this.event = event;
			this.roles = ownLink ? savedRoles : overrides.roles!;
			this.groupId = ownLink ? (savedGroup?.id ?? null) : null;
			this.editingGroup = false;
			this.sharedGroup = ownLink
				? savedGroup
					? null
					: (saved.sharedGroup ?? null)
				: (overrides.group ?? null);
			this.duration = clampDuration(overrides.duration ?? saved.duration ?? DEFAULT_DURATION);
			this.perWeek = overrides.perWeek ?? saved.perWeek ?? 1;
			this.zone = saved.zone ?? localZone();
			this.clearHighlights();
			// The demo is rebuilt for each week, so there's nothing meaningful to compare.
			const tracked = event.id !== DEMO_ID;
			this.changes = tracked ? changesSince(saved.seen, event) : NO_CHANGES;
			this.#seen = tracked ? snapshot(event) : undefined;
			for (const range of overrides.picks ?? []) this.pick(range.start, range.end, { add: true });
			this.status = 'ready';
			this.#own.clear();
			recent.remember(event);
			if (following) this.live = followed;
			else if (isNativeEventId(event.id)) void this.#startWatching(event.id, token);
		} catch (e) {
			if (token !== this.#loadToken) return;
			this.error = e instanceof Error ? e.message : String(e);
			// A deleted event has nothing left to open, so it leaves the recent list.
			if (e instanceof Error && e.name === 'NativeEventNotFound') recent.forget(id);
			// Keep showing the current event if switching to another one failed.
			this.status = this.event ? 'ready' : 'error';
		}
	}

	/**
	 * Pulls the latest responses, and returns what changed (null if it didn't finish). An `auto`
	 * refresh takes a copy the server fetched moments ago and keeps quiet about errors.
	 */
	async refresh({ auto = false } = {}): Promise<Changes | null> {
		if (!this.event || this.refreshing) return null;
		// A live event is already current, and reading every response again would only cost reads.
		if (this.live && isNativeEventId(this.event.id)) return NO_CHANGES;
		const before = this.event;
		this.refreshing = true;
		try {
			const event = await fetchEvent(before.id, { fresh: !auto });
			if (this.event?.id !== before.id) return null;
			const fresh = this.#apply(event);
			return fresh;
		} catch (e) {
			if (!auto) this.error = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			this.refreshing = false;
		}
	}

	/**
	 * Swaps in a newer copy of the open event: notes who responded or changed their times, and keeps
	 * a pinned result if it's still there. Returns what changed.
	 */
	#apply(event: W2MEvent): Changes {
		const before = this.event!;
		let fresh = this.#seen ? changesSince(this.#seen, event) : NO_CHANGES;
		if (this.#own.size) {
			fresh = {
				added: fresh.added.filter((id) => !this.#own.has(id)),
				updated: fresh.updated.filter((id) => !this.#own.has(id))
			};
		}
		this.changes = mergeChanges(this.changes, fresh);
		if (this.#seen) this.#seen = snapshot(event);
		const blockId = this.pinnedBlock?.id;
		const setId = this.pinnedSet?.id;
		this.event = event;
		this.hoveredBlock = null;
		this.hoveredSet = null;
		// Pins point at slot indices, which only hold if the poll's times didn't change. Then keep
		// them if the same result still exists, so a background refresh doesn't close a card.
		const sameSlots =
			before.slots.length === event.slots.length &&
			before.slots.every((slot, i) => slot.time === event.slots[i].time);
		this.pinnedBlock = sameSlots && blockId ? this.#findBlock(blockId) : null;
		this.pinnedSet = sameSlots && setId ? this.#findSet(setId) : null;
		recent.remember(event, { opened: false });
		return fresh;
	}

	/**
	 * Reads a ThenToMeet event by following it, or the plain way if the listener won't start. A
	 * missing event is final either way.
	 */
	async #readNative(id: string, token: number): Promise<{ event: W2MEvent; followed: boolean }> {
		try {
			return { event: await this.#openNative(id, token), followed: true };
		} catch (e) {
			if ((e as Error).name === 'NativeEventNotFound') throw e;
			return { event: await fetchEvent(id), followed: false };
		}
	}

	/**
	 * Opens a ThenToMeet event by following it: resolves with the first complete snapshot, which
	 * stands in for a separate read of the event, and keeps following afterwards. Rejects if there
	 * is none (the event is gone, or the listener couldn't start or stalled).
	 */
	#openNative(id: string, token: number): Promise<W2MEvent> {
		this.#latest = null;
		return new Promise<W2MEvent>((resolve, reject) => {
			let settled = false;
			let dead = false;
			const fail = (e: unknown) => {
				if (settled) return;
				settled = dead = true;
				clearTimeout(timer);
				this.#stopWatching();
				const error = e as Error;
				reject(
					error?.name === 'NativeEventNotFound'
						? error
						: new Error("Couldn't load that ThenToMeet event. Check your connection and try again.")
				);
			};
			const timer = setTimeout(() => fail(new Error('Timed out')), OPEN_TIMEOUT_MS);
			if (!accounts.enabled) {
				fail(new Error('No event found at that link.'));
				return;
			}
			accounts
				.watchEvent(
					id,
					(event) => {
						if (token !== this.#loadToken || dead) return;
						this.#latest = event;
						if (!settled) {
							settled = true;
							clearTimeout(timer);
							resolve(event);
						} else {
							this.#onLive(event, id);
						}
					},
					(error) => {
						if (token !== this.#loadToken || dead) return;
						if (!settled) fail(error);
						else this.#onWatchError(error, id);
					}
				)
				.then(
					(stop) => {
						if (dead || token !== this.#loadToken) stop();
						else this.#unwatch = stop;
					},
					(e) => fail(e)
				);
		});
	}

	#onWatchError(error: Error, id: string) {
		if (this.event?.id !== id) return;
		this.live = false;
		// Gone for good: say so. Anything else (a dropped connection) falls back to polling.
		if (error.name === 'NativeEventNotFound') {
			this.error = 'This event was deleted.';
			recent.forget(id);
		}
	}

	/** Follows a ThenToMeet event as it changes, so responses show up without refreshing. */
	async #startWatching(id: string, token: number) {
		try {
			const stop = await accounts.watchEvent(
				id,
				(event) => this.#onLive(event, id),
				(error) => this.#onWatchError(error, id)
			);
			if (token !== this.#loadToken) stop();
			else this.#unwatch = stop;
		} catch {
			// No live updates; the page's polling covers it.
		}
	}

	#stopWatching() {
		this.#unwatch?.();
		this.#unwatch = null;
		this.live = false;
	}

	#onLive(event: W2MEvent, id: string) {
		if (this.event?.id !== id) return;
		this.live = true;
		// Most snapshots only touch bookkeeping (a counter, a timestamp); there's nothing to redraw.
		if (sameContent(this.event, event)) return;
		const fresh = this.#apply(event);
		const parts = [
			fresh.added.length &&
				`${fresh.added.length} new ${fresh.added.length === 1 ? 'response' : 'responses'}`,
			fresh.updated.length && `${fresh.updated.length} updated`
		].filter(Boolean);
		if (parts.length) toast.show(parts.join(', '));
	}

	/**
	 * Brings an imported event up to date with its When2Meet poll, for its owner. Returns what
	 * changed, and what it did to people is not announced again by the live update.
	 */
	async resyncImport(): Promise<ResyncReport> {
		const event = this.event;
		if (!event?.importedFrom) throw new Error("This event wasn't imported from When2Meet.");
		const poll = await fetchEvent(event.importedFrom, { fresh: true });
		const report = await accounts.resyncWhen2Meet(event.id, poll);
		for (const personId of report.touched) this.noteOwn(personId);
		if (!this.live) await this.refresh();
		return report;
	}

	/** Records that this browser just saved this person's times, so their own change isn't announced. */
	noteOwn(personId: number) {
		this.#own.add(personId);
	}

	#findBlock(id: string): TimeBlock | null {
		const best = this.best;
		if (!best) return null;
		const all = [...best.everyone, ...best.required];
		return all.find((b) => b.id === id) ?? null;
	}

	#findSet(id: string): MeetingSet | null {
		const sets = this.meetingSets;
		if (!sets) return null;
		const all = [...sets.everyone, ...sets.required];
		return all.find((s) => s.id === id) ?? null;
	}

	/** Results change whenever the search's inputs do, so let go of anything pinned. */
	#unpin() {
		this.pinnedBlock = null;
		this.pinnedSet = null;
		this.pinShift = 0;
	}

	reset() {
		this.#loadToken++;
		this.#stopWatching();
		this.#own.clear();
		this.event = null;
		this.status = 'idle';
		this.error = null;
		this.groupId = null;
		this.editingGroup = false;
		this.sharedGroup = null;
		this.changes = NO_CHANGES;
		this.#seen = undefined;
		groups.load(null);
		this.clearHighlights();
	}

	/** A person's role in the group being viewed, or for everyone. */
	roleOf(id: number): Role {
		return roleOf(this.activeRoles, id);
	}

	/** The role the analysis uses, which treats people outside the selected group as skipped. */
	effectiveRoleOf(id: number): Role {
		return roleOf(this.effectiveRoles, id);
	}

	setRole(id: number, role: Role) {
		this.setRoles([id], role);
	}

	/** Changes roles in the group being viewed, or everyone's when no group is. */
	setRoles(ids: Iterable<number>, role: Role) {
		const next = { ...this.activeRoles };
		for (const id of ids) {
			if (role === 'required') delete next[id];
			else next[id] = role;
		}
		this.#setActiveRoles(next);
	}

	#setActiveRoles(roles: Roles) {
		if (this.group) groups.setRoles(this.group.id, roles);
		else this.roles = roles;
		this.#unpin();
	}

	/** Shows the overlap for one group (or everyone, with null). */
	setGroup(id: string | null) {
		this.groupId = id;
		this.editingGroup = false;
		this.sharedGroup = null;
		this.selected = new Set();
		this.onlySelected = false;
		this.#unpin();
		this.hoveredBlock = null;
		this.hoveredSet = null;
	}

	/** Starts a group with the checked people (or no one yet), shows it, and opens it for editing. */
	newGroup() {
		const group = groups.create(groups.nextName(), this.selected);
		this.setGroup(group.id);
		this.editingGroup = true;
	}

	/** Opens the group being viewed for editing, or closes it. */
	editGroup(on: boolean) {
		this.editingGroup = on && !!this.group;
		if (this.editingGroup) this.selected = new Set();
	}

	/**
	 * Leaves any group view. For a shared link's group, everyone the link skipped counts again. A
	 * narrowing to the checked people ends, but they stay checked.
	 */
	showEveryone() {
		this.showOnlySelected(false);
		if (!this.groupLabel) return;
		if (this.sharedGroup && this.event) {
			const skipped = this.event.people.filter((p) => this.roleOf(p.id) === 'skip');
			this.setRoles(
				skipped.map((p) => p.id),
				'required'
			);
		}
		this.setGroup(null);
	}

	toggleSelected(id: number) {
		const next = new Set(this.selected);
		if (!next.delete(id)) next.add(id);
		this.setSelected(next);
	}

	setSelected(ids: Iterable<number>) {
		this.selected = new Set(ids);
		if (!this.onlySelected) return;
		// Checking someone changes who the narrowed view shows; unchecking everyone ends it.
		if (!this.selected.size) this.onlySelected = false;
		this.#unpin();
	}

	/** Narrows the heatmap and best times to the checked people, or goes back. */
	showOnlySelected(on: boolean) {
		this.onlySelected = on && this.selected.size > 0;
		this.#unpin();
		this.hoveredBlock = null;
		this.hoveredSet = null;
	}

	/** Makes everyone required again, in the group being viewed or else for everyone. */
	resetRoles() {
		if (!this.group) this.sharedGroup = null;
		this.#setActiveRoles({});
	}

	setDuration(minutes: number) {
		this.duration = clampDuration(minutes);
		this.#unpin();
	}

	setPerWeek(count: MeetingsPerWeek) {
		this.perWeek = count;
		this.#unpin();
		this.hoveredBlock = null;
		this.hoveredSet = null;
	}

	/** Moves the pinned meeting earlier or later by whole slots, within its window. */
	stepPin(delta: number) {
		const window = this.pinnedBlock ?? this.pinnedSet?.sessions[0];
		if (!window) return;
		this.pinShift = Math.min(Math.max(0, this.shiftFor(window) + delta), this.shiftRoom(window));
	}

	setZone(zone: string) {
		this.zone = zone;
		// Blocks carry grid day indices, which shift with the timezone.
		this.#unpin();
		this.hoveredBlock = null;
		this.hoveredSet = null;
	}

	/** Keeps a best-times block highlighted (or clears it), replacing any picked time. */
	pinBlock(block: TimeBlock | null) {
		this.#unpin();
		this.pinnedBlock = block;
		if (block) this.selection = [];
	}

	/** The same for a set of meetings a week. */
	pinSet(set: MeetingSet | null) {
		this.#unpin();
		this.pinnedSet = set;
		if (set) this.selection = [];
	}

	/**
	 * Picks an exact time, trimmed to the run of back-to-back slots it starts in. With `add`, it
	 * joins the times already picked (replacing any it overlaps) instead of replacing them all.
	 */
	pick(start: number, end: number, { add = false } = {}) {
		if (!this.event || !this.grid) return;
		const span = slotSpan(this.event, this.grid, start, end);
		this.#unpin();
		const range = span && {
			start: this.event.slots[span.startSlot].time,
			end: this.event.slots[span.endSlot].time + this.event.slotSeconds
		};
		if (add) {
			if (range) this.selection = withRange(this.selection, range);
		} else {
			this.selection = range ? [range] : [];
		}
	}

	/** Sets every picked time at once, for a drag still in progress. Ranges must fit the grid. */
	setPicks(ranges: TimeRange[]) {
		this.#unpin();
		this.selection = [...ranges].sort((a, b) => a.start - b.start);
	}

	/** Drops the picked time that starts at `start`. */
	unpick(start: number) {
		this.selection = this.selection.filter((range) => range.start !== start);
	}

	clearPick() {
		this.selection = [];
	}

	/**
	 * Backs out one step, for Escape: the one-person view first, then a pinned result or the picked
	 * times. Says which it left, or null when there was nothing to leave.
	 */
	back(): 'person' | 'selection' | null {
		if (this.pinnedPerson !== null) {
			this.pinnedPerson = null;
			return 'person';
		}
		if (this.pinnedBlock || this.pinnedSet || this.selection.length) {
			this.#unpin();
			this.selection = [];
			return 'selection';
		}
		return null;
	}

	dismissChanges() {
		this.changes = NO_CHANGES;
	}

	/**
	 * The query string for this event as it's set up now. Links to share (`forSharing`) also carry
	 * a narrowing to the checked people. The address bar leaves it out: opened again, a link whose
	 * skips don't match the saved roles reads as someone else's, and those skips would stick.
	 */
	search({
		withZone = false,
		picks = this.selection,
		forSharing = false
	}: { withZone?: boolean; picks?: TimeRange[]; forSharing?: boolean } = {}) {
		if (!this.event) return '';
		return shareSearch({
			id: this.event.id,
			duration: this.duration,
			roles: forSharing ? this.effectiveRoles : this.#groupRoles,
			group: this.groupLabel,
			picks,
			perWeek: this.perWeek,
			// Only link previews use the zone; weekly polls have no zone to speak of.
			zone: withZone && !this.event.weekly ? this.zone : null
		});
	}

	/** A link to share, with the viewer's timezone so previews can spell out times. */
	shareLink(origin: string, picks: TimeRange[] = this.selection): string {
		return this.event
			? `${origin}/${this.search({ withZone: true, picks, forSharing: true })}`
			: '';
	}

	/**
	 * Saves this event's setup (roles, group, duration, and so on) to the signed-in user's account
	 * so it comes back next visit. Signed out, it's only kept for this visit.
	 */
	persist() {
		if (!this.event) return;
		const prefs: EventPrefs = { roles: this.roles, duration: this.duration };
		if (this.perWeek > 1) prefs.perWeek = this.perWeek;
		if (this.zone !== localZone()) prefs.zone = this.zone;
		if (this.group) prefs.group = this.group.id;
		else if (this.sharedGroup) prefs.sharedGroup = this.sharedGroup;
		if (this.#seen) prefs.seen = this.#seen;
		userData.queueEvent(this.event.id, { prefs });
	}

	/**
	 * Called when someone signs in or out with an event open. Signing in brings that event's saved
	 * setup back, replacing the visit's own; if nothing was saved, what's on screen is saved.
	 */
	async accountChanged(uid: string | null) {
		if (this.#knownUid === undefined || this.#knownUid === uid) return;
		this.#knownUid = uid;
		const event = this.event;
		if (!event || !uid) return;
		if (await userData.loadEvent(event.id)) await this.load(event.id, { event });
	}

	clearHighlights() {
		this.hoveredSlot = null;
		this.pinnedPerson = null;
		this.hoveredBlock = null;
		this.pinnedBlock = null;
		this.hoveredSet = null;
		this.pinnedSet = null;
		this.selection = [];
		this.selected = new Set();
		this.onlySelected = false;
	}
}

const overlaps = (a: TimeRange, b: TimeRange) => a.start < b.end && b.start < a.end;

/** `ranges` plus `range`, minus any it overlaps, in time order. */
export const withRange = (ranges: TimeRange[], range: TimeRange): TimeRange[] =>
	[...ranges.filter((r) => !overlaps(r, range)), range].sort((a, b) => a.start - b.start);

/** Longest to wait for a ThenToMeet event's first snapshot before reading it the plain way. */
const OPEN_TIMEOUT_MS = 15_000;

const fetchEvent = async (id: string, { fresh = false } = {}): Promise<W2MEvent> => {
	// ThenToMeet's own events come straight from Firestore; When2Meet's go through the server.
	if (isNativeEventId(id)) return accounts.loadEvent(id);
	let response: Response;
	try {
		response = await fetch(`/api/event/${encodeURIComponent(id)}${fresh ? '?fresh=1' : ''}`);
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
