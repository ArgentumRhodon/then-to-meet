import { describe, expect, it } from 'vitest';
import { sharedView } from '$lib/share/sharedView';
import type { W2MEvent } from '$lib/types';
import { demoEventHtml } from '$lib/w2m/demo';
import { parseEvent } from '$lib/w2m/parse';
import { IMAGE_HEIGHT, IMAGE_WIDTH, renderHeatmapImage } from './heatmapImage';

const demo = parseEvent(demoEventHtml(new Date('2026-09-23T12:00:00Z')), 'demo');

const render = (event: W2MEvent, zone = 'America/New_York') => {
	const { grid, roles, featured } = sharedView(event, { id: event.id, zone });
	return renderHeatmapImage({ event, grid, roles, featured });
};

/** Whether it's a PNG, and its width and height, from the header. */
const header = (png: Uint8Array) => {
	const view = new DataView(png.buffer, png.byteOffset);
	return {
		png: String.fromCharCode(...png.slice(1, 4)) === 'PNG',
		size: [view.getUint32(16), view.getUint32(20)]
	};
};

/** Every 15 minutes, all day, for `days` days from `from`, with people free in a pattern. */
const allDay = (days: number, from: number, weekly = false): W2MEvent => ({
	...demo,
	id: 'test',
	weekly,
	slots: Array.from({ length: days * 96 }, (_, i) => ({
		time: from + i * 900,
		available: [1, 2, 3].filter((id) => (i + id) % 5 > 1)
	})),
	people: [1, 2, 3].map((id) => ({ id, name: `Person ${id}` }))
});

describe('renderHeatmapImage', () => {
	it('draws a preview-sized PNG', async () => {
		expect(header(await render(demo))).toEqual({ png: true, size: [IMAGE_WIDTH, IMAGE_HEIGHT] });
	});

	it('fits long days, weekly polls, and many days', async () => {
		// Three weeks of 24-hour days, and a week of them from a weekly poll (Jan 5, 1970, a Monday).
		const long = allDay(21, Date.UTC(2026, 8, 28) / 1000);
		const weekly = allDay(7, Date.UTC(1970, 0, 5) / 1000, true);
		for (const event of [long, weekly]) {
			expect(header(await render(event, 'UTC')).size).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
		}
	});
});
