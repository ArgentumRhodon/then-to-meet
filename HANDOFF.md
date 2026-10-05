# Handoff: ThenToMeet accounts and Firebase (branch `v2.0-users`)

Updated 2026-10-04. Rounds one and two (accounts, imports, live updates, owner controls, password
change/removal, the emulator rules tests) are committed. The latest round, uncommitted, is: the
availability picker's touch mode and sticky headers, **Update from When2Meet**, **Transfer
ownership**, stale recents, **abuse limits** and **lower read costs**.

> **`firestore.rules` changed again and must be redeployed together with the new client**
> (`npm run firebase:deploy`, or paste it into the console). Joining an event is now one write that
> bumps the event's counters and names the new response in a `lastJoin` field; the new client sends
> that, and the old rules refuse it (and the new rules refuse an old client's join). Deploy both at
> once. Details under "Abuse limits".

## What this work is

ThenToMeet used to only read When2Meet polls. It now also has events of its own, backed by Firebase
Auth + Firestore, **without ever breaking the When2Meet path**.

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
   Firestore. Signed-out visitors keep state in memory for the visit only. No `localStorage`, except
   that the first sign-in on a browser moves any older saved data into the account and clears it.
6. Look and feel decisions from earlier work are in the memory file `thentomeet-v2-direction.md`
   (dark default, rocket palette, heatmap always dark, etc.). Keep new UI consistent with them.
7. The user approved installing a portable JDK (see "How to run") so the emulator can run here.

## Architecture map

```
src/lib/firebase/        config.ts (public env, accountsEnabled), client.ts (browser Auth + Firestore,
                         emulator switch), user.ts (SessionUser type)
src/lib/events/          model.ts      Firestore doc types, toEvent (docs -> W2MEvent), importDocs,
                                       parseNewEvent/parseName/parseResponse/parsePassword, errors
                         id.ts         native vs When2Meet ID helpers
                         store.ts      create / import / submitResponse / list / load / watchNativeEvent
                         manage.ts     owner controls (deleteEvent, deleteEntry) and changePassword /
                                       removePassword
                         password.ts   PBKDF2 secret + nonce/proof (see "Passwords")
                         slots.ts      buildSlots: dates/weekdays + hours -> slot times (DST-safe)
                         userModel.ts  validators for per-user data (settings, per-event prefs, groups)
                         userStore.ts  Firestore calls for users/{uid}/...
                         legacy.ts     reads what older versions kept in localStorage
src/lib/state/           accounts.svelte.ts  Auth state + wrappers (created in the browser only)
                         userData.ts         debounced, de-duplicated writes of per-user data; every
                                             load waits on sign-in AND on the legacy migration
                         migrate.ts          one-time localStorage -> account move
                         session.ts          syncAccount(): applies saved settings on sign-in/out
                         app.svelte.ts       also follows native events live (#startWatching/#onLive)
                         theme / heatPalette / recent / groups  save through userData
src/lib/server/events/load.ts   loadEvent(): dispatches to When2Meet or reads Firestore as a
                                signed-out visitor (for link previews), with a 10s deadline
src/lib/components/main/        RespondDialog (name, password, times ONLY), AvailabilityPicker,
                                EventHeader, ManageMenu (owner-only: delete event), PasswordDialog
src/lib/components/sidebar/SelectionManage.svelte  the "Manage" section of the selection card:
                                Remove… (owner) and Password… (one locked person)
src/lib/ui/ConfirmDialog.svelte generic confirm for destructive actions
src/lib/components/new/         DatePicker.svelte;  src/routes/new/+page.svelte  (create event)
firestore.rules / firestore.indexes.json / firebase.json
rules-tests/                    emulator tests (see "How to run"); vitest.rules.config.ts
```

Request flow: `app.load(id)` -> `fetchEvent`: native IDs read Firestore through `accounts.loadEvent`;
When2Meet IDs still go through `/api/event/[id]`. `+page.server.ts` and `og.png` use `loadEvent`.
After a native event loads, `app.#startWatching` subscribes (`watchNativeEvent`: the event doc plus its
responses collection, coalesced per microtask). `#onLive` ignores snapshots whose content didn't
change (`sameContent`), applies real ones through the same `#apply` the manual refresh uses (so
pins, "new responses" markers and recents behave identically), and toasts what changed, except the
browser's own saves (`noteOwn`). If the listener errors, `live` goes false and the header's
one-minute polling takes over; a deleted event sets "This event was deleted."

## Data model

```
events/{eventId}                  ownerId, title, weekly, slotSeconds, slots[], nextPersonId,
                                  responseCount, memberUids[], source, createdAt, updatedAt,
                                  lastJoin? (response key of the last joiner; see "Abuse limits")
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
- `W2MEvent.ownerId` (native only) lets the UI show owner controls (`accounts.owns(event)`).

## Passwords (the subtle part)

There is no server, so the rules enforce them. Rules can't see plaintext, and a hash in the public
response could be copied and replayed, so it's a challenge-response (`password.ts` explains it):

- `secrets/{key}.secret` = PBKDF2-SHA256(password, public salt), 100k rounds. Unreadable.
- The public response holds `salt` and `nonce`. Each change sends a new `nonce` and
  `proof = sha256hex(secret + '|' + currentNonce + '|' + newNonce)`. `firestore.rules` recomputes it with
  `hashing.sha256(...).toHexString().lower()` using `get()` on the secret doc.
  **`toHexString()` returns UPPERCASE in the rules engine**, hence `.lower()`. This was a real bug.
- **Change:** one transaction updates the response (new salt, new nonce, proof from the OLD secret) and
  the secret (new value). The rules allow a salt change only with a valid proof AND a changed secret in
  the same write, and the secrets `update` rule independently requires a salt change plus that proof.
- **Remove:** the response drops `salt`/`nonce` and keeps `proof = H(secret|nonce|'remove')`; the secret
  is deleted in the same write (the secrets `delete` rule checks that proof). An entry without a
  password can never be given one later (otherwise anyone could lock a person out).
- Owners can delete an entry together with its secret (`deleteEntry` does both), which frees the name.
- UI: **Password…** (selection card, one locked person selected) opens `PasswordDialog`; it takes the
  current password and either a new one or "remove".
- The proof format must match between `password.ts` and the rules exactly. `rules-tests/` proves it.

## Per-user data writes

`userData.queueEvent(eventId, fields)` batches changes (1.5s), skips values Firestore already holds,
drops writes if the signed-in user changed, flushes on page hide / event switch, and toasts once per
visit on failure. Event docs are written with `mergeFields` so maps like `roles` are replaced whole
(a plain merge would never delete a role). Every `userData.load*` first awaits `signedInUid()`, which
runs `migrateLegacy(uid)` once per account: reading `ttm:*` / `linkMemory` keys (`legacy.ts`), saving
only fields the account lacks (`onlyNew`), then clearing those keys, and keeping them if any save
failed. The gate matters: a default saved before the migration would overwrite migrated data.

## How to run and check

```bash
npm run dev          # .claude/launch.json also has "dev" on port 5180
npm run check        # svelte-check: 0 errors expected
npm test             # 283 pass, 2 skipped (live When2Meet tests)
npm run test:rules   # 99 emulator tests (needs Java on PATH; see below)
npm run build
npm run firebase:deploy   # pushes firestore.rules + indexes only (not hosting); or paste the rules
                          # into the console. After editing firestore.rules, REDEPLOY.
```

- **Java for the emulator** is a portable Microsoft OpenJDK 21 at `C:\Users\ritlu\.jdk\jdk-21.0.12.1+1`
  (outside OneDrive; not on PATH). To run the rules tests from PowerShell:
  `$env:PATH = "C:\Users\ritlu\.jdk\jdk-21.0.12.1+1\bin;" + $env:PATH; npm run test:rules`.
  First run downloads `firebase-tools` (npx) and the Firestore emulator jar. CI has a `rules` job
  (`actions/setup-java`, Temurin 21).
- `rules-tests/` use the real modular SDK against the Auth + Firestore emulators with `firestore.rules`
  from `firebase.json`; each "client" is a separate Firebase app (anonymous sign-in, or none). Hand-made
  attack writes sit next to tests that drive the real store code, so a denial is trustworthy only because
  the matching legitimate write is asserted to succeed. **When a rule test "passes" by being denied,
  make sure the positive twin passes first.** `firestore-debug.log` is written to the repo root
  (gitignored) and is useful: it shows which rule line errored.
- `debug()` output from rules did not show up in the emulator log; bisect by editing the rule instead
  (restore with `git checkout firestore.rules`, but only if there are no unsaved real changes).
- A real When2Meet poll for manual checks: `38870872-X4Rvz` (from the repo's live-check workflow).
- To render native-event UI without Firestore, inject state from the browser console:
  `const { app } = await import('/src/lib/state/app.svelte.ts'); app.event = {... source: 'thentomeet' ...}`
  (and `accounts.user = {...}` for owner UI; the Firebase auth listener may reset it, so set it after
  the page settles). Browser consoles can't import bare package names; import the app's own modules by
  `/src/...` path. **Restart the dev server after editing a module you import this way**: Vite tags
  edited modules with `?t=...`, so your console import gets a different instance than the page.

## UI placement rule (the user's "single purpose" rule)

Controls live with what they act on. Actions on people go in the selection card's Manage section
(`SelectionManage.svelte`); event-level admin goes in the owner-only header `ManageMenu`; the
Add-your-times dialog is only for your own name, password and times. The user rejected admin controls
inside that dialog. Apply this to every new control (see memory `feedback-single-purpose-ui`).

## Gotchas learned the hard way

- **The working copy is CRLF** (git `core.autocrlf=true`, index is LF). `npx prettier --write src`
  flips every file to LF and makes ~40 untouched files look modified. Format only files you changed.
  `git diff --name-only` shows the real changes; `git status` may show extra stat-noise entries.
- Scripts that match multi-line strings in existing files silently fail against CRLF. Use the Edit
  tool for those. Backslashes (`\s`, `\u...`) and apostrophes get mangled when passed through shell
  heredocs / `node -e`; write such scripts with the Write tool into the scratchpad, then run them.
- Never import from `$lib/server/*` in client code (use `import type` only where needed).
- Server-rendered pages always render signed-out (Auth lives in the browser). Don't put per-user state
  in global singletons that SSR would share across requests.
- A signed-in user who chose the light theme sees a brief dark flash while settings load. Accepted.
- `src/lib/server/og/heatmapImage.test.ts` ("fits long days...") can time out (5s) when the machine is
  busy (e.g. while the emulator runs). It passes when rerun alone. Not related to this work.
- `.env` holds the user's real web config. Leave it alone.

## Not built yet (suggested order)

Done since the last handoff: the picker's touch mode (tap marks on release; "Drag to paint" toggle) and sticky headers (the grid scrolls inside its own box),
**Update from When2Meet** (`planResync` in `model.ts`, `resyncWhen2Meet` in `manage.ts`, owner menu),
**Transfer ownership** (`transferOwnership`, `TransferDialog`; needs no rules change: owners can already
update their event), and stale recents (an event found missing is dropped from the account's recent
list when it's opened, when it's deleted while open, and, for ThenToMeet IDs, on sign-in via
`findMissingEvents`). Tests: `syncTransfer.test.ts` (rules), `planResync` in `model.test.ts`,
`recent.test.ts`, and the new cases in `app.live.test.ts`.

1. Co-owners (transfer is one owner at a time); adding a password to an existing entry (deliberately
   disallowed). A transfer only checks in the client that the new owner responded; the rules would let
   an owner write any `ownerId`, which is within the "not particularly tight" stance.
2. Re-sync never removes people who left the poll, and a poll whose slot length or weekly/dated kind
   changed is refused. It only adds the poll's new times.
3. Per-account limits (how many events someone can create, how much a user document can hold) can't be
   enforced without a server; the limits below are per event.

## Abuse limits and read costs

- `firestore.rules`: a new event's fields are checked for type and size (`validNewEvent`). An event holds
  at most 500 people (`MAX_RESPONSES` in `model.ts`, the literal 500 in the rules) unless its owner adds more.
- **Joining is atomic.** A non-owner's new response must have `personId == event.nextPersonId`, the event
  update in the same write must move `nextPersonId` and `responseCount` up by exactly one, and its
  `lastJoin` must be that response's key (`joins()` / `joinsWithResponse()`). So counters can't move
  without a response, a batch can't add several responses for one bump (each key must equal the single
  `lastJoin`), and the cap can't be dodged or lowered by a visitor. The owner is exempt (imports,
  resync, adding people past the cap). Edits only touch `updatedAt`.
- **Concurrent joins**: the loser of a race holds a stale `nextPersonId`, which the rules refuse as a
  permission error rather than a retry; `submitResponse` retries a refused join a few times
  (`JOIN_RETRIES`). Password failures (`locked`) are not retried.
- The client says "This event is full" before asking the rules (`InvalidInput`).
- **Rules tests**: hand-written writes that used to create a response alone now go through
  `joinBatch` in `rules-tests/helpers.ts`, so a denial is for the reason the test names. Keep using it.
- **Reads**: a native event opens by following it (`#openNative` in `app.svelte.ts`): the listener's
  first snapshot is the load, so a visit costs one read per response instead of two. If the listener
  can't start or stalls (15s), it falls back to a plain read and polling. `watchNativeEvent` ignores
  cache-only first snapshots. `refresh()` is a no-op while live. A copy handed over by the server (first
  page load) is followed afterwards. The server caches ThenToMeet reads for 30s
  (`server/events/load.ts`) so a page and its preview image share one read; the page itself asks to
  re-read (`reread`) so someone who just saved doesn't get an older copy.
- Still true: a load reads every response, and the cap is what bounds that (500 reads).

## Where else the context lives

- `README.md`: "Accounts and Firebase" section (data model, setup, creating events, passwords, owner
  controls) and "Checks" (rules tests).
- Claude memory (project): `thentomeet-firebase-accounts.md`, `thentomeet-v2-direction.md`,
  `feedback-windows-line-endings.md`.
- Tests worth reading first: `rules-tests/passwords.test.ts` and `manage.test.ts` (attacks and the
  change/removal flows), `src/lib/events/store.submit.test.ts` (join/edit/password flows against a
  fake), `src/lib/state/app.live.test.ts` (live updates), `migrate.test.ts`, `userData.test.ts`.
