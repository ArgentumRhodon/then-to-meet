export interface Person {
	id: number;
	name: string;
	/** ThenToMeet entries only: this person set a password, so changing their times needs it. */
	locked?: boolean;
}

export interface Slot {
	/** Unix seconds for the start of the slot. */
	time: number;
	/** IDs of the people available during this slot. */
	available: number[];
}

/** An event as the analysis sees it, whichever service it came from. */
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
	/** People who signed in but haven't marked any times yet. */
	noTimes: Person[];
	fetchedAt: number;
	/**
	 * Where the event lives. Missing means When2Meet, so everything already parsed or saved keeps
	 * its meaning; ThenToMeet's own events (see `$lib/events/model`) say so.
	 */
	source?: 'when2meet' | 'thentomeet';
	/** For a ThenToMeet event imported from When2Meet, the ID of the poll it was copied from. */
	importedFrom?: string;
	/** ThenToMeet events only: the account that owns the event, who can manage it. */
	ownerId?: string;
}

/** A stretch of time as Unix seconds, `end` exclusive. */
export interface TimeRange {
	start: number;
	end: number;
}

export type Role = 'required' | 'optional' | 'skip';

export type Roles = Record<number, Role>;

export interface PeopleGroup {
	id: string;
	name: string;
	/** Person IDs, which are only stable within one poll, so groups belong to one event. */
	members: number[];
	/** Each member's role while this group is viewed; like the event's own roles, missing means required. */
	roles?: Roles;
}
