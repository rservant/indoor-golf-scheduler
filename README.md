# Indoor Golf Scheduler

A scheduling system for indoor golf facilities that automates player scheduling, optimizes partner pairings, and manages multiple seasons. Available as a web app and a Tauri desktop application for macOS, Windows, and Linux.

## Features

- **Multi-Season Management** — Create and switch between separate golf seasons
- **Player Management** — Track handedness, time preferences (AM/PM/Either), and availability
- **Intelligent Scheduling** — Automated schedule generation with constraint satisfaction
- **Partner Optimization** — Minimize repeat pairings using historical tracking
- **Availability Tracking** — Per-week player availability management
- **Time Slot Balancing** — Balance morning/afternoon sessions using "Either" players
- **Foursome Prioritization** — Maximize complete groups of four
- **Data Import/Export** — Bulk player management, CSV export, and schedule sharing

## Quick Start

### Prerequisites
- Node.js 22+
- npm
- Rust (for desktop builds only)

### Installation

```bash
git clone <repository-url>
cd indoor-golf-scheduler
npm install
```

### Web App

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build
npm run preview
```

Open http://localhost:3000 in your browser.

### Desktop App (Tauri)

```bash
# Development
npm run tauri:dev

# Production build (creates platform-specific binary)
npm run tauri:build
```

## Testing

```bash
# Unit tests (572 tests across 73 suites)
npm test

# E2E tests (10 Playwright tests)
npm run test:e2e

# Coverage report
npm run test:coverage

# Type checking
npm run type-check
```

### Test Coverage
- **73 test suites** with 572 unit tests
- **10 Playwright e2e tests** covering full user workflows
- Property-based tests using fast-check for correctness validation
- Integration tests for end-to-end scheduling workflows

## Architecture

The TypeScript application follows a clean architecture pattern:

- **UI Layer** — Component-based UI modules (`src/ui/`)
- **Services** — Business logic for seasons, players, and scheduling (`src/services/`)
- **Models** — Data models and types (`src/models/`)
- **Repositories** — Data access layer with localStorage (`src/repositories/`)
- **Utilities** — Error handling, validation, and helpers (`src/utils/`)

### Key Components
| Component | Purpose |
|-----------|---------|
| `SeasonManager` | Season lifecycle and context switching |
| `PlayerManager` | Player data and availability |
| `ScheduleGenerator` | Constraint-satisfaction scheduling algorithm |
| `PairingHistoryTracker` | Tracks and optimizes player combinations |
| `ImportExportUI` | Bulk data management and CSV/PDF export |

## Project Structure

```
src/
├── models/           # Data models (Season, Player, Schedule)
├── repositories/     # Data access layer (localStorage)
├── services/         # Business logic services
├── ui/               # UI components and styles
├── routing/          # Application routing
├── state/            # Application state management
├── utils/            # Utilities and error handling
├── app.ts            # Main application class
└── index.ts          # Entry point
src-tauri/            # Tauri desktop app (Rust)
tests/
├── e2e/              # Playwright end-to-end tests
├── unit/             # Jest unit tests
└── property/         # fast-check property-based tests
```

## Scheduling Algorithm

The core algorithm uses constraint satisfaction with optimization:

**Constraints**: Time preferences (AM/PM), availability, uniqueness (one slot per player per week)

**Optimization**: Complete foursomes → time balance → partner variety → fair distribution

**Steps**: Filter available players → separate by preference → balance with "Either" players → form foursomes → optimize pairings using history → validate constraints

## Configuration

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript — strict mode, ES2020 target |
| `vite.config.ts` | Vite — dev server on port 3000, build output |
| `jest.config.ts` | Jest — jsdom environment, ts-jest transform |
| `playwright.config.ts` | Playwright — Chromium e2e tests |
| `src-tauri/tauri.conf.json` | Tauri — window config, icon paths, build commands |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`npm test && npm run test:e2e`)
5. Open a Pull Request

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Built with TypeScript, Vite, Tauri, Jest, Playwright, and fast-check.**