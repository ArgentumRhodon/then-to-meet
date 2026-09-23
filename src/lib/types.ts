export interface Person {
	id: number;
	name: string;
}

export interface Slot {
	/** Unix seconds for the start of the slot. */
	time: number;
	/** IDs of the people available during this slot. */
	available: number[];
}

export interface W2MEvent {
	id: string;
	title: string;
	/**
	 * "Days of the week" events aren't tied to real dates. When2Meet stores them as
	 * 1970s timestamps whose UTC wall-clock is the intended time, so they're always shown in UTC.
	 */
	weekly: boolean;
	/** Length of one slot in seconds (15 minutes on When2Meet). */
	slotSeconds: number;
	/** Sorted by time. */
	slots: Slot[];
	/** Only people who marked at least one slot. */
	people: Person[];
	fetchedAt: number;
}

export type Role = 'required' | 'optional' | 'skip';

export type Roles = Record<number, Role>;

export interface PeopleGroup {
	id: string;
	name: string;
	/** Person IDs, which are only stable within one poll, so groups belong to one event. */
	members: number[];
}
