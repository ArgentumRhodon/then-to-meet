# ThenToMeet

A modern web application that helps groups find optimal meeting times by analyzing When2Meet scheduling polls.

## Purpose

The app parses When2Meet URLs, extracts participant availability data, and provides an interactive interface to:
- Visualize availability across multiple days in a color-coded time grid
- Select specific participants to find overlapping free time slots
- Filter meeting suggestions by customizable duration (15-min increments)
- Store recently used meeting links for quick access

## Tech Stack

- **Frontend**: Svelte 4.2 + SvelteKit 2.0 with TypeScript
- **Styling**: Tailwind CSS + Skeleton UI component library
- **Utilities**: Luxon (date/time), svelte-persisted-store (browser storage)
- **Build**: Vite 5

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Main landing page
│   └── api/w2m/+server.ts        # Proxy endpoint for When2Meet
├── lib/
│   ├── components/               # UI components (LinkForm, TimeTable, etc.)
│   ├── parsers/                  # When2Meet HTML parsers
│   ├── stores/                   # Reactive state management
│   └── types.ts                  # TypeScript interfaces
```

## Key Features

1. **When2Meet Integration** - Parses URLs/IDs to extract availability
2. **Interactive Time Grid** - Color-coded visualization with hover states
3. **Participant Management** - Toggle individual/all participants
4. **Smart Suggestions** - Finds continuous time blocks with duration filters
5. **Browser Persistence** - Stores meeting history in localStorage
6. **Responsive Design** - Mobile and desktop layouts

## Development

Once you've installed dependencies with `npm install`, start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.
