# ThenToMeet

A modern web application that helps groups find optimal meeting times by analyzing When2Meet scheduling polls.

## Purpose

Paste a When2Meet link and ThenToMeet turns the poll into answers:

- Ranks every time window that fits your meeting length (half an hour to three hours), for everyone and for all required people, and when nothing fits, says who's the only one missing from the most near misses, with a one-click fix
- Plans meetings two or three times a week, at about the same time with a day off between (like Mon/Wed/Fri or Tue/Thu)
- Lets you mark each person as required, optional, or skipped, one at a time or in bulk, and points out who's blocking the most near misses
- Saves groups of people for each event, so a team is one click away
- Shows the poll as a heatmap in any timezone (named in the header, and changed right there), with per-slot details, a spotlight on any one person, and click-or-drag (or the keyboard) to check any time
- Tells you who responded or changed their times since your last visit, keeps checking while the page is open, and writes the reminder for anyone who signed in without adding times
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
│   └── api/event/[id]/           # A When2Meet event (or a ThenToMeet one, for link previews) as JSON
├── lib/
│   ├── firebase/                 # Web config, browser-side Firebase Auth and Firestore (loaded on demand)
│   ├── events/                   # ThenToMeet's own events: model, IDs, Firestore store, import (unit tested)
│   ├── server/                   # When2Meet fetching, the event loader for link previews, preview images
│   ├── w2m/                      # When2Meet parsing, link handling, demo event
│   ├── analysis/                 # Heatmap grid, best-time search, response changes (unit tested)
│   ├── share/                    # Share links, link previews, text summaries, calendar export
│   ├── state/                    # App state, recent events, groups, theme
│   ├── components/               # Sidebar, heatmap, and landing UI
│   └── ui/                       # Small shared UI pieces
```

## Accounts and Firebase

ThenToMeet is moving from reading When2Meet polls to events of its own, owned by user accounts. Firebase Auth handles sign-in and Firestore stores the events. **Accounts are optional**: with no Firebase configuration, ThenToMeet runs exactly as before on When2Meet links alone, and every existing link, saved preference, and shared URL keeps working.

- **Native events** are loaded into the same `W2MEvent` shape When2Meet polls parse into, so the heatmap, best times, groups, sharing, and link previews work on them unchanged. Their IDs are 20 letters and digits; When2Meet's always contain a hyphen, so the two never collide, and `?e=<id>` links work for both.
- **Importing a When2Meet poll** (the Import button on a poll, which signs the user in first) copies it into their account with everyone's times and person IDs intact. It's a snapshot: the poll on When2Meet is untouched, and importing the same poll again opens the first copy.
- **No server-side Firebase code.** The browser signs in with Firebase Auth (Google) and reads and writes Firestore directly through the web SDK, so there's no service account to manage. `firestore.rules` is the only gatekeeper, and it follows how When2Meet works: an event's link is all anyone needs. Anyone with it can view the event, add themselves by name (no account), and set times, and entering a name that's already there edits that person, as on When2Meet. An account is only needed to create an event (which makes you its owner, able to delete it) and to see your events. Link previews read events from the server as a signed-out visitor.

### Data model

```
events/{eventId}                 owner, title, weekly, slotSeconds, slots[], memberUids[], adminUids[], source, ...
events/{eventId}/responses/{name}  personId, name, uid | null, available[] (slot times), updatedAt, salt?, nonce?, proof?
events/{eventId}/secrets/{name}    secret (unreadable by anyone; only the rules see it)
users/{uid}                      theme, heat (the heatmap palette)
users/{uid}/events/{eventId}     prefs{}, groups[], and title / people / openedAt for the recent list
```

Times are Unix seconds, as everywhere else. `source` is `thentomeet` or `{ when2meet, id, importedAt }`. Events are in `src/lib/events/store.ts` (creating one, importing a poll, saving someone's times, listing a user's events). A response is filed under its person's name (case and spacing don't matter), so a name is one person.

**Passwords** are optional and set when an entry is created, as on When2Meet; after that, changing the entry takes the password (`PasswordRequired` / `WrongPassword` otherwise). With no server to check them, the rules do: a slow hash of the password (the "secret") sits in a document nobody can read, and each change must carry a proof that mixes the secret with the entry's current and new random nonce, which the rules recompute. The public entry only shows a salt, a nonce, and the last proof, none of which let anyone edit it or replay an old edit (`src/lib/events/password.ts` explains it). Someone with the current password can **change** it (from **Password…** in the selection card) (a new salt, and the secret swapped in the same write) or **remove** it (a proof of the removal, and the secret deleted with it); a name whose password was removed can't be protected again. A password can't be added to an existing entry.

**Limits** (so a public link can't be used to fill the database): a new event's fields are checked for type and size, and an event holds at most 500 people unless its owner adds more. Joining is one write that adds the response and moves the event's `nextPersonId` and `responseCount` up by one, naming the response in `lastJoin`, so the counters and the responses can't drift apart and visitors can't lower them. The app says "This event is full" before the rules have to. Opening a ThenToMeet event follows it live, and that first snapshot is the one read of its responses (it falls back to a plain read if the listener can't start); the server shares a read of an event for 30 seconds between a shared link's page and its preview image.

**Owner controls** (`src/lib/events/manage.ts`): an event's owner can delete the event with everyone's responses, or remove one person's entry along with its password (which also frees the name to be used again). Each control sits with what it acts on: actions on people (**Remove…**, and **Password…** for a person who has one) are in a "Manage" section of the selection card in the people list, and event-level controls are in an owner-only **Manage** menu in the event header: **Delete event…**, **Transfer ownership…** (hands the event to another signed-in person who responded; the old owner stays a member), and, for an imported copy, **Update from When2Meet** (re-reads the poll and brings in new people, new times, and changed times for people nobody has touched here since; anyone who edited, claimed or locked their entry in the copy is left as they are). The Add-your-times dialog stays about your own name, password and times.

**Admins**: the owner can make any signed-in person who responded an admin (**Make admin** / **Remove admin** in the selection card's Manage section, with one person selected). Admins can do everything the owner can except delete the event, transfer it, or choose the admins: they remove people, update an import from When2Meet, and add people past the limit. They can **Step down as admin…** from the Manage menu. The people list marks the owner and admins. Stored as `adminUids` on the event; firestore.rules enforces it, and `rules-tests/admins.test.ts` covers it.

### Creating events and adding times

**Create your own** (on the start page, or `/new`) asks for a name, specific dates or days of the week, the hours, and a slot length, then makes you the event's owner (signing you in first if needed) and opens it. The slots are built from the creator's timezone for dated events, and as When2Meet-style 1970 timestamps for weekly ones, so everyone sees dated events in their own zone and weekly ones unshifted. On any ThenToMeet event, **Add your times** opens a form for a name, an optional password, and a grid to click or drag across. Typing a name that's already in the event shows that person's times to change, and asks for the password if they set one. Anyone with the link can do this, signed in or not.

### Setup

1. In the [Firebase console](https://console.firebase.google.com), create a project, add a **Web app**, turn on **Authentication** with the **Google** provider (and add your domains under Authentication > Settings > Authorized domains), and create a **Firestore** database.
2. Copy `.env.example` to `.env` and fill in the four `PUBLIC_FIREBASE_*` values from the web app.
3. Deploy the rules and indexes: `npm run firebase:deploy` (after `npx firebase-tools login` and `npx firebase-tools use <project-id>`). Until the rules are deployed, Firestore uses whatever rules the project was created with.

To develop without touching a real project, run `npm run emulators` (needs Java for the Firestore emulator) and set `PUBLIC_FIREBASE_EMULATORS=true`.

## Key Features

1. **When2Meet Integration** - Accepts full links or bare IDs, including v1 `/?<id>` links
2. **Best Times** - Finds maximal windows for meetings of 30 minutes to 3 hours that work for everyone, or for every required person when some are optional. When nothing fits, it lists the people who are the only one missing from the most near misses (with a one-click Make optional or Skip), and offers a shorter meeting or fewer meetings a week
3. **Meetings a Week** - Once, twice, or three times: sets of meetings on days with at least one day between them (counting the wrap into next week) that start within half an hour of each other, ranked by the worst meeting first. Each set highlights all its meetings on the grid, lets every meeting start later together when that keeps the same people, and exports meetings at the same time as one repeating calendar event (others get their own), each described with the full schedule and who can make which meeting
4. **Required and Optional People** - Rankings respect who has to be there; skipped people are ignored. When the same person is the only one missing from several near misses, best times says so, with a one-click fix
5. **Groups and Bulk Selection** - Check people (or click their names; shift-click for ranges) to see just their overlap right away, set roles together, or save them as a group; picking a group instantly shows the overlap for just its members
6. **Interactive Heatmap** - Hover or arrow-key through slots, pin a result, and preview anyone's times by hovering their name (the eye button keeps them on the grid, with a banner). Click a cell (or press Enter) to check a meeting starting there, or drag (or hold Shift with Up or Down) to check an exact range; hold Shift to add more times (or Shift-click one to drop it), see who can make every meeting, then export them. Esc backs out a step at a time: the slot's details, then the one-person view, then a pinned result or picked times (or, mid-drag, the drag itself)
7. **Timezones** - View any event in any IANA timezone. The zone the times are in is named in the event header ("New York time (GMT-4)"), where it can be changed, and the same way everywhere else times are shown or copied
8. **Share and Export** - Shareable state links (including a group's name, a specific time, and meetings a week), link previews that name the best time and show the heatmap with it outlined, copyable summaries, Google Calendar and .ics (weekly polls export as a weekly repeating event)
9. **Response Tracking** - New and updated responses since your last visit are flagged, and anyone who signed in without adding times is listed with a copyable reminder. ThenToMeet events are followed live (a Firestore listener, marked "live" in the header), so responses show up as they come in, with a note for each change that isn't your own; When2Meet polls are checked every minute while the page is open, and refresh reports what changed
10. **Saved to Your Account** - Signed-in users keep their theme, heatmap palette, recent events, and each event's roles, length, meetings a week, timezone, and groups in Firestore, so they follow the user across devices. Nothing is kept in the browser's own storage: signed out, ThenToMeet works the same but remembers nothing past the visit. The first time someone signs in, anything an earlier version saved in that browser is moved into their account (without overwriting anything the account already has) and then cleared from the browser
11. **Colorblind-Friendly Heatmap** - Palettes tuned for deuteranopia, protanopia, and tritanopia, checked with a color vision deficiency simulation. Every palette, the standard one included, gets lighter with each person free, so the "everyone" cells are always the brightest
12. **Responsive Design** - People sidebar, heatmap, and best times in three columns on wide screens; on laptop-width windows best times leads the sidebar, above the people list; on screens too narrow for the heatmap, best times takes over with a per-day availability strip. Dark (default), light, and system themes
13. **Accessible** - Built to WCAG 2.2 AA: everything works from the keyboard (the heatmap and the availability grid included, with Shift+arrows standing in for a drag), screen readers hear each slot's time and who can't make it, nothing is shown by color alone, focus is never lost or hidden, and text sizes follow the browser's setting. `A11Y_DESIGN_AUDIT.md` has the audit and what's left

## Checks

CI runs Prettier, `svelte-check`, and the unit tests on every push, plus the rules tests below in their own job.

**Rules tests** (`npm run test:rules`) run `firestore.rules` and the real store code against the Firebase Auth and Firestore emulators, with each test acting as a different user or a signed-out visitor: who can read, join, edit, and delete; owner controls; imports; per-user data; and password attacks (forged and replayed proofs, tampering with secrets). They need **Java 21** on the PATH (the emulator is a Java program) and download the emulator on first run. The normal `npm test` doesn't include them. They live in `rules-tests/`.

A scheduled workflow also reads a real When2Meet poll each day (`npm run test:live`), so a change on When2Meet's end shows up there first. Point it at a poll you own by setting the `W2M_LIVE_EVENT` repository variable.
