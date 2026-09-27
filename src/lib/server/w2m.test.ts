import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoEventHtml } from '$lib/w2m/demo';
import { EventLoadError, getEvent } from './w2m';

// The cache is shared across the module, so each test uses its own event ID.
const serve = (html: string, status = 200) =>
	vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) => new Response(html, { status })
	);

afterEach(() => {
	vi.useRealTimers();
});

describe('getEvent', () => {
	it('fetches and parses an event, with a timeout', async () => {
		const fetcher = serve(demoEventHtml());
		const event = await getEvent('1-fetch', fetcher);
		expect(event.id).toBe('1-fetch');
		expect(event.people.length).toBeGreaterThan(0);
		expect(fetcher).toHaveBeenCalledWith(
			'https://www.when2meet.com/?1-fetch',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('shares one request between callers and reuses it briefly', async () => {
		const fetcher = serve(demoEventHtml());
		const [a, b] = await Promise.all([getEvent('2-share', fetcher), getEvent('2-share', fetcher)]);
		await getEvent('2-share', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it('fetches again for a fresh copy, and after the cache expires', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const fetcher = serve(demoEventHtml());
		await getEvent('3-fresh', fetcher);
		vi.setSystemTime(Date.now() + 6_000);
		await getEvent('3-fresh', fetcher, { fresh: true });
		expect(fetcher).toHaveBeenCalledTimes(2);
		vi.setSystemTime(Date.now() + 21_000);
		await getEvent('3-fresh', fetcher);
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it('limits fresh copies to one every few seconds', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const fetcher = serve(demoEventHtml());
		await getEvent('9-spam', fetcher, { fresh: true });
		await Promise.all([1, 2, 3].map(() => getEvent('9-spam', fetcher, { fresh: true })));
		expect(fetcher).toHaveBeenCalledTimes(1);
		vi.setSystemTime(Date.now() + 5_000);
		await getEvent('9-spam', fetcher, { fresh: true });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('does not keep failures around', async () => {
		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockImplementation(async () => new Response(demoEventHtml()));
		await expect(getEvent('4-retry', fetcher)).rejects.toMatchObject({ status: 502 });
		await expect(getEvent('4-retry', fetcher)).resolves.toMatchObject({ id: '4-retry' });
	});

	it('reports a slow When2Meet as a timeout', async () => {
		const fetcher = vi.fn(async () => {
			throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		});
		const error = await getEvent('5-slow', fetcher).catch((e) => e);
		expect(error).toBeInstanceOf(EventLoadError);
		expect(error.status).toBe(504);
	});

	it('passes along When2Meet errors', async () => {
		await expect(getEvent('6-down', serve('Service unavailable', 503))).rejects.toMatchObject({
			status: 502,
			message: expect.stringContaining('503')
		});
	});

	it('tells a missing event apart from a page it can no longer read', async () => {
		await expect(
			getEvent('7-gone', serve('<html><title> - When2meet</title></html>'))
		).rejects.toMatchObject({ status: 404 });
		await expect(
			getEvent('8-changed', serve('<html><title>Team sync - When2meet</title></html>'))
		).rejects.toMatchObject({ status: 502, message: expect.stringContaining('changed') });
	});

	it('builds the demo without fetching', async () => {
		const fetcher = serve('');
		await expect(getEvent('demo', fetcher)).resolves.toMatchObject({ id: 'demo' });
		expect(fetcher).not.toHaveBeenCalled();
	});
});
