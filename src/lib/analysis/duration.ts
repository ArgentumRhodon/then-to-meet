/** Meeting lengths the app works with, in minutes. */
export const MIN_DURATION = 15;
export const MAX_DURATION = 8 * 60;
export const DEFAULT_DURATION = 60;

/** Rounds a meeting length to a 15-minute step within the supported range. */
export const clampDuration = (minutes: number): number =>
	Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(minutes / 15) * 15));
