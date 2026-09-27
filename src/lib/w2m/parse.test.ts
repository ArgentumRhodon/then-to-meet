import { describe, expect, it } from 'vitest';
import { demoEventHtml } from './demo';
import { extractEventId } from './id';
import { decodeText, EventFormatError, EventNotFoundError, parseEvent } from './parse';

const NOW = new Date('2026-09-23T12:00:00Z');

describe('parseEvent', () => {
	const event = parseEvent(demoEventHtml(NOW), 'demo');

	it('reads the title without the When2meet suffix', () => {
		expect(event.title).toBe('Design team sync');
	});

	it('reads slots in time order with 15-minute spacing', () => {
		expect(event.slots).toHaveLength(5 * 32);
		expect(event.slotSeconds).toBe(900);
		for (let i = 1; i < event.slots.length; i++) {
			expect(event.slots[i].time).toBeGreaterThan(event.slots[i - 1].time);
		}
	});

	it('decodes names and sets aside people with no availability', () => {
		const names = event.people.map((p) => p.name);
		expect(names).toContain("Sam O'Connor");
		expect(names).toContain('Diego Álvarez');
		expect(names).not.toContain('Guest');
		expect(event.people).toHaveLength(7);
		expect(event.noTimes).toEqual([{ id: 90210008, name: 'Guest' }]);
	});

	it('detects dated events', () => {
		expect(event.weekly).toBe(false);
	});

	it('pairs names and IDs by index, not match order', () => {
		const html = `
			PeopleIDs[1] = 22; PeopleIDs[0] = 11;
			PeopleNames[0] = 'Ada'; PeopleNames[1] = 'Bo';
			TimeOfSlot[0]=345600; TimeOfSlot[1]=346500;
			AvailableAtSlot[0]=new Array(); AvailableAtSlot[0].push(11); AvailableAtSlot[0].push(22);
			AvailableAtSlot[1]=new Array(); AvailableAtSlot[1].push(22);`;
		const parsed = parseEvent(html, '1-a');
		expect(parsed.people).toEqual([
			{ id: 22, name: 'Bo' },
			{ id: 11, name: 'Ada' }
		]);
		expect(parsed.weekly).toBe(true);
		expect(parsed.title).toBe('Untitled event');
	});

	it('reports a missing event as not found', () => {
		// What When2Meet actually serves for an ID that doesn't exist.
		expect(() => parseEvent('<html><title> - When2meet</title></html>', 'x')).toThrow(
			EventNotFoundError
		);
		expect(() => parseEvent('<html><title>When2meet</title></html>', 'x')).toThrow(
			EventNotFoundError
		);
	});

	it('reports a real event it cannot read as a format change', () => {
		expect(() =>
			parseEvent('<html><title>Team sync - When2meet</title><div id="grid"></div></html>', 'x')
		).toThrow(EventFormatError);
		expect(() => parseEvent('<html><body>new app</body></html>', 'x')).toThrow(EventFormatError);
	});
});

describe('decodeText', () => {
	it('decodes entities and JS escapes without executing markup', () => {
		expect(decodeText('Tom &amp; Jerry')).toBe('Tom & Jerry');
		expect(decodeText('&lt;img src=x&gt;')).toBe('<img src=x>');
		expect(decodeText("O\\'Brien")).toBe("O'Brien");
		expect(decodeText('&#x1F600; &#233;')).toBe('😀 é');
		expect(decodeText('&bogus;')).toBe('&bogus;');
	});
});

describe('extractEventId', () => {
	it('accepts links, bare IDs, and the demo keyword', () => {
		expect(extractEventId('https://www.when2meet.com/?12345678-AbCdE')).toBe('12345678-AbCdE');
		expect(extractEventId('  when2meet.com/?9-x1 ')).toBe('9-x1');
		expect(extractEventId('12345678-AbCdE')).toBe('12345678-AbCdE');
		expect(extractEventId('Demo')).toBe('demo');
		expect(extractEventId('https://example.com')).toBeNull();
		expect(extractEventId('')).toBeNull();
	});
});
