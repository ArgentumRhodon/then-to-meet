/** Meeting lengths the app offers, in minutes: half an hour to three, in half-hour steps. */
export const DURATION_STEP = 30;
export const MIN_DURATION = 30;
export const MAX_DURATION = 3 * 60;
export const DEFAULT_DURATION = 60;
export const DURATIONS = Array.from(
	{ length: (MAX_DURATION - MIN_DURATION) / DURATION_STEP + 1 },
	(_, i) => MIN_DURATION + i * DURATION_STEP
);

/** Rounds a meeting length to one the app offers. */
export const clampDuration = (minutes: number): number =>
	Math.min(
		MAX_DURATION,
		Math.max(MIN_DURATION, Math.round(minutes / DURATION_STEP) * DURATION_STEP)
	);
