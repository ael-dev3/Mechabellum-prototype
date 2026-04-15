import { Cell } from './Cell';

export interface IGrid {
    initialize(containerId: string): Promise<void>;
    getRows(): number;
    getColumns(): number;
    getCell(row: number, col: number): Cell | null;
    getCellAtPosition(x: number, y: number): Cell | null;
    updateHP(isPlayer: boolean, hp: number): void;
    destroy(): void;
}
