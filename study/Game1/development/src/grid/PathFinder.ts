import { IPathFinder } from './IPathFinder';
import { IGrid } from './IGrid';

/**
 * Implements A* pathfinding algorithm for grid-based movement
 */
export class PathFinder implements IPathFinder {
  private grid: IGrid | null = null;
  private rows: number = 0;
  private columns: number = 0;
  
  /**
   * Creates a new PathFinder
   */
  constructor() {
    // Empty constructor, rows and columns will be set in initialize
  }
  
  initialize(grid: IGrid): void {
    this.grid = grid;
    this.rows = grid.getRows();
    this.columns = grid.getColumns();
    console.log('PathFinder initialized');
  }
  
  /**
   * Updates the pathfinding grid with occupied cells
   * @param occupiedCells - 2D array where true indicates a cell is occupied/blocked
   */
  public updateGrid(occupiedCells: boolean[][]): void {
    // Implementation needed
  }
  
  /**
   * Sets whether a specific cell is blocked
   * @param row - Row index
   * @param col - Column index
   * @param isBlocked - Whether the cell is blocked
   */
  public setBlocked(row: number, col: number, isBlocked: boolean): void {
    // Implementation needed
  }
  
  /**
   * Finds a path from start to end using A* algorithm
   * @param startRow - Starting row
   * @param startCol - Starting column
   * @param endRow - Target row
   * @param endCol - Target column
   * @returns An array of [row, col] pairs forming the path, or empty array if no path exists
   */
  public findPath(startRow: number, startCol: number, endRow: number, endCol: number): [number, number][] {
    // Implementation needed
    return [];
  }
  
  /**
   * Calculates Manhattan distance heuristic for A*
   * @param row1 - Starting row
   * @param col1 - Starting column
   * @param row2 - Target row
   * @param col2 - Target column
   * @returns Estimated distance between points
   */
  private heuristic(row1: number, col1: number, row2: number, col2: number): number {
    // Implementation needed
    return Math.abs(row1 - row2) + Math.abs(col1 - col2);
  }
}

/**
 * Internal node class for A* algorithm
 */
class Node {
  public row: number;
  public col: number;
  public g: number; // Cost from start
  public h: number; // Heuristic (estimated cost to end)
  public f: number; // Total cost (g + h)
  public parent: Node | null;
  
  constructor(row: number, col: number, g: number, h: number, parent: Node | null) {
    this.row = row;
    this.col = col;
    this.g = g;
    this.h = h;
    this.f = g + h;
    this.parent = parent;
  }
} 