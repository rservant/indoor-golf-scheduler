# Indoor Golf Scheduler

A comprehensive digital scheduling system for indoor golf facilities that automates player scheduling, optimizes partner pairings, and manages multiple seasons with intelligent constraint satisfaction.

## 🏌️ Features

### Core Functionality
- **Multi-Season Management**: Create and manage multiple golf seasons with separate player rosters
- **Player Management**: Track player preferences (AM/PM/Either), handedness, and availability
- **Intelligent Scheduling**: Automated schedule generation with constraint satisfaction
- **Partner Optimization**: Minimize repeat pairings while ensuring fair distribution
- **Manual Editing**: Drag-and-drop schedule editing with constraint validation
- **Export Capabilities**: Export schedules in PDF, Excel, and CSV formats

### Advanced Features
- **Time Slot Balancing**: Automatically balance morning and afternoon sessions
- **Foursome Prioritization**: Maximize complete groups of four players
- **Availability Tracking**: Per-week player availability management
- **Pairing History**: Track and optimize player combinations across weeks
- **Data Import/Export**: Bulk player management and schedule sharing

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd indoor-golf-scheduler

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Running the Application

#### Option 1: Production Build (Recommended)
```bash
# Build and start the application
npm run build
npm run serve

# Or use the combined command:
npm start
```

Then open http://localhost:3000 in your web browser.

#### Option 2: Development Mode
```bash
# Start development server with hot reload
npm run dev
```

#### Option 3: Development with Node.js Server
```bash
# Build and run with Node.js server
npm run dev:server
```

#### Option 3: Programmatic Usage
```typescript
import { initializeGolfScheduler } from './src/index';

// Initialize the application
const app = await initializeGolfScheduler('your-container-id');

// Access services
const services = app.getServices();
const seasonManager = services.seasonManager;
const playerManager = services.playerManager;
```

## 📖 Usage Guide

### 1. Season Management
```typescript
// Create a new season
const season = await seasonManager.createSeason(
  'Spring 2024',
  new Date('2024-03-01'),
  new Date('2024-05-31')
);

// Set as active season
await seasonManager.setActiveSeason(season.id);
```

### 2. Player Management
```typescript
// Add players
await playerManager.addPlayer({
  firstName: 'John',
  lastName: 'Smith',
  handedness: 'right',
  timePreference: 'AM'
});

// Set weekly availability
await playerManager.setPlayerAvailability(playerId, weekId, true);
```

### 3. Schedule Generation
```typescript
// Generate optimized schedule
const schedule = await scheduleGenerator.generateSchedule(weekId, availablePlayers);

// The algorithm automatically:
// - Respects time preferences (AM/PM/Either)
// - Balances time slots using "Either" preference players
// - Minimizes repeat pairings from previous weeks
// - Prioritizes complete foursomes
```

### 4. Export Schedules
```typescript
// Export in various formats
await exportService.exportToPDF(schedule, 'week-1-schedule.pdf');
await exportService.exportToExcel(schedule, 'week-1-schedule.xlsx');
await exportService.exportToCSV(schedule, 'week-1-schedule.csv');
```

## 🏗️ Architecture

The TypeScript application follows a clean architecture pattern with clear separation of concerns:

### Layers
- **Presentation Layer**: Modern web-based UI with TypeScript and responsive design
- **Business Logic Layer**: TypeScript services for season, player, and schedule management
- **Data Access Layer**: Repository pattern with localStorage and future database support
- **External Interfaces**: Export functionality and data import capabilities

### Key Components
- **SeasonManager**: Handles season lifecycle and context switching
- **PlayerManager**: Manages player data and availability
- **ScheduleGenerator**: Core scheduling algorithm with optimization
- **PairingHistoryTracker**: Tracks and optimizes player combinations
- **ExportService**: Multi-format schedule export functionality

## 🧪 Testing

The project includes comprehensive testing with both unit tests and property-based tests:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Coverage
- **72 tests** across 13 test suites
- **Property-based tests** using fast-check for correctness validation
- **Unit tests** for specific functionality and edge cases
- **Integration tests** for end-to-end workflows

### Correctness Properties
The system validates 13 key correctness properties:
1. Season data round trip integrity
2. Active season context isolation
3. Player data integrity across operations
4. Graceful player removal handling
5. Schedule completeness and uniqueness
6. Time preference respect
7. Foursome prioritization
8. Either preference balancing
9. Availability filtering accuracy
10. Pairing history tracking
11. Pairing optimization effectiveness
12. Manual edit validation
13. Export data accuracy

## 📁 Project Structure

```
src/
├── models/           # Data models (Season, Player, Schedule, etc.)
├── repositories/     # Data access layer with local storage
├── services/         # Business logic services
├── ui/              # User interface components
├── routing/         # Application routing
├── state/           # Application state management
├── utils/           # Utility functions and error handling
├── app.ts           # Main application class
└── index.ts         # Entry point and exports
```

## 🔧 Configuration

### Jest Configuration
The project uses Jest for testing with TypeScript support:
- Property-based testing with fast-check
- Coverage reporting
- DOM testing environment for UI components

### TypeScript Configuration
- Strict type checking enabled
- ES2020 target with modern features
- Comprehensive type definitions

## 📊 Scheduling Algorithm

The core scheduling algorithm uses constraint satisfaction with optimization:

### Constraints
1. **Time Preferences**: AM/PM players only in preferred slots
2. **Availability**: Only available players in schedules
3. **Uniqueness**: Each player in exactly one foursome per week

### Optimization Goals
1. **Complete Foursomes**: Maximize groups of 4 players
2. **Time Balance**: Even distribution across AM/PM slots
3. **Partner Variety**: Minimize repeat pairings
4. **Fair Distribution**: Equitable repeat pairing distribution

### Algorithm Steps
1. Filter available players by weekly availability
2. Separate players by time preferences (AM/PM/Either)
3. Use "Either" players to balance time slots
4. Form foursomes prioritizing complete groups
5. Optimize partner pairings using historical data
6. Validate all constraints are satisfied

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features (both unit and property-based)
- Maintain clean architecture separation
- Update documentation for API changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For questions, issues, or feature requests:
1. Check the [Issues](../../issues) page
2. Review the [Requirements](.kiro/specs/indoor-golf-scheduler/requirements.md) and [Design](.kiro/specs/indoor-golf-scheduler/design.md) documents
3. Create a new issue with detailed information

## 🎯 Roadmap

- [ ] Database backend integration
- [ ] Multi-facility support
- [ ] Mobile application
- [ ] Advanced reporting and analytics
- [ ] Email notifications
- [ ] Tournament scheduling
- [ ] Handicap tracking integration

---

**Built with TypeScript, Jest, and fast-check for reliable, well-tested golf scheduling.**