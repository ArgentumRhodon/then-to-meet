# ThenToMeet

A modern web application that helps groups find optimal meeting times by analyzing [When2Meet](https://www.when2meet.com) scheduling polls.

## Overview

ThenToMeet parses When2Meet URLs, extracts participant availability data, and provides an interactive interface to visualize and analyze time slots. Instead of manually scanning When2Meet grids, use ThenToMeet to quickly identify when specific participants are available and find meeting times that work for everyone.

## Features

- **When2Meet Integration** - Paste any When2Meet URL or meeting ID to load availability data
- **Interactive Time Grid** - Color-coded visualization showing participant overlap at each time slot
- **Participant Selection** - Choose specific participants to analyze their combined availability
- **Smart Meeting Suggestions** - Automatically finds continuous time blocks where all selected participants are free
- **Duration Filtering** - Filter suggestions by minimum and maximum meeting length (15-minute increments)
- **Visual Highlighting** - Hover over suggestions to see corresponding time slots highlighted on the grid
- **Meeting History** - Browser storage keeps track of recently loaded meetings for quick access
- **Responsive Design** - Works seamlessly on mobile and desktop devices

## Tech Stack

- **Framework**: [Svelte 4.2](https://svelte.dev/) + [SvelteKit 2.0](https://kit.svelte.dev/)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 3.4](https://tailwindcss.com/) + [Skeleton UI](https://www.skeleton.dev/)
- **Date/Time**: [Luxon 3.5](https://moment.github.io/luxon/)
- **Build Tool**: [Vite 5](https://vitejs.dev/)

## Getting Started

### Prerequisites

- Node.js 18+ and npm (or pnpm/yarn)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd then-to-meet
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

## Usage

1. **Load a Meeting**
   - Paste a When2Meet URL (e.g., `https://www.when2meet.com/?12345678`) or just the meeting ID (`12345678`)
   - Click "Load Meeting" to fetch availability data

2. **Select Participants**
   - Use the "People" panel to toggle individual participants on/off
   - Click "Toggle All" to quickly select or deselect everyone

3. **View Available Times**
   - The time grid shows color-coded availability (green = all selected available, red = none available)
   - Hover over cells to see which participants are available at that time

4. **Find Meeting Times**
   - The "Meetings" panel shows continuous time blocks where all selected participants are free
   - Adjust min/max duration filters to refine suggestions
   - Hover over a suggestion to highlight the corresponding time slots on the grid

5. **Access Recent Meetings**
   - Use the "Recent Meetings" dropdown to quickly reload previously viewed meetings

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Main application page
│   ├── +layout.svelte            # Root layout with AppShell
│   └── api/
│       └── w2m/+server.ts        # API proxy for When2Meet requests
├── lib/
│   ├── components/               # Reusable Svelte components
│   │   ├── LinkForm.svelte       # When2Meet URL input form
│   │   ├── LinkMemory.svelte     # Recent meetings dropdown
│   │   ├── PeopleList.svelte     # Participant selection interface
│   │   ├── TimeTable.svelte      # Interactive availability grid
│   │   ├── TimePrinter.svelte    # Meeting suggestions panel
│   │   ├── NoMeetingLoaded.svelte
│   │   └── ErrorCard.svelte
│   ├── parsers/                  # When2Meet data extraction
│   │   ├── getSlots.ts           # Parse time slot availability
│   │   └── getPeople.ts          # Parse participant information
│   ├── stores/                   # Svelte stores (state management)
│   │   ├── people.ts             # Participant list
│   │   ├── slots.ts              # Time slot data
│   │   ├── meetings.ts           # Computed meeting suggestions
│   │   ├── selectedPeople.ts     # User-selected participants
│   │   ├── hoveredMeeting.ts     # Currently hovered meeting
│   │   ├── info.ts               # Meeting metadata
│   │   └── linkMemory.ts         # Persistent meeting history
│   └── types.ts                  # TypeScript type definitions
├── app.html                      # HTML template
└── app.postcss                   # Global styles
```

## Development

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Start dev server and open in browser
npm run dev -- --open

# Build for production
npm run build

# Preview production build
npm run preview

# Format code with Prettier
npm run format

# Check code formatting
npm run check
```

### Architecture

- **State Management**: Svelte stores provide reactive state across components
- **Data Flow**: When2Meet HTML → Parsers → Stores → Components
- **API Proxy**: `/api/w2m` endpoint proxies requests to When2Meet (CORS workaround)
- **Persistence**: `svelte-persisted-store` syncs meeting history to localStorage

## Building

To create a production build:

```bash
npm run build
```

The build output will be in the `build/` directory. Preview it locally:

```bash
npm run preview
```

To deploy, install an appropriate [SvelteKit adapter](https://kit.svelte.dev/docs/adapters) for your target environment (Node.js, Vercel, Netlify, etc.).

## License

This project is open source and available for use.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
