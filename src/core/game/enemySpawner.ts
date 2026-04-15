import type { BuildingState, DeploymentUnit, GridState, UnitState, UnitType } from './types';
import {
  createUnit,
  getAllUnitTypes,
  getCounterUnitType,
  getPlacementFootprint,
  getPlacementOffsets,
  getUnitBlueprint,
  getUnitFootprint,
} from './unitCatalog';
import { getBuildingFootprint } from './buildingCatalog';
import { isEnemyDeployableCell, isPlayerFlankCell } from './grid';
import { GAME_CONFIG } from '../config/gameConfig';
import { addXp, xpRequiredForTier } from './xp';

export const spawnEnemyUnits = (params: {
  grid: GridState;
  playerUnits: readonly UnitState[];
  buildings: readonly BuildingState[];
  existingEnemyDeployments: readonly DeploymentUnit[];
  nextUnitId: number;
  rngSeed: number;
  turn: number;
  enemyGoldDebtNextTurn: number;
  enemyGold: number;
  enemyUnlockedUnits: Record<UnitType, boolean>;
  enemyPlacementSlots: number;
  enemyNextPlacementSlotCost: number;
}): {
  enemyUnits: UnitState[];
  enemyDeployments: DeploymentUnit[];
  nextUnitId: number;
  nextSeed: number;
  nextEnemyGoldDebtNextTurn: number;
  nextEnemyGold: number;
  nextEnemyUnlockedUnits: Record<UnitType, boolean>;
  nextEnemyPlacementSlots: number;
  nextEnemyNextPlacementSlotCost: number;
} => {
  const enemyUnits: UnitState[] = [];
  const enemyDeployments: DeploymentUnit[] = params.existingEnemyDeployments.map(d => ({
    ...d,
    xp: d.xp ?? 0,
    tier: d.tier ?? 1,
  }));
  let nextUnitId = params.nextUnitId;
  let seed = params.rngSeed;
  const unlockedUnits: Record<UnitType, boolean> = { ...params.enemyUnlockedUnits };
  let placementSlots = params.enemyPlacementSlots;
  let nextPlacementSlotCost = params.enemyNextPlacementSlotCost;

  const nextRand = (): number => {
    // xorshift32
    seed |= 0;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    // Convert to [0, 1)
    return (seed >>> 0) / 0x100000000;
  };

  const keyOf = (x: number, y: number): string => `${x},${y}`;

  const shuffleInPlace = <T>(items: T[]): void => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  };

  const allTypes = getAllUnitTypes();

  const placementCost = (unitType: UnitType): number => getUnitBlueprint(unitType).placementCost;
  const unlockCost = (unitType: UnitType): number => getUnitBlueprint(unitType).unlockCost;
  const incrementalCost = (unitType: UnitType): number =>
    placementCost(unitType) + (unlockedUnits[unitType] ? 0 : unlockCost(unitType));
  const minIncrementalCost = allTypes.reduce((min, type) => Math.min(min, incrementalCost(type)), Number.POSITIVE_INFINITY);

  const playerCounts: Record<UnitType, number> = {
    KNIGHT: 0,
    GOBLIN: 0,
    ARCHER: 0,
    SNIPER: 0,
    MAGE: 0,
    GOLEM: 0,
  };
  for (const unit of params.playerUnits) playerCounts[unit.type] += 1;

  const enemyCounts: Record<UnitType, number> = {
    KNIGHT: 0,
    GOBLIN: 0,
    ARCHER: 0,
    SNIPER: 0,
    MAGE: 0,
    GOLEM: 0,
  };
  for (const deployment of enemyDeployments) enemyCounts[deployment.type] += 1;

  const occupied = new Set<string>();
  const addFootprintToOccupied = (unitType: UnitType, anchor: { x: number; y: number }): void => {
    const footprint = getUnitFootprint(unitType);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupied.add(keyOf(anchor.x + dx, anchor.y + dy));
      }
    }
  };
  const addBuildingToOccupied = (building: BuildingState): void => {
    const footprint = getBuildingFootprint(building.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupied.add(keyOf(building.x + dx, building.y + dy));
      }
    }
  };

  for (const unit of params.playerUnits) {
    addFootprintToOccupied(unit.type, unit);
  }

  for (const building of params.buildings) {
    addBuildingToOccupied(building);
  }

  for (const deployment of enemyDeployments) {
    addFootprintToOccupied(deployment.type, deployment);
  }

  const isAnchorValid = (unitType: UnitType, anchor: { x: number; y: number }): boolean => {
    const footprint = getPlacementFootprint(unitType);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        if (x < 0 || x >= params.grid.cols || y < 0 || y >= params.grid.rows) return false;
        if (
          !isEnemyDeployableCell(
            params.grid,
            { x, y },
            params.turn,
            GAME_CONFIG.flankColsPerSide,
            GAME_CONFIG.flankUnlockTurn
          )
        ) {
          return false;
        }
        if (occupied.has(keyOf(x, y))) return false;
      }
    }
    return true;
  };

  const getAnchorsForType = (unitType: UnitType): Array<{ x: number; y: number }> => {
    const footprint = getPlacementFootprint(unitType);
    const anchors: Array<{ x: number; y: number }> = [];
    const maxX = params.grid.cols - footprint.width;
    const maxY = params.grid.rows - footprint.height;
    for (let y = 0; y <= maxY; y++) {
      for (let x = 0; x <= maxX; x++) {
        const anchor = { x, y };
        if (!isAnchorValid(unitType, anchor)) continue;
        anchors.push(anchor);
      }
    }
    return anchors;
  };

  const openEnemyCells: Array<{ x: number; y: number }> = [];
  let minEnemyY = Number.POSITIVE_INFINITY;
  let maxEnemyY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < params.grid.rows; y++) {
    for (let x = 0; x < params.grid.cols; x++) {
      if (
        !isEnemyDeployableCell(
          params.grid,
          { x, y },
          params.turn,
          GAME_CONFIG.flankColsPerSide,
          GAME_CONFIG.flankUnlockTurn
        )
      )
        continue;
      if (occupied.has(keyOf(x, y))) continue;
      openEnemyCells.push({ x, y });
      minEnemyY = Math.min(minEnemyY, y);
      maxEnemyY = Math.max(maxEnemyY, y);
    }
  }
  const openCellCount = openEnemyCells.length;

  let availableGold = Math.max(0, params.enemyGold);
  let nextEnemyGoldDebtNextTurn = 0;

  if (openCellCount > 0) {
    const shouldTakeLoan =
      availableGold < minIncrementalCost ||
      (availableGold < minIncrementalCost * 2 && nextRand() < 0.6) ||
      nextRand() < 0.15;
    if (shouldTakeLoan) {
      availableGold += 2;
      nextEnemyGoldDebtNextTurn = 3;
    }
  }

  const upgradeCost = (unitType: UnitType): number => getUnitBlueprint(unitType).placementCost;

  const applyEnemyUpgrades = (): void => {
    if (availableGold <= 0) return;
    const candidates = enemyDeployments.slice();
    shuffleInPlace(candidates);
    for (const deployment of candidates) {
      const cost = upgradeCost(deployment.type);
      let tier = deployment.tier ?? 1;
      let xp = deployment.xp ?? 0;
      const requiredXp = xpRequiredForTier(deployment.type, tier);
      if (deployment.lastUpgradeTurn === params.turn) continue;
      if (availableGold >= cost && xp >= requiredXp) {
        availableGold -= cost;
        const nextTier = tier + 1;
        xp = addXp(Math.max(0, xp - requiredXp), 0, deployment.type, nextTier);
        tier = nextTier;
        deployment.tier = tier;
        deployment.xp = xp;
        deployment.lastUpgradeTurn = params.turn;
      }
    }
  };

  applyEnemyUpgrades();

  const weights: Record<UnitType, number> = {
    KNIGHT: 1,
    GOBLIN: 1,
    ARCHER: 1,
    SNIPER: 1,
    MAGE: 1,
    GOLEM: 1,
  };
  const goblinMageCounterWeight = 0.12;

  let mostCommon: UnitType = 'KNIGHT';
  let mostCommonCount = -1;
  for (const type of allTypes) {
    const count = playerCounts[type];
    if (count > mostCommonCount) {
      mostCommon = type;
      mostCommonCount = count;
    }
    if (count > 0) {
      const counter = getCounterUnitType(type);
      weights[counter] += count * 0.35;
      if (type === 'GOBLIN') {
        weights.MAGE += count * goblinMageCounterWeight;
      }
    }
  }

  for (const type of allTypes) {
    if (enemyCounts[type] > 0) {
      weights[type] = Math.max(0.4, weights[type] - enemyCounts[type] * 0.2);
    }
  }

  const strategyRoll = nextRand();
  if (strategyRoll < 0.25) {
    weights[getCounterUnitType(mostCommon)] += 1.2;
  } else if (strategyRoll < 0.5) {
    weights.ARCHER += 1.8;
    weights.MAGE += 1.2;
  } else if (strategyRoll < 0.7) {
    weights.KNIGHT += 2;
  } else if (strategyRoll < 0.85) {
    weights.MAGE += 2;
  } else {
    weights.KNIGHT += 0.6;
    weights.ARCHER += 0.6;
    weights.MAGE += 0.6;
  }

  for (const type of allTypes) {
    weights[type] += nextRand() * 0.5;
  }

  const zoneHeight = Number.isFinite(minEnemyY) && Number.isFinite(maxEnemyY) ? maxEnemyY - minEnemyY + 1 : 0;
  const backMaxY = minEnemyY + Math.floor(zoneHeight / 3);
  const frontMinY = minEnemyY + Math.floor((zoneHeight * 2) / 3);

  const rowBand = (y: number): 'front' | 'mid' | 'back' => {
    if (y <= backMaxY) return 'back';
    if (y >= frontMinY) return 'front';
    return 'mid';
  };

  const pickCellForType = (type: UnitType): { x: number; y: number } | null => {
    const anchors = getAnchorsForType(type);
    if (anchors.length === 0) return null;
    shuffleInPlace(anchors);
    const preferences: Array<'front' | 'mid' | 'back'> =
      type === 'KNIGHT' || type === 'GOLEM' || type === 'GOBLIN'
        ? ['front', 'mid', 'back']
        : type === 'ARCHER'
          ? ['mid', 'back', 'front']
          : ['back', 'mid', 'front'];
    for (const band of preferences) {
      const index = anchors.findIndex(cell => rowBand(cell.y) === band);
      if (index >= 0) return anchors[index];
    }
    return anchors[0] ?? null;
  };

  const pickWeightedType = (choices: UnitType[]): UnitType => {
    let total = 0;
    for (const type of choices) total += weights[type];
    let roll = nextRand() * total;
    for (const type of choices) {
      roll -= weights[type];
      if (roll <= 0) return type;
    }
    return choices[choices.length - 1];
  };

  const maxByGold = Math.floor(availableGold / minIncrementalCost);
  const baseLimit = Math.max(1, Math.floor(params.turn * 0.8));
  const jitter = nextRand() < 0.4 ? 1 : 0;
  const placementLimit = Math.min(openCellCount, maxByGold, baseLimit + jitter);

  const canAffordAny = (budget: number): boolean => allTypes.some(type => incrementalCost(type) <= budget);

  const getAffordableTypesWithAnchors = (budget: number): UnitType[] => {
    const affordable = allTypes.filter(type => incrementalCost(type) <= budget);
    if (affordable.length === 0) return [];
    return affordable.filter(type => getAnchorsForType(type).length > 0);
  };

  const newDeploymentIds: number[] = [];
  let placementsMade = 0;
  while (placementsMade < placementLimit && canAffordAny(availableGold)) {
    if (placementsMade >= placementSlots) {
      const canBuySlot =
        nextPlacementSlotCost > 0 &&
        availableGold >= nextPlacementSlotCost &&
        canAffordAny(availableGold - nextPlacementSlotCost) &&
        nextRand() < 0.7;
      if (canBuySlot) {
        availableGold -= nextPlacementSlotCost;
        placementSlots += 1;
        nextPlacementSlotCost = 2;
      } else {
        break;
      }
    }

    const affordable = getAffordableTypesWithAnchors(availableGold);
    if (affordable.length === 0) break;
    const picked = pickWeightedType(affordable);
    const cell = pickCellForType(picked);
    if (!cell) break;

    availableGold -= incrementalCost(picked);
    unlockedUnits[picked] = true;
    weights[picked] = Math.max(0.4, weights[picked] * 0.85);
    const spawnOffsets = getPlacementOffsets(picked);
    for (const offset of spawnOffsets) {
      const x = cell.x + offset.x;
      const y = cell.y + offset.y;
      addFootprintToOccupied(picked, { x, y });
      const id = nextUnitId++;
      enemyDeployments.push({ id, type: picked, x, y, xp: 0, tier: 1, placedTurn: params.turn });
      newDeploymentIds.push(id);
    }
    placementsMade += 1;
  }

  const totalEnemyCounts: Record<UnitType, number> = {
    KNIGHT: 0,
    GOBLIN: 0,
    ARCHER: 0,
    SNIPER: 0,
    MAGE: 0,
    GOLEM: 0,
  };
  for (const deployment of enemyDeployments) totalEnemyCounts[deployment.type] += 1;

  const mirrorMatch =
    enemyDeployments.length === params.playerUnits.length &&
    allTypes.every(type => totalEnemyCounts[type] === playerCounts[type]);
  if (mirrorMatch && newDeploymentIds.length > 0) {
    const candidates = enemyDeployments.filter(d => newDeploymentIds.includes(d.id));
    const chosen = candidates[Math.floor(nextRand() * candidates.length)];
    if (chosen) {
      const originalCost = placementCost(chosen.type);
      const alternatives = allTypes.filter(
        type => type !== chosen.type && placementCost(type) <= originalCost && unlockedUnits[type]
      );
      if (alternatives.length > 0) {
        chosen.type = alternatives[Math.floor(nextRand() * alternatives.length)];
      }
    }
  }

  for (const deployment of enemyDeployments) {
    const placedTurn = deployment.placedTurn ?? -1;
    const inactiveMsRemaining =
      placedTurn === params.turn && isPlayerFlankCell(params.grid, deployment, GAME_CONFIG.flankColsPerSide)
        ? GAME_CONFIG.flankDeployDelayMs
        : 0;
    enemyUnits.push(
      createUnit({
        id: deployment.id,
        team: 'ENEMY',
        type: deployment.type,
        x: deployment.x,
        y: deployment.y,
        xp: deployment.xp,
        tier: deployment.tier,
        inactiveMsRemaining,
      })
    );
  }

  return {
    enemyUnits,
    nextUnitId,
    enemyDeployments,
    nextSeed: seed,
    nextEnemyGoldDebtNextTurn,
    nextEnemyGold: availableGold,
    nextEnemyUnlockedUnits: unlockedUnits,
    nextEnemyPlacementSlots: placementSlots,
    nextEnemyNextPlacementSlotCost: nextPlacementSlotCost,
  };
};
