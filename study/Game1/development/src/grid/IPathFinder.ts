import { IGrid } from './IGrid';

export interface IPathFinder {
    initialize(grid: IGrid): void;
    updateGrid(occupiedCells: boolean[][]): void;
    setBlocked(row: number, col: number, isBlocked: boolean): void;
    findPath(startRow: number, startCol: number, endRow: number, endCol: number): [number, number][];
} 