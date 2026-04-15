import { IGrid } from '../grid/IGrid';
import { IPathFinder } from '../grid/IPathFinder';
import { IEntityManager } from '../entity/IEntityManager';
import { Unit, UnitType } from '../entity/Entity';
import { ICombatResolver } from '../combat/ICombatResolver';
import { IAIController } from '../ai/IAIController';
import { IUI } from '../ui/IUI';
import { IEventBus } from '../events/IEventBus';
import { IRenderer } from '../renderer/IRenderer';
import { Cell, CellZone } from '../grid/Cell';

/**
 * Enumeration of high-level game states
 */
export enum GameState {
  MENU = 'menu',
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAME_OVER = 'game_over',
}

/**
 * Enumeration of turn sub-states within PLAYING
 */
export enum TurnState {
  PLACEMENT = 'placement',
  PLAYER_TURN = 'player_turn',
  ENEMY_TURN = 'enemy_turn',
}

/**
 * Options for constructing the Engine (dependency injection)
 */
export interface EngineOptions {
  grid: IGrid;
  pathFinder: IPathFinder;
  entityManager: IEntityManager;
  combatResolver: ICombatResolver;
  aiController: IAIController;
  ui: IUI;
  eventBus: IEventBus;
  renderer: IRenderer;
  workerCount?: number;
}

/**
 * Main game engine orchestrator
 */
export class Engine {
  private readonly grid: IGrid;
  private readonly pathFinder: IPathFinder;
  private readonly entityManager: IEntityManager;
  private readonly combatResolver: ICombatResolver;
  private readonly aiController: IAIController;
  private readonly ui: IUI;
  private readonly eventBus: IEventBus;
  private readonly renderer: IRenderer;
  private readonly workerCount: number;

  private workers: Worker[] = [];
  private isInitialized = false;
  private gameState: GameState = GameState.MENU;
  private turnState: TurnState = TurnState.PLACEMENT;
  private turnNumber = 1;
  private placedUnitThisTurn = false;
  private units: Unit[] = [];
  private cells: Cell[][] = [];
  private enemyHP = 10;
  private playerHP = 10;

  // Drag & drop tracking
  private drag = {
    active: false,
    unit: null as Unit | null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  };

  private lastFrameTime = 0;
  private readonly targetFPS = 60;

  constructor(options: EngineOptions) {
    this.grid = options.grid;
    this.pathFinder = options.pathFinder;
    this.entityManager = options.entityManager;
    this.combatResolver = options.combatResolver;
    this.aiController = options.aiController;
    this.ui = options.ui;
    this.eventBus = options.eventBus;
    this.renderer = options.renderer;
    this.workerCount = options.workerCount ?? Math.min(4, navigator.hardwareConcurrency || 4);

    this.registerEventHandlers();
  }

  /**
   * Bootstraps all modules and starts in MENU state
   */
  public async init(containerId: string = 'game-container'): Promise<void> {
    if (this.isInitialized) {
      console.warn('Engine already initialized');
      return;
    }

    // Initialize core modules
    await this.grid.initialize(containerId);
    this.pathFinder.initialize(this.grid);
    this.entityManager.initialize();
    this.combatResolver.initialize();
    this.aiController.initialize();
    this.ui.initialize(containerId, this.eventBus);
    this.renderer.initialize(containerId);

    // Show blank screen with Start button (renderer default)
    this.renderer.setStarted(false);
    this.renderer.renderFrame();

    // Prepare WebWorker pool (placeholder)
    this.setupWorkers();

    // Set initial game metrics
    this.resetGameState();

    // Build cell mapping and UI hooks
    this.buildCells();
    this.ui.attachMenuHandlers();
    this.ui.attachCanvasHandlers(
      this.handleMouseDown.bind(this),
      this.handleMouseMove.bind(this),
      this.handleMouseUp.bind(this)
    );

    this.isInitialized = true;
    this.eventBus.emit('engineReady');
  }

  /**
   * Register core event listeners
   */
  private registerEventHandlers(): void {
    this.eventBus.on('startGame', () => {
      this.renderer.setStarted(true);
      this.renderer.setTurn('Placement');
      this.startGameLoop();
    });
    this.eventBus.on('endTurn', () => this.onTurnEnd());
    this.eventBus.on('gameOver', () => this.onGameOver());
  }

  /**
   * Resets state variables for a new game
   */
  private resetGameState(): void {
    this.gameState = GameState.MENU;
    this.turnState = TurnState.PLACEMENT;
    this.turnNumber = 1;
    this.placedUnitThisTurn = false;
    this.units = [];
    this.enemyHP = 10;
    this.playerHP = 10;
  }

  /**
   * Spawns placeholder WebWorkers for heavy tasks
   */
  private setupWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      // const w = new Worker('path/to/worker.js');
      // this.workers.push(w);
      console.log(`Worker ${i + 1} ready`);
    }
  }

  /**
   * Constructs a 2D Cell array reflecting zones
   */
  private buildCells(): void {
    const rows = this.grid.getRows();
    const cols = this.grid.getColumns();
    const enemyZoneEnd = Math.floor(rows * 0.4);
    const combatZoneEnd = enemyZoneEnd + Math.floor(rows * 0.2);

    // Create a temporary array to hold cells
    const tempCells: (Cell | null)[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const element = this.grid.getCell(r, c);
        if (element) {
          const zone = r < enemyZoneEnd
            ? CellZone.ENEMY
            : r < combatZoneEnd
              ? CellZone.COMBAT
              : CellZone.PLAYER;
          element.setZone(zone);
          return element;
        }
        return null;
      })
    );

    // Filter out any null cells
    this.cells = tempCells.map(row => row.filter(cell => cell !== null)) as Cell[][];

    // Attach hover & click for HP demo and debug
    for (let r = 0; r < this.cells.length; r++) {
      for (let c = 0; c < this.cells[r].length; c++) {
        const cell = this.cells[r][c];
        if (cell) {
          const el = cell.getElement();
          el.addEventListener('mouseenter', () => cell.highlight(true));
          el.addEventListener('mouseleave', () => cell.highlight(false));
          el.addEventListener('click', () => this.onCellClick(cell));
        }
      }
    }
  }

  /**
   * Handle clicks on cells (for HP demo)
   */
  private onCellClick(cell: Cell): void {
    if (cell.getZone() === CellZone.ENEMY && this.enemyHP > 0) {
      this.enemyHP--;
      this.grid.updateHP(false, this.enemyHP);
    }
    if (cell.getZone() === CellZone.PLAYER && this.playerHP > 0) {
      this.playerHP--;
      this.grid.updateHP(true, this.playerHP);
    }
  }

  /**
   * Starts the 60 FPS game loop
   */
  private startGameLoop(): void {
    if (this.gameState !== GameState.PLAYING) {
      this.gameState = GameState.PLAYING;
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  /**
   * Core loop: input → update → render → next frame
   */
  private loop(now: number): void {
    if (this.gameState !== GameState.PLAYING) return;
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.ui.processInput();
    this.processTurnLogic(delta);
    this.renderer.renderFrame();

    requestAnimationFrame(this.loop.bind(this));
  }

  /**
   * Delegates per-turn updates based on state
   */
  private processTurnLogic(delta: number): void {
    if (this.turnState === TurnState.ENEMY_TURN) {
      this.aiController.takeTurn(this.entityManager.getEnemyUnits());
    }
    this.eventBus.emit('update', delta);
  }

  /**
   * Advances turn state when UI signals endTurn
   */
  private onTurnEnd(): void {
    if (this.turnState === TurnState.PLAYER_TURN) {
      this.turnState = TurnState.ENEMY_TURN;
    } else if (this.turnState === TurnState.ENEMY_TURN) {
      this.turnState = TurnState.PLAYER_TURN;
      this.turnNumber++;
      this.placedUnitThisTurn = false;
      this.eventBus.emit('turnStart', this.turnState);
    }
  }

  /**
   * Pauses loop and emits gameOver
   */
  private onGameOver(): void {
    this.gameState = GameState.GAME_OVER;
    this.eventBus.emit('shutdown');
  }

  /**
   * Mouse down begins drag for placement
   */
  private handleMouseDown(e: MouseEvent): void {
    if (this.gameState !== GameState.PLAYING || this.turnState !== TurnState.PLACEMENT) return;
    const { x, y } = this.ui.translateCanvasCoords(e);
    const cell = this.grid.getCellAtPosition(x, y);
    if (!cell || cell.getZone() !== CellZone.PLAYER) return;
    // If already placed, allow repositioning for the current turn
    if (this.placedUnitThisTurn) {
      // Only allow reposition if clicking on the placed unit
      const placed = this.units[this.units.length - 1];
      if (
        placed &&
        placed.gridX === cell.getRow() &&
        placed.gridY === cell.getCol() &&
        !placed.finalized
      ) {
        this.drag.active = true;
        this.drag.unit = placed;
        this.drag.startX = x;
        this.drag.startY = y;
        this.drag.currentX = x;
        this.drag.currentY = y;
        // Remove from array temporarily
        this.units.pop();
        return;
      } else {
        return; // Can't reposition other units or after finalize
      }
    }
    // Only allow placement on unoccupied cells
    if (this.units.some(u => u.gridX === cell.getRow() && u.gridY === cell.getCol())) return;
    this.drag.active = true;
    this.drag.unit = Unit.createUnit(
      this.units.length + 1,
      UnitType.WARRIOR,
      false,
      cell.getRow(),
      cell.getCol(),
      this.turnNumber
    );
    this.drag.startX = x;
    this.drag.startY = y;
    this.drag.currentX = x;
    this.drag.currentY = y;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.drag.active || !this.drag.unit) return;
    const { x, y } = this.ui.translateCanvasCoords(e);
    this.drag.currentX = x;
    this.drag.currentY = y;
    // Highlight cell under cursor if valid
    const cell = this.grid.getCellAtPosition(x, y);
    if (cell && cell.getZone() === CellZone.PLAYER && !this.units.some(u => u.gridX === cell.getRow() && u.gridY === cell.getCol())) {
      cell.highlight(true);
    }
    this.eventBus.emit('dragMove', { x, y, unit: this.drag.unit });
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.drag.active || !this.drag.unit) return;
    const { x, y } = this.ui.translateCanvasCoords(e);
    const cell = this.grid.getCellAtPosition(x, y);
    if (
      cell &&
      cell.getZone() === CellZone.PLAYER &&
      !this.units.some(u => u.gridX === cell.getRow() && u.gridY === cell.getCol())
    ) {
      const u = this.drag.unit;
      u.gridX = cell.getRow();
      u.gridY = cell.getCol();
      this.units.push(u);
      this.placedUnitThisTurn = true;
      // Mark as not finalized so can reposition this turn
      (u as any).finalized = false;
      this.eventBus.emit('unitPlaced', u);
    } else if (this.drag.unit) {
      // If invalid drop, and this was a reposition, put back
      if (!this.placedUnitThisTurn && this.drag.unit) {
        // Not yet placed, just drop
        this.drag.unit = null;
      } else if (this.placedUnitThisTurn && this.drag.unit) {
        // If was a reposition, put unit back to previous position
        this.units.push(this.drag.unit);
      }
    }
    this.drag.active = false;
    this.drag.unit = null;
  }

  /**
   * Cleanly stops workers and modules
   */
  public shutdown(): void {
    this.workers.forEach(w => w.terminate());
    this.eventBus.clearAll();
    this.grid.destroy();
    this.ui.destroy();
    this.renderer.destroy();
    this.entityManager.destroy();
    this.isInitialized = false;
  }
} 