# 2D Turn-based Strategy Game

![Game Version](https://img.shields.io/badge/version-0.0.4-blue)

A 2D turn-based strategy game built with vanilla JavaScript using modern ES modules and a modular architecture. The game features a grid-based combat system, unit placement, and AI opponents.

## Features

- Modular game engine architecture
- Grid-based movement and combat
- Turn-based gameplay (placement phase, player turn, enemy turn)
- Unit management with different unit types
- Simple AI for enemy units
- Responsive canvas rendering
- Unit testing infrastructure

## Project Structure

```
├── development/             # Development environment
│   ├── js/                  # JavaScript source files
│   │   ├── core/            # Core game engine
│   │   ├── config/          # Game configuration and constants
│   │   ├── mechanics/       # Game mechanics (units, movement)
│   │   ├── systems/         # Game systems (rendering, combat, AI)
│   │   ├── ui/              # UI components and rendering
│   │   ├── utils/           # Utility functions and helpers
│   │   ├── tests/           # Unit tests
│   │   └── main.js          # Main entry point
│   ├── css/                 # Styles
│   ├── index.html           # Main game HTML
│   └── tests.html           # Test runner HTML
├── setup.js                 # Project setup script
├── package.json             # Project configuration
└── README.md                # This file
```

## Getting Started

### Prerequisites

- Node.js (v14+)
- Modern web browser (Chrome, Firefox, Edge)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/2d-strategy-game.git
cd 2d-strategy-game
```

2. Run the setup script:
```bash
node setup.js
```

3. Start the development server:
```bash
npm start
```

### Development

- Run the development server: `npm start`
- Run tests: `npm test`
- Lint code: `npm run lint`
- Format code: `npm run format`

## Game Controls

- **Start Game**: Click the "Start" button on the main menu
- **Place Units**: During the placement phase, click a unit button and then click on a valid grid position
- **Move Units**: During your turn, click and drag units to move them
- **End Turn**: Click the "Ready" button to end your turn
- **Combat**: Units automatically attack when adjacent to enemy units

## Testing

The game includes a unit testing framework with a browser-based test runner. To run tests:

1. Start the test server: `npm test`
2. Open the test page in your browser
3. Click on the test buttons to run individual test suites or all tests

## Architecture

The game is built using a modular architecture with the following key components:

- **GameEngine**: Central coordinator for all game systems
- **UnitManager**: Handles unit creation, tracking, and status
- **RenderSystem**: Handles rendering the game state to the canvas
- **CombatSystem**: Handles combat calculations and animations
- **AISystem**: Controls enemy unit behavior
- **MovementSystem**: Handles unit movement and path calculations
- **UIManager**: Manages UI elements and their rendering
- **GridSystem**: Manages the game grid and position calculations

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by classic turn-based strategy games
- Thanks to all contributors and testers 
