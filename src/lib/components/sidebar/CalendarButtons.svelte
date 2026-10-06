<script lang="ts">
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Download from '@lucide/svelte/icons/download';
	import type { Snippet } from 'svelte';
	import { formatList, formatTime, formatWeekday } from '$lib/analysis/format';
	import {
		byDayName,
		downloadIcs,
		googleCalendarUrl,
		type CalendarMeeting
	} from '$lib/share/calendar';

	/**
	 * Google Calendar buttons for a schedule of one or more calendar events, then an .ics icon button
	 * and any extra icon buttons the card passes in. `zone` is the zone the events are in.
	 */
	let {
		meetings,
		zone,
		children
	}: { meetings: CalendarMeeting[]; zone: string; children?: Snippet } = $props();

	/** "Tue and Thu" for an event repeating on several days, or "Tue" for one day. */
	const days = (m: CalendarMeeting) =>
		m.byDay && m.byDay.length > 1
			? formatList(m.byDay.map(byDayName))
			: formatWeekday(m.start, zone);
	const label = (m: CalendarMeeting) => `${days(m)} ${formatTime(m.start, zone)}`;
</script>

<div class="flex flex-wrap items-center gap-1">
	{#each meetings as meeting (meeting.start)}
		<!-- Google Calendar takes one event per link, so times that differ get a button each. -->
		<a
			class="btn btn-secondary btn-sm"
			href={googleCalendarUrl(meeting)}
			target="_blank"
			rel="noopener noreferrer"
			title={meetings.length > 1
				? `Add the ${label(meeting)} meeting to Google Calendar`
				: 'Add to Google Calendar'}
		>
			<CalendarPlus class="size-3.5 pointer-coarse:size-4.5" aria-hidden="true" />
			{meetings.length > 1 ? label(meeting) : 'Google Calendar'}<span class="sr-only">
				(opens in new tab)</span
			>
		</a>
	{/each}
	<span class="ml-auto flex items-center gap-1">
		<button
			class="btn btn-ghost btn-sm btn-icon"
			onclick={() => downloadIcs(meetings)}
			aria-label={meetings.length > 1 ? 'Download all as .ics' : 'Download .ics'}
			title={meetings.length > 1
				? 'Download every meeting in one .ics for Apple Calendar, Outlook, and others'
				: 'Download .ics for Apple Calendar, Outlook, and others'}
		>
			<Download class="size-3.5 pointer-coarse:size-4.5" />
		</button>
		{@render children?.()}
	</span>
</div>
