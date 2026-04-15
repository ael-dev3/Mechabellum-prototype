import type { BuildingState, CellCoord, CellState, CellZone, GridState, UnitState } from './types';
import { isCellInUnitFootprint } from './unitCatalog';
import { isCellInBuildingFootprint } from './buildingCatalog';

export const createGrid = (rows: number, cols: number, enemyZoneRows: number, neutralZoneRows: number): GridState => {
  const cells: CellState[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: CellState[] = [];
    const zone = getZoneForRow(y, rows, enemyZoneRows, neutralZoneRows);
    for (let x = 0; x < cols; x++) {
      row.push({ x, y, zone });
    }
    cells.push(row);
  }
  return { rows, cols, cells };
};

export const getZoneForRow = (
  y: number,
  rows: number,
  enemyZoneRows: number,
  neutralZoneRows: number
): CellZone => {
  const clampedEnemy = Math.max(0, Math.min(enemyZoneRows, rows));
  const clampedNeutral = Math.max(0, Math.min(neutralZoneRows, rows - clampedEnemy));
  if (y < clampedEnemy) return 'ENEMY';
  if (y < clampedEnemy + clampedNeutral) return 'NEUTRAL';
  return 'PLAYER';
};

export const isInBounds = (grid: GridState, coord: CellCoord): boolean =>
  coord.x >= 0 && coord.x < grid.cols && coord.y >= 0 && coord.y < grid.rows;

export const getCellZone = (grid: GridState, coord: CellCoord): CellZone | null => {
  if (!isInBounds(grid, coord)) return null;
  return grid.cells[coord.y][coord.x].zone;
};

export const getUnitAt = (units: readonly UnitState[], coord: CellCoord): UnitState | undefined =>
  units.find(unit => isCellInUnitFootprint(unit, coord));

export const getBuildingAt = (buildings: readonly BuildingState[], coord: CellCoord): BuildingState | undefined =>
  buildings.find(building => isCellInBuildingFootprint(building, coord));

export const clampFlankCols = (grid: GridState, flankColsPerSide: number): number => {
  const maxCols = Math.floor(grid.cols / 2);
  return Math.max(0, Math.min(flankColsPerSide, maxCols));
};

export const isFlankColumn = (grid: GridState, x: number, flankColsPerSide: number): boolean => {
  const cols = clampFlankCols(grid, flankColsPerSide);
  if (cols === 0) return false;
  return x < cols || x >= grid.cols - cols;
};

export const isEnemyFlankCell = (grid: GridState, coord: CellCoord, flankColsPerSide: number): boolean => {
  const zone = getCellZone(grid, coord);
  if (zone !== 'ENEMY') return false;
  return isFlankColumn(grid, coord.x, flankColsPerSide);
};

export const isPlayerFlankCell = (grid: GridState, coord: CellCoord, flankColsPerSide: number): boolean => {
  const zone = getCellZone(grid, coord);
  if (zone !== 'PLAYER') return false;
  return isFlankColumn(grid, coord.x, flankColsPerSide);
};

export const isPlayerDeployableCell = (
  grid: GridState,
  coord: CellCoord,
  turn: number,
  flankColsPerSide: number,
  flankUnlockTurn: number
): boolean => {
  const zone = getCellZone(grid, coord);
  if (!zone) return false;
  if (zone === 'PLAYER') {
    return !isFlankColumn(grid, coord.x, flankColsPerSide);
  }
  if (zone !== 'ENEMY') return false;
  if (turn < flankUnlockTurn) return false;
  return isFlankColumn(grid, coord.x, flankColsPerSide);
};

export const isEnemyDeployableCell = (
  grid: GridState,
  coord: CellCoord,
  turn: number,
  flankColsPerSide: number,
  flankUnlockTurn: number
): boolean => {
  const zone = getCellZone(grid, coord);
  if (!zone) return false;
  if (zone === 'ENEMY') {
    return !isFlankColumn(grid, coord.x, flankColsPerSide);
  }
  if (zone !== 'PLAYER') return false;
  if (turn < flankUnlockTurn) return false;
  return isFlankColumn(grid, coord.x, flankColsPerSide);
};
