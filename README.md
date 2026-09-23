# ThenToMeet

A modern web application that helps groups find optimal meeting times by analyzing When2Meet scheduling polls.

## Purpose

Paste a When2Meet link and ThenToMeet turns the poll into answers:

- Ranks every time window that fits your meeting length, grouped into "everyone's free", "all required people", and "one person short"
- Lets you mark each person as required, optional, or skipped, one at a time or in bulk
- Saves groups of people for each event, so a team is one click away
- Shows the poll as a heatmap in any timezone, with per-slot details and a spotlight on any one person
- Shares the result as a link, a Slack/Discord-ready summary, or a Google Calendar / .ics event

## Tech Stack

- **Frontend**: Svelte 5 (runes) + SvelteKit 2 with TypeScript
- **Styling**: Tailwind CSS 4 with a small set of custom components; colors carry over v1's Skeleton "rocket" palette and red-to-green heatmap, which always renders dark (a framed panel in the light theme)
- **Utilities**: Luxon (dates and timezones), Lucide icons, Inter
- **Build and test**: Vite 8, Vitest

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Landing page and event workspace
│   └── api/event/[id]/+server.ts # Fetches and parses a When2Meet event into JSON
├── lib/
│   ├── w2m/                      # When2Meet parsing, link handling, demo event
│   ├── analysis/                 # Heatmap grid and best-time search (unit tested)
│   ├── share/                    # Share links, text summaries, calendar export
│   ├── state/                    # App state, recent events, groups, theme
│   ├── components/               # Sidebar, heatmap, and landing UI
│   └── ui/                       # Small shared UI pieces
```

## Key Features

1. **When2Meet Integration** - Accepts full links or bare IDs, including v1 `/?<id>` links
2. **Best Times** - Finds maximal windows for any meeting length, with near misses, a "most people" fallback when nothing fits everyone, and day and sort filters
3. **Required and Optional People** - Rankings respect who has to be there; skipped people are ignored
4. **Groups and Bulk Selection** - Check people (shift-click for ranges) to set roles together or save them as a group; picking a group instantly shows the overlap for just its members
5. **Interactive Heatmap** - Hover or arrow-key through slots, spotlight one person, pin a result
6. **Timezones** - View any event in any IANA timezone
7. **Share and Export** - Shareable state links, copyable summaries, Google Calendar and .ics (weekly polls export as a weekly repeating event)
8. **Browser Persistence** - Remembers recent events and each event's groups, roles, length, and timezone
9. **Colorblind-Friendly Heatmap** - Palettes tuned for deuteranopia, protanopia, and tritanopia, checked with a color vision deficiency simulation
10. **Responsive Design** - Sidebar layout on desktop; on screens too narrow for the heatmap, best times takes over with a per-day availability strip. Dark (default), light, and system themes
