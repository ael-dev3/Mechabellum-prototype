/**
 * Represents a single cell in the game grid
 */
export enum CellZone {
  ENEMY = 'enemy-zone',
  COMBAT = 'combat-zone',
  PLAYER = 'player-zone'
}

export class Cell {
  /**
   * Returns the row index of this cell
   */
  public getRow(): number {
    return this.row;
  }
  /**
   * Returns the column index of this cell
   */
  public getCol(): number {
    return this.col;
  }
  private element: HTMLElement;
  private row: number;
  private col: number;
  private zone: CellZone;
  private isOccupied: boolean = false;
  
  /**
   * Creates a new Cell
   * @param element - The HTML element representing this cell
   * @param row - The row index
   * @param column - The column index
   * @param zone - The zone this cell belongs to
   */
  constructor(element: HTMLElement, row: number, col: number, zone: CellZone) {
    this.element = element;
    this.row = row;
    this.col = col;
    this.zone = zone;
    
    // Ensure the element has positioning for hover effects
    this.element.style.position = 'relative';
  }
  
  /**
   * Gets the zone this cell belongs to
   */
  public getZone(): CellZone {
    return this.zone;
  }
  
  /**
   * Sets the zone this cell belongs to
   * @param zone - The new zone
   */
  public setZone(zone: CellZone): void {
    this.zone = zone;
  }
  
  /**
   * Gets the coordinates as a string (for debugging)
   */
  public getCoordinatesString(): string {
    return `${this.row},${this.col}`;
  }
  
  /**
   * Checks if the cell is occupied
   */
  public isOccupiedCell(): boolean {
    return this.isOccupied;
  }
  
  /**
   * Sets the occupied state of this cell
   * @param occupied - Whether the cell is occupied
   */
  public setOccupied(occupied: boolean): void {
    this.isOccupied = occupied;
    
    if (occupied) {
      this.element.classList.add('occupied');
      this.element.style.backgroundColor = '#444';
      this.element.style.boxShadow = 'inset 0 0 10px rgba(255, 255, 255, 0.4)';
      this.element.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    } else {
      this.element.classList.remove('occupied');
      this.element.style.backgroundColor = '#2a2a2a';
      this.element.style.boxShadow = 'none';
      this.element.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    }
  }
  
  /**
   * Highlights this cell
   * @param highlight - Whether to highlight the cell
   */
  public highlight(highlight: boolean): void {
    if (highlight) {
      this.element.style.boxShadow = 'inset 0 0 10px rgba(255, 255, 255, 0.6)';
      this.element.style.backgroundColor = '#3a3a3a';
      this.element.style.border = '1px solid rgba(255, 255, 255, 0.4)';
      this.element.style.transition = 'all 0.15s ease';
    } else {
      this.element.style.boxShadow = 'none';
      this.element.style.backgroundColor = this.isOccupied ? '#444' : '#2a2a2a';
      this.element.style.border = this.isOccupied ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.2)';
      this.element.style.transition = 'all 0.15s ease';
    }
  }
  
  /**
   * Gets the HTML element for this cell
   */
  public getElement(): HTMLElement {
    return this.element;
  }
} 