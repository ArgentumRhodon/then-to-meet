# Handoff: ThenToMeet accounts and Firebase (branch `v2.0-users`)

Written 2026-10-02 for the next session. Everything below is **uncommitted** in the working tree
(base: `b9ceeff`). Nothing has been committed or pushed; the user hasn't asked for that yet.

## What this work is

ThenToMeet used to only read When2Meet polls. It now also has events of its own, backed by Firebase
Auth + Firestore, **without ever breaking the When2Meet path**. The user tried the whole flow live
and reported it all worked: rules published, creating an event, a signed-out visitor joining with a
password, and editing with the right, wrong, and missing password.

- Accounts are optional. With no `PUBLIC_FIREBASE_*` env, the app behaves exactly as before.
- ThenToMeet events are turned into the same `W2MEvent` shape When2Meet polls parse into, so the
  heatmap, best times, groups, sharing and link previews work on them unchanged.
- Firebase project ID is `then-to-meet`. The user filled the web config into `.env` themselves
  (don't print or commit it; `.env*` is gitignored except `.env.example`).

## Decisions the user made (don't relitigate)

1. **Client-only Firebase, no Admin SDK.** I first built a server-authoritative version (service
   account, session cookies, API routes). The user asked why the Admin SDK was needed and chose
   client-only because "security doesn't need to be particularly tight". It was all removed.
   Don't reintroduce a service account, server-side writes, or session cookies.
2. **Rules emulate When2Meet.** An event's link is all anyone needs: anyone can read, add themselves
   by name (no account), and edit anyone's times by entering their name. An account is only needed to
   create an event (which makes you its owner) and for "your events".
3. **Optional per-entry passwords**, set when an entry is created, like When2Meet.
4. **Imports are per-user snapshots.** Importing a When2Meet poll gives _that user_ their own copy
   (ID = hash of uid + poll ID), idempotent per user. Importing never makes anyone else a participant.
   The user explicitly liked this.
5. **No browser storage.** Theme, heatmap palette, recent events, per-event setup and groups live in
   Firestore. Signed-out visitors keep state in memory for the visit only. No `localStorage`.
   Existing localStorage data is **not migrated**, and the old v1 `linkMemory` import was dropped.
6. Look and feel decisions from earlier work are in the memory file `thentomeet-v2-direction.md`
   (dark default, rocket palette, heatmap always dark, etc.). Keep new UI consistent with them.

## Architecture map

```
src/lib/firebase/        config.ts (public env, accountsEnabled), client.ts (browser Auth + Firestore,
                         emulator switch), user.ts (SessionUser type)
src/lib/events/          model.ts      Firestore doc types, toEvent (docs -> W2MEvent), importDocs,
                                       parseNewEvent/parseName/parseResponse/parsePassword, errors
                         id.ts         native vs When2Meet ID helpers
                         store.ts      create / import / submitResponse / list / load (takes a Firestore)
                         password.ts   PBKDF2 secret + nonce/proof (see "Passwords")
                         slots.ts      buildSlots: dates/weekdays + hours -> slot times (DST-safe)
                         userModel.ts  validators for per-user data (settings, per-event prefs, groups)
                         userStore.ts  Firestore calls for users/{uid}/...
src/lib/state/           accounts.svelte.ts  Auth state + wrappers (created in the browser only)
                         userData.ts         debounced, de-duplicated writes of per-user data
                         session.ts          syncAccount(): applies saved settings on sign-in/out
                         theme / heatPalette / recent / groups / app  now save through userData
src/lib/server/events/load.ts   loadEvent(): dispatches to When2Meet or reads Firestore as a
                                signed-out visitor (for link previews), with a 10s deadline
src/lib/components/main/        RespondDialog.svelte, AvailabilityPicker.svelte, EventHeader (buttons)
src/lib/components/new/         DatePicker.svelte;  src/routes/new/+page.svelte  (create event)
src/lib/components/MyEvents.svelte   "Your events" on the landing page
firestore.rules / firestore.indexes.json / firebase.json
```

Request flow: `app.load(id)` -> `fetchEvent`: native IDs read Firestore through `accounts.loadEvent`;
When2Meet IDs still go through `/api/event/[id]`. `+page.server.ts` and `og.png` use `loadEvent`.

## Data model

```
events/{eventId}                  ownerId, title, weekly, slotSeconds, slots[], nextPersonId,
                                  responseCount, memberUids[], source, createdAt, updatedAt
events/{eventId}/responses/{key}  personId, name, uid|null, available[], updatedAt, salt?, nonce?, proof?
events/{eventId}/secrets/{key}    secret   (nobody can read it; only the rules)
users/{uid}                       theme, heat
users/{uid}/events/{eventId}      prefs{}, groups[], title, people, openedAt   (openedAt 0 = off the recent list)
```

- Native event IDs are 20-char Firestore auto-IDs (no hyphen); When2Meet's are `\d+-\w+`.
- `{key}` = `responseKey(name)` = `n:` + lowercase, whitespace-collapsed, URL-encoded name. The same
  name is the same person (When2Meet semantics). Imports use it too, with a `~<personId>` suffix if two
  people would collide.
- `memberUids` = owner + signed-in people who responded; powers the "your events" query (index in
  `firestore.indexes.json`). A signed-in responder's `uid` is stored on the response; entering a name no
  account has claimed (e.g. an imported person's) claims it.
- Weekly events use When2Meet's convention: 1970 timestamps whose UTC wall clock is the time.

## Passwords (the subtle part)

There is no server, so the rules enforce them. Rules can't see plaintext, and a hash in the public
response could be copied and replayed, so it's a challenge-response (`password.ts` explains it):

- `secrets/{key}.secret` = PBKDF2-SHA256(password, public salt), 100k rounds. Unreadable.
- The public response holds `salt` and `nonce`. Each change sends a new `nonce` and
  `proof = sha256hex(secret + '|' + currentNonce + '|' + newNonce)`. `firestore.rules` recomputes it with
  `hashing.sha256(...).toHexString()` using `get()` on the secret doc.
- A password can only be set when the entry is created. Not supported yet: changing/removing one, or
  adding one later. Owners can delete an entry, which is how forgotten passwords are handled.
- **Known wrinkle:** deleting an entry doesn't yet delete its secret doc, and a leftover secret blocks
  re-locking that name (the secret `create` rule can't overwrite). Owner delete should remove both.
- The proof string format must match between `password.ts` and `firestore.rules` exactly. A test
  (`store.submit.test.ts`) models the rule with an in-memory Firestore fake.

## Per-user data writes

`userData.queueEvent(eventId, fields)` batches changes (1.5s), skips values Firestore already holds,
drops writes if the signed-in user changed, flushes on page hide / event switch, and toasts once per
visit on failure. Event docs are written with `mergeFields` so maps like `roles` are replaced whole
(a plain merge would never delete a role). The Firestore rules for `users/**` are owner-only.

## How to run and check

```bash
npm run dev          # .claude/launch.json also has "dev" on port 5180
npm run check        # svelte-check: 0 errors expected
npm test             # 216 pass, 2 skipped (live When2Meet tests)
npm run build
npm run firebase:deploy   # pushes firestore.rules + indexes only (not hosting); or paste the rules
                          # into the console. After editing firestore.rules, REDEPLOY.
```

- **No Java on this machine, so the Firestore emulator can't run.** Rules are only verified by the user
  trying them live; there are no emulator-based rules tests. Adding them is a good next step (needs a JRE).
- A real When2Meet poll for manual checks: `38870872-X4Rvz` (from the repo's live-check workflow).
- To render native-event UI without Firestore, inject state from the browser console:
  `const { app } = await import('/src/lib/state/app.svelte.ts'); app.event = {... source: 'thentomeet' ...}`.
  Browser consoles can't import bare package names (`firebase/firestore`); import the app's own modules
  by `/src/...` path instead.

## Gotchas learned the hard way

- **The working copy is CRLF** (git `core.autocrlf=true`, index is LF). `npx prettier --write src`
  flips every file to LF and makes ~40 untouched files look modified. Format only files you changed.
  `git diff --name-only` shows the real changes; `git status` shows extra stat-noise entries.
- Scripts that match multi-line strings in existing files silently fail against CRLF. Use the Edit
  tool for those. Backslashes (`\s`, `\u...`) get mangled when passed through shell heredocs / node -e;
  write such code with the Write/Edit tools and re-read it.
- The Admin-SDK-free design relies on `import type` for types shared with client code; never import
  from `$lib/server/*` in client code.
- Server-rendered pages always render signed-out (Auth lives in the browser). Don't put per-user state
  in global singletons that SSR would share across requests.
- A signed-in user who chose the light theme sees a brief dark flash while settings load. Accepted.
- `.env` appeared (empty) during setup and now holds the user's real web config. Leave it alone.

## Not built yet (suggested order)

1. Owner controls: delete an event / entry (and its secret), change or remove a password.
2. Live updates with `onSnapshot` and fewer reads (each refresh currently costs 1 + N reads, once a
   minute per open tab).
3. One-time migration of old localStorage data into the account on first sign-in.
4. Emulator-backed rules tests (needs Java) for open responding, ownership and passwords.
5. Re-syncing an imported poll with its When2Meet original (imports are one-time snapshots today).
6. Mobile polish for the availability picker (touch painting is tap + sideways swipe; day/hour
   labels fill whole lines because vertical swipes scroll).

## Where else the context lives

- `README.md`: "Accounts and Firebase" section (data model, setup, creating events, passwords).
- Claude memory (project): `thentomeet-firebase-accounts.md`, `thentomeet-v2-direction.md`,
  `feedback-windows-line-endings.md`.
- Tests worth reading first: `src/lib/events/store.submit.test.ts` (join/edit/password flows),
  `model.test.ts` (import round-trip keeps analysis results identical), `userData.test.ts`.
