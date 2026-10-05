import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = { next: (snap: unknown) => void; error: (e: Error) => void; stop: () => void };
const fake = vi.hoisted(() => ({ listeners: new Map<string, Listener>() }));

vi.mock('firebase/firestore', () => {
	const ref = (path: string) => ({ path });
	return {
		collection: (_db: unknown, ...segments: string[]) => ref(segments.join('/')),
		doc: (_db: unknown, ...segments: string[]) => ref(segments.join('/')),
		onSnapshot: (target: { path: string }, next: Listener['next'], error: Listener['error']) => {
			const stop = vi.fn();
			fake.listeners.set(target.path, { next, error, stop });
			return stop;
		}
	};
});

import { NativeEventNotFound, type EventDoc, type ResponseDoc } from './model';
import { watchNativeEvent } from './store';

const db = {} as never;
const event: EventDoc = {
	ownerId: 'o',
	title: 'Lunch',
	weekly: false,
	slotSeconds: 900,
	slots: [0, 900],
	nextPersonId: 2,
	responseCount: 1,
	memberUids: ['o'],
	source: { type: 'thentomeet' },
	createdAt: 1,
	updatedAt: 1
};
const ada: ResponseDoc = { personId: 1, name: 'Ada', uid: null, available: [0], updatedAt: 1 };

const sendEvent = (doc: EventDoc | null) =>
	fake.listeners.get('events/e1')!.next({ exists: () => doc !== null, data: () => doc });
const sendResponses = (docs: ResponseDoc[]) =>
	fake.listeners.get('events/e1/responses')!.next({ docs: docs.map((d) => ({ data: () => d })) });
/** Lets the microtask that reports a change run. */
const settle = () => Promise.resolve();

beforeEach(() => fake.listeners.clear());

describe('watchNativeEvent', () => {
	it('does not report from this browser’s cache before the server has answered', async () => {
		const onEvent = vi.fn();
		watchNativeEvent(db, 'e1', onEvent, vi.fn());
		const listeners = fake.listeners;
		const cached = (docs: unknown[]) => ({ metadata: { fromCache: true }, docs });
		// Only the browser's own response is cached, and the event document is missing.
		listeners
			.get('events/e1')!
			.next({ metadata: { fromCache: true }, exists: () => false, data: () => null });
		listeners.get('events/e1/responses')!.next(cached([{ data: () => ada }]));
		await settle();
		expect(onEvent).not.toHaveBeenCalled();

		// The server's answer is the first thing reported, and later ones follow as usual.
		listeners.get('events/e1')!.next({
			metadata: { fromCache: false },
			exists: () => true,
			data: () => event
		});
		listeners
			.get('events/e1/responses')!
			.next({ metadata: { fromCache: false }, docs: [{ data: () => ada }] });
		await settle();
		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(onEvent.mock.calls[0][0].people).toHaveLength(1);
	});

	it('waits until it has both the event and its responses, then reports the event', async () => {
		const onEvent = vi.fn();
		watchNativeEvent(db, 'e1', onEvent, vi.fn());
		sendEvent(event);
		await settle();
		expect(onEvent).not.toHaveBeenCalled();

		sendResponses([ada]);
		await settle();
		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(onEvent.mock.calls[0][0]).toMatchObject({
			id: 'e1',
			title: 'Lunch',
			source: 'thentomeet',
			people: [{ id: 1, name: 'Ada' }]
		});
	});

	it('reports once when a write changes both in the same breath', async () => {
		const onEvent = vi.fn();
		watchNativeEvent(db, 'e1', onEvent, vi.fn());
		sendEvent(event);
		sendResponses([ada]);
		await settle();
		onEvent.mockClear();

		sendResponses([ada, { ...ada, personId: 2, name: 'Bo', available: [900] }]);
		sendEvent({ ...event, responseCount: 2 });
		await settle();
		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(onEvent.mock.calls[0][0].people.map((p: { name: string }) => p.name)).toEqual([
			'Ada',
			'Bo'
		]);
	});

	it('reports again for each later change', async () => {
		const onEvent = vi.fn();
		watchNativeEvent(db, 'e1', onEvent, vi.fn());
		sendEvent(event);
		sendResponses([ada]);
		await settle();
		sendResponses([{ ...ada, available: [0, 900] }]);
		await settle();
		expect(onEvent).toHaveBeenCalledTimes(2);
		expect(onEvent.mock.calls[1][0].slots[1].available).toEqual([1]);
	});

	it('says the event is gone if it does not exist, and then goes quiet', async () => {
		const onEvent = vi.fn();
		const onError = vi.fn();
		watchNativeEvent(db, 'e1', onEvent, onError);
		sendEvent(null);
		sendResponses([]);
		await settle();
		expect(onError).toHaveBeenCalledWith(expect.any(NativeEventNotFound));
		sendEvent(event);
		await settle();
		expect(onEvent).not.toHaveBeenCalled();
	});

	it('passes on a listener error once, and goes quiet', async () => {
		const onEvent = vi.fn();
		const onError = vi.fn();
		watchNativeEvent(db, 'e1', onEvent, onError);
		fake.listeners.get('events/e1')!.error(new Error('permission-denied'));
		fake.listeners.get('events/e1/responses')!.error(new Error('permission-denied'));
		sendEvent(event);
		sendResponses([ada]);
		await settle();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onEvent).not.toHaveBeenCalled();
	});

	it('stops both listeners, and ignores anything already on its way', async () => {
		const onEvent = vi.fn();
		const stop = watchNativeEvent(db, 'e1', onEvent, vi.fn());
		sendEvent(event);
		sendResponses([ada]);
		stop();
		await settle();
		expect(fake.listeners.get('events/e1')!.stop).toHaveBeenCalled();
		expect(fake.listeners.get('events/e1/responses')!.stop).toHaveBeenCalled();
		expect(onEvent).not.toHaveBeenCalled();
	});
});
