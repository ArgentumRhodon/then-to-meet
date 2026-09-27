import { describe, expect, it } from 'vitest';
import { getEvent } from './w2m';

/**
 * Checks the parser against the real When2Meet, so a change on their end shows up here before
 * users hit it. Skipped unless W2M_LIVE_EVENT names a poll with at least one response; the
 * scheduled workflow in .github/workflows/when2meet.yml sets it.
 */
const id = process.env.W2M_LIVE_EVENT;

describe.skipIf(!id)('live When2Meet', () => {
	it('reads a real event', async () => {
		const event = await getEvent(id!, fetch, { fresh: true });
		expect(event.title).not.toBe('Untitled event');
		expect(event.slots.length).toBeGreaterThan(0);
		expect(event.people.length).toBeGreaterThan(0);
		expect(event.slots.some((slot) => slot.available.length > 0)).toBe(true);
		// Unmatched names fall back to "Person N", which would mean the name format changed.
		expect(event.people.every((p) => !/^Person \d+$/.test(p.name))).toBe(true);
	}, 30_000);

	it('still recognizes a missing event', async () => {
		await expect(getEvent('1-ThenToMeetMissing', fetch, { fresh: true })).rejects.toMatchObject({
			status: 404
		});
	}, 30_000);
});
