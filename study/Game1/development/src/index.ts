import { Engine } from './core/Engine';
import { Grid } from './grid/Grid';
import { PathFinder } from './grid/PathFinder';
import { EntityManager } from './entity/EntityManager';
import { CombatResolver } from './combat/CombatResolver';
import { AIController } from './ai/AIController';
import { UserInterface } from './ui/UserInterface';
import { EventBus } from './events/EventBus';
import { Renderer } from './renderer/Renderer';

// Entry point for the application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Game initializing');
  
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('Game container not found');
    return;
  }
  
  // Create the canvas
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  canvas.id = 'game-canvas';
  container.appendChild(canvas);
  
  // Create start game button
  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start Game';
  startBtn.id = 'start-game';
  container.appendChild(startBtn);
  
  // Initialize game components
  const grid = new Grid('game-container');
  const pathFinder = new PathFinder();
  const entityManager = new EntityManager();
  const combatResolver = new CombatResolver();
  const aiController = new AIController();
  const ui = new UserInterface();
  const eventBus = new EventBus();
  const renderer = new Renderer();
  
  // Create engine with all dependencies
  const options = {
    grid,
    pathFinder,
    entityManager,
    combatResolver,
    aiController,
    ui,
    eventBus,
    renderer,
    containerId: 'game-container'
  };
  
  const engine = new Engine(options);
  
  // Add event listener to start game button
  startBtn.addEventListener('click', async () => {
    try {
      await engine.init();
      console.log('Game started');
    } catch (error) {
      console.error('Failed to start game:', error);
    }
  });
}); 