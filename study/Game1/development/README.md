# 2D Turn-Based Strategy Game

A web-based 2D turn-based strategy game built with TypeScript.

## Project Structure

- `/src/core`: Core game engine logic
- `/src/entity`: Entity system (Entity, Component)
- `/src/grid`: Grid and pathfinding logic
- `/src/combat`: Combat resolution and dice mechanics
- `/src/ui`: User interface components
- `/src/ai`: AI controllers and behavior trees
- `/tests`: Unit tests for all modules

## Quick Start

Follow these steps to run the hello world application:

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm start
   ```

This will open the application in your default browser at `http://localhost:9000`.

## Project Structure

- `/src` - Source code
  - `/core` - Core engine components
  - `/ui` - User interface components
  - `/entity` - Entity component system
  - `/grid` - Grid system for game board
  - `/combat` - Combat resolution system
  - `/ai` - AI controllers and behavior

## Development

This project is set up with:
- TypeScript for type-safe code
- Webpack for bundling and development server
- Jest for unit testing

## Features

- Modular design with dependency injection
- Multi-threaded optimization for complex operations
- 60 FPS performance target
- Memory-efficient implementation with object pooling 