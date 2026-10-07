import type { MeetingsPerWeek } from '$lib/analysis/meetingSets';
import type {
	EventOverview,
	OverviewBest,
	OverviewDay,
	OverviewTier,
	OverviewTime
} from '$lib/analysis/overview';
import type { PeopleGroup, Role, Roles } from '$lib/types';

/*
 * What a signed-in user keeps in Firestore:
 *
 *   users/{uid}                    UserSettings: theme and heatmap palette
 *   users/{uid}/events/{eventId}   UserEventData: one document per event they've opened, holding
 *                                  its setup (roles, length, timezone, ...), their groups for it,
 *                                  and its entry in their recent events
 *
 * Everything read back goes through the `read*` functions, which keep only what has the right
 * shape: these documents are written by the browser, so nothing in them is taken on trust.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEMES)[number];

export const HEAT_PALETTE_IDS = ['standard', 'deuteranopia', 'protanopia', 'tritanopia'] as const;
export type HeatPaletteId = (typeof HEAT_PALETTE_IDS)[number];

export interface UserSettings {
	theme?: ThemePref;
	heat?: HeatPaletteId;
}

/** Everyone's times as of the last visit, as fingerprints (see `snapshot` in analysis/changes). */
export type Seen = Record<number, string>;

export interface EventPrefs {
	roles?: Roles;
	duration?: number;
	zone?: string;
	/** The group being viewed, if any. */
	group?: string;
	/** Name of the group a shared link was showing, when it isn't one of the viewer's own. */
	sharedGroup?: string;
	/** Everyone's times as of the last visit, to spot what changed since. */
	seen?: Seen;
	perWeek?: MeetingsPerWeek;
}

export interface UserEventData {
	title?: string;
	people?: number;
	/** When the event was last opened, in milliseconds. 0 takes it off the recent list. */
	openedAt?: number;
	prefs?: EventPrefs;
	groups?: PeopleGroup[];
	/** What the home page shows about the event, as of the last time it was open (see analysis/overview). */
	overview?: EventOverview;
}

/** A line in the recent events list. */
export interface RecentEvent {
	id: string;
	title: string;
	people: number;
	openedAt: number;
	overview?: EventOverview;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const oneOf = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
	options.find((option) => option === value);

const ROLES: readonly Role[] = ['required', 'optional', 'skip'];

export const readSettings = (raw: unknown): UserSettings => {
	if (!isRecord(raw)) return {};
	const settings: UserSettings = {};
	const theme = oneOf(THEMES, raw.theme);
	const heat = oneOf(HEAT_PALETTE_IDS, raw.heat);
	if (theme) settings.theme = theme;
	if (heat) settings.heat = heat;
	return settings;
};

const readRoles = (raw: unknown): Roles | undefined => {
	if (!isRecord(raw)) return undefined;
	const roles: Roles = {};
	for (const [id, role] of Object.entries(raw)) {
		const pid = Number(id);
		const valid = oneOf(ROLES, role);
		if (Number.isInteger(pid) && valid) roles[pid] = valid;
	}
	return roles;
};

const readSeen = (raw: unknown): Seen | undefined => {
	if (!isRecord(raw)) return undefined;
	const seen: Seen = {};
	for (const [id, fingerprint] of Object.entries(raw)) {
		if (Number.isInteger(Number(id)) && typeof fingerprint === 'string') {
			seen[Number(id)] = fingerprint;
		}
	}
	return seen;
};

export const readPrefs = (raw: unknown): EventPrefs => {
	if (!isRecord(raw)) return {};
	const prefs: EventPrefs = {};
	const roles = readRoles(raw.roles);
	const seen = readSeen(raw.seen);
	if (roles) prefs.roles = roles;
	if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) {
		prefs.duration = raw.duration;
	}
	if (typeof raw.zone === 'string' && raw.zone) prefs.zone = raw.zone;
	if (typeof raw.group === 'string' && raw.group) prefs.group = raw.group;
	if (typeof raw.sharedGroup === 'string' && raw.sharedGroup) prefs.sharedGroup = raw.sharedGroup;
	if (seen) prefs.seen = seen;
	if (raw.perWeek === 2 || raw.perWeek === 3) prefs.perWeek = raw.perWeek;
	return prefs;
};

const readGroups = (raw: unknown): PeopleGroup[] | undefined => {
	if (!Array.isArray(raw)) return undefined;
	return raw.filter(
		(g): g is PeopleGroup =>
			isRecord(g) &&
			typeof g.id === 'string' &&
			g.id !== '' &&
			typeof g.name === 'string' &&
			g.name !== '' &&
			Array.isArray(g.members) &&
			g.members.every((m) => typeof m === 'number')
	);
};

const isNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

const OVERVIEW_TIERS: readonly OverviewTier[] = ['everyone', 'required', 'near'];

const readTime = (raw: unknown): OverviewTime | null =>
	isRecord(raw) &&
	Array.isArray(raw.starts) &&
	raw.starts.length > 0 &&
	raw.starts.every(isNumber) &&
	isNumber(raw.end) &&
	isNumber(raw.free)
		? { starts: raw.starts, end: raw.end, free: raw.free }
		: null;

const readBest = (raw: unknown): OverviewBest | null => {
	if (!isRecord(raw) || !isNumber(raw.count) || !Array.isArray(raw.times)) return null;
	const tier = oneOf(OVERVIEW_TIERS, raw.tier);
	const times = raw.times.flatMap((t) => readTime(t) ?? []);
	return tier && times.length ? { tier, count: raw.count, times } : null;
};

/** Every column, or none if any of them is off: they only make sense as a whole. */
const readHeat = (raw: unknown): OverviewDay[] => {
	if (!Array.isArray(raw)) return [];
	const days = raw.filter(
		(d): d is OverviewDay =>
			isRecord(d) &&
			typeof d.day === 'string' &&
			/^\d{4}-\d{2}-\d{2}$/.test(d.day) &&
			typeof d.hours === 'string' &&
			/^[0-9.]*$/.test(d.hours)
	);
	const same = days.every((d) => d.hours.length === days[0].hours.length);
	return days.length === raw.length && same ? days.map(({ day, hours }) => ({ day, hours })) : [];
};

/** An overview, or undefined if its essentials are missing; broken times or heat are dropped. */
export const readOverview = (raw: unknown): EventOverview | undefined => {
	if (!isRecord(raw)) return undefined;
	const { weekly, start, end, responses, zone, duration, considered } = raw;
	const perWeek =
		raw.perWeek === 2 || raw.perWeek === 3 ? raw.perWeek : raw.perWeek === 1 ? 1 : null;
	if (
		typeof weekly !== 'boolean' ||
		!isNumber(start) ||
		!isNumber(end) ||
		!isNumber(responses) ||
		typeof zone !== 'string' ||
		!zone ||
		!isNumber(duration) ||
		!isNumber(considered) ||
		perWeek === null
	) {
		return undefined;
	}
	const overview: EventOverview = {
		weekly,
		start,
		end,
		responses,
		zone,
		duration,
		perWeek,
		considered,
		best: readBest(raw.best),
		heat: readHeat(raw.heat)
	};
	if (typeof raw.group === 'string' && raw.group) overview.group = raw.group;
	if (typeof raw.responded === 'boolean') overview.responded = raw.responded;
	return overview;
};

export const readEventData = (raw: unknown): UserEventData => {
	if (!isRecord(raw)) return {};
	const data: UserEventData = {};
	if (typeof raw.title === 'string') data.title = raw.title;
	if (typeof raw.people === 'number') data.people = raw.people;
	if (typeof raw.openedAt === 'number') data.openedAt = raw.openedAt;
	if (isRecord(raw.prefs)) data.prefs = readPrefs(raw.prefs);
	const groups = readGroups(raw.groups);
	if (groups) data.groups = groups;
	const overview = readOverview(raw.overview);
	if (overview) data.overview = overview;
	return data;
};

/** A recent-list line from an event document, or null if it was taken off the list or is broken. */
export const readRecent = (id: string, raw: unknown): RecentEvent | null => {
	const { title, people, openedAt, overview } = readEventData(raw);
	if (!title || !openedAt) return null;
	const recent: RecentEvent = { id, title, people: people ?? 0, openedAt };
	if (overview) recent.overview = overview;
	return recent;
};

/** A copy with nothing Firestore rejects (it refuses `undefined`), for writing. */
export const forFirestore = <T>(value: T): T => JSON.parse(JSON.stringify(value));
