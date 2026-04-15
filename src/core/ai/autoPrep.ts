import type { GameAction } from '../game/actions';
import type { CellCoord, GameState, UnitType } from '../game/types';
import { isEnemyFlankCell, isPlayerDeployableCell, isPlayerFlankCell } from '../game/grid';
import { GAME_CONFIG } from '../config/gameConfig';
import {
  getAllUnitTypes,
  getCounterUnitType,
  getPlacementFootprint,
  getUnitBlueprint,
  isCellInUnitFootprint,
} from '../game/unitCatalog';
import { isCellInBuildingFootprint } from '../game/buildingCatalog';
import type { Store } from '../state/Store';

export type RowBand = 'front' | 'mid' | 'back';

export interface PlayerRowBands {
  frontMaxY: number;
  backMinY: number;
}

export interface AutoPrepConfig {
  maxSteps: number;
  placementGrowth: number;
  placementJitterChance: number;
  placementJitterMax: number;
  slotBuyChance: number;
  loanChanceLowGold: number;
  loanChanceRandom: number;
}

export const DEFAULT_AUTO_PREP_CONFIG: AutoPrepConfig = {
  maxSteps: 26,
  placementGrowth: 0.8,
  placementJitterChance: 0.35,
  placementJitterMax: 1,
  slotBuyChance: 0.65,
  loanChanceLowGold: 0.6,
  loanChanceRandom: 0.15,
};

export const createRng = (seedInput: number): (() => number) => {
  let seed = seedInput | 0;
  return (): number => {
    seed |= 0;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
};

export const buildPlayerCells = (grid: GameState['grid']): CellCoord[] => {
  const cells: CellCoord[] = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[y]?.[x];
      if (!cell) continue;
      const coord = { x, y };
      if (cell.zone === 'PLAYER') {
        if (isPlayerFlankCell(grid, coord, GAME_CONFIG.flankColsPerSide)) continue;
        cells.push(coord);
        continue;
      }
      if (isEnemyFlankCell(grid, coord, GAME_CONFIG.flankColsPerSide)) {
        cells.push(coord);
      }
    }
  }
  return cells;
};

export const buildPlayerRowBands = (grid: GameState['grid'], cells: CellCoord[]): PlayerRowBands => {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    const zone = grid.cells[cell.y]?.[cell.x]?.zone;
    if (zone !== 'PLAYER') continue;
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { frontMaxY: 0, backMinY: 0 };
  }
  const zoneHeight = maxY - minY + 1;
  const frontMaxY = minY + Math.floor(zoneHeight / 3);
  const backMinY = minY + Math.floor((zoneHeight * 2) / 3);
  return { frontMaxY, backMinY };
};

const getRowBandForPlayer = (y: number, bands: PlayerRowBands): RowBand => {
  if (y <= bands.frontMaxY) return 'front';
  if (y >= bands.backMinY) return 'back';
  return 'mid';
};

const isAnchorValidForPlayer = (state: GameState, unitType: UnitType, anchor: CellCoord): boolean => {
  const footprint = getPlacementFootprint(unitType);
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (x < 0 || x >= state.grid.cols || y < 0 || y >= state.grid.rows) return false;
      if (
        !isPlayerDeployableCell(
          state.grid,
          { x, y },
          state.turn,
          GAME_CONFIG.flankColsPerSide,
          GAME_CONFIG.flankUnlockTurn
        )
      ) {
        return false;
      }
      if (state.deployments.some(d => isCellInUnitFootprint(d, { x, y }))) return false;
      if (state.buildings.some(b => isCellInBuildingFootprint(b, { x, y }))) return false;
    }
  }
  return true;
};

const pickCellForType = (
  state: GameState,
  cells: CellCoord[],
  unitType: UnitType,
  rand: () => number,
  bands: PlayerRowBands
): CellCoord | null => {
  const open = cells.filter(c => isAnchorValidForPlayer(state, unitType, c));
  if (open.length === 0) return null;
  const preferences: RowBand[] =
    unitType === 'KNIGHT' || unitType === 'GOLEM' || unitType === 'GOBLIN'
      ? ['front', 'mid', 'back']
      : unitType === 'ARCHER' || unitType === 'SNIPER'
        ? ['mid', 'back', 'front']
        : ['back', 'mid', 'front'];
  for (const band of preferences) {
    const candidates = open.filter(cell => getRowBandForPlayer(cell.y, bands) === band);
    if (candidates.length > 0) {
      return candidates[Math.floor(rand() * candidates.length)];
    }
  }
  return open[Math.floor(rand() * open.length)];
};

const incrementalCost = (state: GameState, unitType: UnitType): number => {
  const blueprint = getUnitBlueprint(unitType);
  return blueprint.placementCost + (state.unlockedUnits[unitType] ? 0 : blueprint.unlockCost);
};

const getOpenPlayerCellCount = (state: GameState, cells: CellCoord[]): number => {
  let count = 0;
  for (const cell of cells) {
    if (!state.deployments.some(d => isCellInUnitFootprint(d, cell)) && !state.buildings.some(b => isCellInBuildingFootprint(b, cell))) {
      count += 1;
    }
  }
  return count;
};

const canAffordAny = (state: GameState): boolean =>
  getAllUnitTypes().some(unitType => incrementalCost(state, unitType) <= state.gold);

const pickWeightedType = (weights: Record<UnitType, number>, choices: UnitType[], rand: () => number): UnitType => {
  let total = 0;
  for (const type of choices) total += weights[type];
  let roll = rand() * total;
  for (const type of choices) {
    roll -= weights[type];
    if (roll <= 0) return type;
  }
  return choices[choices.length - 1];
};

const buildWeights = (state: GameState, rand: () => number): Record<UnitType, number> => {
  const weights: Record<UnitType, number> = {
    KNIGHT: 1,
    GOBLIN: 1,
    ARCHER: 1,
    SNIPER: 1,
    MAGE: 1,
    GOLEM: 1,
  };
  const goblinMageCounterWeight = 0.12;

  const enemyCounts: Record<UnitType, number> = {
    KNIGHT: 0,
    GOBLIN: 0,
    ARCHER: 0,
    SNIPER: 0,
    MAGE: 0,
    GOLEM: 0,
  };
  for (const deployment of state.enemyDeployments) enemyCounts[deployment.type] += 1;

  const playerCounts: Record<UnitType, number> = {
    KNIGHT: 0,
    GOBLIN: 0,
    ARCHER: 0,
    SNIPER: 0,
    MAGE: 0,
    GOLEM: 0,
  };
  for (const deployment of state.deployments) playerCounts[deployment.type] += 1;

  let mostCommon: UnitType = 'KNIGHT';
  let mostCommonCount = -1;
  for (const unitType of getAllUnitTypes()) {
    const count = enemyCounts[unitType];
    if (count > mostCommonCount) {
      mostCommon = unitType;
      mostCommonCount = count;
    }
    if (count > 0) {
      const counter = getCounterUnitType(unitType);
      weights[counter] += count * 0.35;
      if (unitType === 'GOBLIN') {
        weights.MAGE += count * goblinMageCounterWeight;
      }
    }
  }

  for (const unitType of getAllUnitTypes()) {
    if (playerCounts[unitType] > 0) {
      weights[unitType] = Math.max(0.4, weights[unitType] - playerCounts[unitType] * 0.2);
    }
  }

  const strategyRoll = rand();
  if (strategyRoll < 0.25) {
    weights[getCounterUnitType(mostCommon)] += 1.1;
  } else if (strategyRoll < 0.5) {
    weights.ARCHER += 1.4;
    weights.MAGE += 1.1;
  } else if (strategyRoll < 0.7) {
    weights.KNIGHT += 1.6;
  } else if (strategyRoll < 0.85) {
    weights.MAGE += 1.6;
  } else {
    weights.KNIGHT += 0.6;
    weights.ARCHER += 0.6;
    weights.MAGE += 0.6;
  }

  for (const unitType of getAllUnitTypes()) {
    weights[unitType] += rand() * 0.45;
  }
  return weights;
};

export const autoPrepPlayer = (
  store: Store<GameState, GameAction>,
  cells: CellCoord[],
  rand: () => number,
  bands: PlayerRowBands,
  config: AutoPrepConfig = DEFAULT_AUTO_PREP_CONFIG
): void => {
  const initial = store.getState();
  if ((initial.phase !== 'DEPLOYMENT' && initial.phase !== 'INTERMISSION') || initial.matchResult) return;

  const openCellCount = getOpenPlayerCellCount(initial, cells);
  const minCostAtStart = getAllUnitTypes().reduce(
    (min, unitType) => Math.min(min, incrementalCost(initial, unitType)),
    Number.POSITIVE_INFINITY
  );
  const maxByGold = Math.floor(initial.gold / Math.max(1, minCostAtStart));
  const baseLimit = Math.max(1, Math.floor(initial.turn * config.placementGrowth));
  const jitter = rand() < config.placementJitterChance ? config.placementJitterMax : 0;
  const placementTarget = Math.min(openCellCount, maxByGold, baseLimit + jitter);
  let placementsBudget = Math.max(0, placementTarget - initial.placementsUsedThisTurn);
  if (placementsBudget <= 0) return;

  let guard = config.maxSteps;
  while (guard-- > 0) {
    const state = store.getState();
    if ((state.phase !== 'DEPLOYMENT' && state.phase !== 'INTERMISSION') || state.matchResult) return;
    if (placementsBudget <= 0) return;

    const placementsLeft = state.placementSlots - state.placementsUsedThisTurn;
    const minCost = getAllUnitTypes().reduce(
      (min, unitType) => Math.min(min, incrementalCost(state, unitType)),
      Number.POSITIVE_INFINITY
    );

    if (placementsLeft <= 0) {
      const canBuySlot =
        placementsBudget > 0 &&
        state.gold >= state.nextPlacementSlotCost &&
        state.gold - state.nextPlacementSlotCost >= minCost &&
        rand() < config.slotBuyChance;
      if (canBuySlot) {
        store.dispatch({ type: 'BUY_PLACEMENT_SLOT' });
        continue;
      }
      return;
    }

    if (!state.loanUsedThisTurn && state.gold < minCost) {
      const shouldTakeLoan =
        state.gold < minCost ||
        (state.gold < minCost * 2 && rand() < config.loanChanceLowGold) ||
        rand() < config.loanChanceRandom;
      if (shouldTakeLoan) {
        store.dispatch({ type: 'TAKE_LOAN' });
        continue;
      }
    }

    if (!canAffordAny(state)) return;

    const affordable = getAllUnitTypes().filter(unitType => incrementalCost(state, unitType) <= state.gold);
    if (affordable.length === 0) return;
    const weights = buildWeights(state, rand);
    const unitType = pickWeightedType(weights, affordable, rand);
    const cost = incrementalCost(state, unitType);
    if (state.gold < cost) continue;

    const cell = pickCellForType(state, cells, unitType, rand, bands);
    if (!cell) return;

    store.dispatch({ type: 'SELECT_UNIT', unitType });
    store.dispatch({ type: 'PLACE_UNIT', cell });
    placementsBudget -= 1;
  }
};
