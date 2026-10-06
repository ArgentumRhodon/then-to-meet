import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPEAK_DELAY, toast, toastDuration } from './toast.svelte';

describe('toastDuration', () => {
	it('gives a short message a few seconds', () => {
		expect(toastDuration('Link copied', false)).toBe(4000);
	});

	it('grows with the message, so a long one can be read', () => {
		const long =
			'Updated from When2Meet: 3 added, 2 updated. 2 changed here, so left as they were.';
		expect(toastDuration(long, false)).toBeGreaterThan(6000);
	});

	it('leaves time to reach a button', () => {
		expect(toastDuration('Deleted Team', true)).toBeGreaterThanOrEqual(10_000);
	});
});

describe('toast', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		toast.hide();
		vi.useRealTimers();
	});

	it('hides itself once read', () => {
		toast.show('Link copied');
		vi.advanceTimersByTime(3999);
		expect(toast.message).toBe('Link copied');
		vi.advanceTimersByTime(1);
		expect(toast.message).toBeNull();
	});

	it('says a repeated message again', () => {
		toast.show('Link copied');
		vi.advanceTimersByTime(SPEAK_DELAY);
		expect(toast.spoken).toBe('Link copied');
		toast.show('Link copied');
		// Cleared first, so a screen reader sees new text when it comes back.
		expect(toast.spoken).toBe('');
		vi.advanceTimersByTime(SPEAK_DELAY);
		expect(toast.spoken).toBe('Link copied');
	});

	it('marks failures', () => {
		toast.fail("Couldn't copy.");
		expect(toast.error).toBe(true);
		toast.show('Copied');
		expect(toast.error).toBe(false);
	});

	it('stays while paused and gets its full time back after', () => {
		toast.show('Deleted Team', { label: 'Undo', run: () => {} });
		vi.advanceTimersByTime(9000);
		toast.pause();
		vi.advanceTimersByTime(60_000);
		expect(toast.message).toBe('Deleted Team');
		toast.resume();
		vi.advanceTimersByTime(9999);
		expect(toast.message).toBe('Deleted Team');
		vi.advanceTimersByTime(1);
		expect(toast.message).toBeNull();
	});
});
