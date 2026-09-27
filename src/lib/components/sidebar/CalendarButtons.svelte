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
	 * Google Calendar and .ics buttons for a schedule of one or more calendar events, followed by any
	 * extra buttons the card passes in. `zone` is the zone the events are in, for their labels.
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
	const repeatsOnSeveralDays = (m: CalendarMeeting) => !!m.byDay && m.byDay.length > 1;
</script>

{#if meetings.length > 1}
	<p class="text-xs text-fg-3">
		Google Calendar adds one event per link, and these meetings aren’t all at the same time, so add
		each one, or get them all in one .ics file.
	</p>
{/if}
<div class="flex flex-wrap gap-1.5">
	{#each meetings as meeting (meeting.start)}
		<a
			class="btn btn-secondary btn-sm"
			href={googleCalendarUrl(meeting)}
			target="_blank"
			rel="noopener noreferrer"
			title={repeatsOnSeveralDays(meeting)
				? `Add one event on ${days(meeting)} at ${formatTime(meeting.start, zone)} to Google Calendar`
				: meetings.length > 1
					? `Add the ${label(meeting)} meeting to Google Calendar`
					: 'Add to Google Calendar'}
		>
			<CalendarPlus class="size-3.5" aria-hidden="true" />
			{meetings.length > 1 ? label(meeting) : 'Google Calendar'}
		</a>
	{/each}
	<button
		class="btn btn-secondary btn-sm"
		onclick={() => downloadIcs(meetings)}
		title="Download a calendar file for Apple Calendar, Outlook, and others"
	>
		<Download class="size-3.5" aria-hidden="true" />
		{meetings.length > 1 ? 'All as .ics' : '.ics'}
	</button>
	{@render children?.()}
</div>
