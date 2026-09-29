# ThenToMeet

A modern web application that helps groups find optimal meeting times by analyzing When2Meet scheduling polls.

## Purpose

Paste a When2Meet link and ThenToMeet turns the poll into answers:

- Ranks every time window that fits your meeting length (half an hour to three hours), grouped into "everyone's free", "all required people", "one person short", and "fewer people", with an attendance slider to hide weaker matches
- Plans meetings two or three times a week, at about the same time with a day off between (like Mon/Wed/Fri or Tue/Thu)
- Lets you mark each person as required, optional, or skipped, one at a time or in bulk, and points out who's blocking the most near misses
- Saves groups of people for each event, so a team is one click away
- Shows the poll as a heatmap in any timezone, with per-slot details, a spotlight on any one person, and click-or-drag to check any time
- Tells you who responded or changed their times since your last visit, keeps checking while the page is open, and writes the reminder for anyone who signed in without marking times
- Shares the result as a link (with a real preview in Slack, Discord, and iMessage, heatmap included), a Slack/Discord-ready summary, or a Google Calendar / .ics event

## Tech Stack

- **Frontend**: Svelte 5 (runes) + SvelteKit 2 with TypeScript
- **Styling**: Tailwind CSS 4 with a small set of custom components; colors carry over v1's Skeleton "rocket" palette and red-to-green heatmap, which always renders dark (a framed panel in the light theme)
- **Utilities**: Luxon (dates and timezones), Lucide icons, Inter
- **Preview images**: Satori and resvg, drawing the heatmap server-side
- **Build and test**: Vite 8, Vitest

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Landing page and event workspace
│   ├── +page.server.ts           # Link previews: fetches a shared event for its meta tags
│   ├── og.png/+server.ts         # Link previews: the shared event's heatmap as an image
│   └── api/event/[id]/+server.ts # Fetches and parses a When2Meet event into JSON
├── lib/
│   ├── server/                   # When2Meet fetching (timeout, short shared cache), preview images
│   ├── w2m/                      # When2Meet parsing, link handling, demo event
│   ├── analysis/                 # Heatmap grid, best-time search, response changes (unit tested)
│   ├── share/                    # Share links, link previews, text summaries, calendar export
│   ├── state/                    # App state, recent events, groups, theme
│   ├── components/               # Sidebar, heatmap, and landing UI
│   └── ui/                       # Small shared UI pieces
```

## Key Features

1. **When2Meet Integration** - Accepts full links or bare IDs, including v1 `/?<id>` links
2. **Best Times** - Finds maximal windows for meetings of 30 minutes to 3 hours, with near misses and an attendance cutoff: a slider with a stop per person that hides anything fewer people can make (for a set of meetings, its emptiest one), spans only the attendance levels times actually reach, and returns to the best match whenever the search changes
3. **Meetings a Week** - Once, twice, or three times: sets of meetings on days with at least one day between them (counting the wrap into next week) that start within half an hour of each other, ranked by the worst meeting first. Each set highlights all its meetings on the grid, lets every meeting start later together when that keeps the same people, and exports meetings at the same time as one repeating calendar event (others get their own), each described with the full schedule and who can make which meeting
4. **Required and Optional People** - Rankings respect who has to be there; skipped people are ignored. When the same person is the only one missing from several near misses, best times says so, with a one-click fix
5. **Groups and Bulk Selection** - Check people (or click their names; shift-click for ranges) to see just their overlap right away, set roles together, or save them as a group; picking a group instantly shows the overlap for just its members
6. **Interactive Heatmap** - Hover or arrow-key through slots, pin a result, and preview anyone's times by hovering their name (the eye button keeps them on the grid, with a banner). Click a cell (or press Enter) to check a meeting starting there, or drag to check an exact range; hold Shift to add more times (or Shift-click one to drop it), see who can make every meeting, then export them. Esc backs out a step at a time: the one-person view, then a pinned result or picked times (or, mid-drag, the drag itself)
7. **Timezones** - View any event in any IANA timezone
8. **Share and Export** - Shareable state links (including a group's name, a specific time, and meetings a week), link previews that name the best time and show the heatmap with it outlined, copyable summaries, Google Calendar and .ics (weekly polls export as a weekly repeating event)
9. **Response Tracking** - New and updated responses since your last visit are flagged, the page checks for more every minute while it's open, refresh reports what changed, and anyone who signed in without marking times is listed with a copyable reminder
10. **Browser Persistence** - Remembers recent events and each event's groups, roles, length, meetings a week, and timezone
11. **Colorblind-Friendly Heatmap** - Palettes tuned for deuteranopia, protanopia, and tritanopia, checked with a color vision deficiency simulation
12. **Responsive Design** - Sidebar layout on desktop; on screens too narrow for the heatmap, best times takes over with a per-day availability strip. Dark (default), light, and system themes

## Checks

CI runs Prettier, `svelte-check`, and the unit tests on every push. A scheduled workflow also reads a real When2Meet poll each day (`npm run test:live`), so a change on When2Meet's end shows up there first. Point it at a poll you own by setting the `W2M_LIVE_EVENT` repository variable.
