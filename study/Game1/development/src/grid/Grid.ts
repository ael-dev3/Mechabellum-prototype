/**
 * Grid System for the game board
 * Implements a rectangular, vertically elongated grid with three distinct zones
 */
import { Cell, CellZone } from './Cell';
import { IGrid } from './IGrid';

export class Grid implements IGrid {
  /**
   * Returns the width of a single cell in pixels
   */
  public getCellWidth(): number {
    // Assume gridElement is the canvas or grid container
    return this.gridElement.offsetWidth / this.columns;
  }

  /**
   * Returns the height of a single cell in pixels
   */
  public getCellHeight(): number {
    return this.gridElement.offsetHeight / this.rows;
  }

  /**
   * Returns the cell at a given canvas (pixel) position, or null if out of bounds
   */
  public getCellAtPosition(x: number, y: number): Cell | null {
    const cellWidth = this.getCellWidth();
    const cellHeight = this.getCellHeight();
    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);
    if (
      row < 0 || row >= this.rows ||
      col < 0 || col >= this.columns
    ) {
      return null;
    }
    return this.cells[row][col];
  }
  private container: HTMLElement;
  private gridElement: HTMLElement;
  private gridContainer: HTMLElement;
  private cells: Cell[][] = [];
  private rows: number;
  private columns: number;
  private cellSize: number = 30; // Increased from 25px to 30px
  private enemyHP: number = 10;
  private playerHP: number = 10;
  private enemyHPDisplay: HTMLElement | null = null;
  private playerHPDisplay: HTMLElement | null = null;
  
  /**
   * Creates a new Grid
   * @param containerId - The ID of the container element to place the grid in
   */
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    
    if (!container) {
      throw new Error(`Container element with ID "${containerId}" not found`);
    }
    
    this.container = container;
    
    // Create grid container
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'grid-container';
    this.gridContainer.style.position = 'relative';
    
    // Create main wrapper
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    
    // Create white border container with embedded HP displays
    const borderContainer = document.createElement('div');
    borderContainer.style.position = 'relative';
    borderContainer.style.backgroundColor = 'white';
    borderContainer.style.borderRadius = '20px';
    borderContainer.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 10px rgba(255, 255, 255, 0.2)';
    
    // Add padding with space for the HP displays
    borderContainer.style.paddingTop = '19px';
    borderContainer.style.paddingBottom = '19px';
    borderContainer.style.paddingLeft = '15px';
    borderContainer.style.paddingRight = '15px';
    
    // Create grid element
    this.gridElement = document.createElement('div');
    this.gridElement.className = 'game-grid';
    
    // Calculate grid dimensions
    const containerHeight = window.innerHeight * 0.88;
    const containerWidth = window.innerWidth * 0.45;
    
    // Ensure 2:1 height-to-width ratio
    const adjustedWidth = Math.min(containerWidth, containerHeight / 2);
    const adjustedHeight = adjustedWidth * 2;
    
    // Calculate rows and columns based on cell size
    this.rows = Math.floor(adjustedHeight / this.cellSize);
    this.columns = Math.floor(adjustedWidth / this.cellSize);
    
    // Increase grid spaces by 25% in each direction
    this.rows = Math.floor(this.rows * 1.25);
    this.columns = Math.floor(this.columns * 1.25);
    
    // Decrease vertical grid spaces by 15%
    this.rows = Math.floor(this.rows * 0.89);
    
    // Ensure the grid has an even number of rows for zone division
    if (this.rows % 10 !== 0) {
      this.rows = Math.floor(this.rows / 10) * 10;
    }
    
    // Apply grid styling
    this.gridElement.style.width = `${this.columns * this.cellSize}px`;
    this.gridElement.style.height = `${this.rows * this.cellSize}px`;
    this.gridElement.style.display = 'grid';
    this.gridElement.style.gridTemplateRows = `repeat(${this.rows}, ${this.cellSize}px)`;
    this.gridElement.style.gridTemplateColumns = `repeat(${this.columns}, ${this.cellSize}px)`;
    this.gridElement.style.backgroundColor = '#222';
    this.gridElement.style.borderRadius = '12px';
    this.gridElement.style.overflow = 'hidden';
    
    // Add the grid to the container
    this.gridContainer.appendChild(this.gridElement);
    borderContainer.appendChild(this.gridContainer);
    wrapper.appendChild(borderContainer);
    
    // Create HP displays embedded in the white border itself
    this.createHPDisplays(borderContainer);
    
    container.innerHTML = ''; // Clear container
    container.appendChild(wrapper);
    
    // Initialize grid cells
    this.initializeCells();
  }
  
  /**
   * Creates HP displays embedded in the white border itself
   */
  private createHPDisplays(borderContainer: HTMLElement): void {
    // Enemy HP text directly in the border (top)
    this.enemyHPDisplay = document.createElement('div');
    this.enemyHPDisplay.className = 'enemy-hp-display';
    this.enemyHPDisplay.textContent = `Enemy: ${this.enemyHP}/10 HP`;
    this.enemyHPDisplay.style.position = 'absolute';
    this.enemyHPDisplay.style.top = '0';
    this.enemyHPDisplay.style.left = '20px';
    this.enemyHPDisplay.style.color = 'black';
    this.enemyHPDisplay.style.fontSize = '18px';
    this.enemyHPDisplay.style.fontWeight = 'bold';
    this.enemyHPDisplay.style.lineHeight = '19px';
    borderContainer.appendChild(this.enemyHPDisplay);
    
    // Player HP text directly in the border (bottom)
    this.playerHPDisplay = document.createElement('div');
    this.playerHPDisplay.className = 'player-hp-display';
    this.playerHPDisplay.textContent = `Player: ${this.playerHP}/10 HP`;
    this.playerHPDisplay.style.position = 'absolute';
    this.playerHPDisplay.style.bottom = '0';
    this.playerHPDisplay.style.right = '20px';
    this.playerHPDisplay.style.color = 'black';
    this.playerHPDisplay.style.fontSize = '18px';
    this.playerHPDisplay.style.fontWeight = 'bold';
    this.playerHPDisplay.style.lineHeight = '19px';
    borderContainer.appendChild(this.playerHPDisplay);
  }
  
  /**
   * Updates the HP display for a player or enemy
   * @param isPlayer - Whether to update the player (true) or enemy (false) HP
   * @param hp - The new HP value
   */
  public updateHP(isPlayer: boolean, hp: number): void {
    if (isPlayer && this.playerHPDisplay) {
      this.playerHP = hp;
      this.playerHPDisplay.textContent = `Player: ${hp}/10 HP`;
      
      // Visual cue for low health
      if (hp <= 3) {
        this.playerHPDisplay.style.color = 'red';
      } else {
        this.playerHPDisplay.style.color = 'black';
      }
    } else if (!isPlayer && this.enemyHPDisplay) {
      this.enemyHP = hp;
      this.enemyHPDisplay.textContent = `Enemy: ${hp}/10 HP`;
      
      // Visual cue for low health
      if (hp <= 3) {
        this.enemyHPDisplay.style.color = 'red';
      } else {
        this.enemyHPDisplay.style.color = 'black';
      }
    }
  }
  
  /**
   * Initializes all grid cells with proper zone styling
   */
  private initializeCells(): void {
    // Calculate zone boundaries
    const enemyZoneRows = Math.floor(this.rows * 0.4); // Top 40%
    const combatZoneRows = Math.floor(this.rows * 0.2); // Middle 20%
    const playerZoneRows = this.rows - enemyZoneRows - combatZoneRows; // Bottom 40%

    for (let row = 0; row < this.rows; row++) {
      this.cells[row] = [];
      let zone: CellZone;
      if (row < enemyZoneRows) {
        zone = CellZone.ENEMY;
      } else if (row < enemyZoneRows + combatZoneRows) {
        zone = CellZone.COMBAT;
      } else {
        zone = CellZone.PLAYER;
      }
      for (let col = 0; col < this.columns; col++) {
        const cellElement = document.createElement('div');
        cellElement.className = 'grid-cell';
        cellElement.dataset.row = row.toString();
        cellElement.dataset.col = col.toString();
        cellElement.style.backgroundColor = '#2a2a2a';
        cellElement.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        if (row < enemyZoneRows) {
          cellElement.classList.add('enemy-zone');
          cellElement.style.borderTop = row === 0 ? '2px solid rgba(255, 255, 255, 0.5)' : cellElement.style.border;
        } else if (row < enemyZoneRows + combatZoneRows) {
          cellElement.classList.add('combat-zone');
          cellElement.style.borderTop = row === enemyZoneRows ? '2px solid rgba(255, 255, 255, 0.5)' : cellElement.style.border;
        } else {
          cellElement.classList.add('player-zone');
          cellElement.style.borderTop = row === enemyZoneRows + combatZoneRows ? '2px solid rgba(255, 255, 255, 0.5)' : cellElement.style.border;
        }
        this.gridElement.appendChild(cellElement);
        this.cells[row][col] = new Cell(cellElement, row, col, zone);
      }
    }

    this.addZoneLabel('PLAYER', enemyZoneRows + combatZoneRows);
  }
  
  /**
   * Adds a label for a zone
   * @param text - The zone label text
   * @param startRow - The starting row of the zone
   */
  private addZoneLabel(text: string, startRow: number): void {
    const label = document.createElement('div');
    label.className = 'zone-label';
    label.textContent = text;
    label.style.position = 'absolute';
    label.style.right = '10px';
    label.style.top = `${startRow * this.cellSize + 5}px`;
    label.style.color = 'rgba(255, 255, 255, 0.7)';
    label.style.fontSize = '11px';
    label.style.fontWeight = 'bold';
    label.style.letterSpacing = '1px';
    label.style.textTransform = 'uppercase';
    label.style.pointerEvents = 'none';
    label.style.padding = '3px 6px';
    label.style.borderRadius = '4px';
    label.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
    label.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)';
    
    this.gridElement.appendChild(label);
  }
  
  /**
   * Gets a cell at the specified coordinates
   * @param row - The row index
   * @param col - The column index
   * @returns The cell element or null if coordinates are invalid
   */
  public getCell(row: number, col: number): Cell | null {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.columns) {
      return this.cells[row][col];
    }
    return null;
  }
  
  /**
   * Gets the number of rows in the grid
   */
  public getRows(): number {
    return this.rows;
  }
  
  /**
   * Gets the number of columns in the grid
   */
  public getColumns(): number {
    return this.columns;
  }

  async initialize(containerId: string): Promise<void> {
    // Grid is already initialized in constructor, just fulfill the interface
    console.log('Grid already initialized in constructor');
    return Promise.resolve();
  }

  destroy(): void {
    console.log('Grid destroyed');
    this.cells = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
} 