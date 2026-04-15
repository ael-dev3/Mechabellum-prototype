import type { CellCoord, Team, UnitBlueprint, UnitState, UnitType } from './types';

export interface UnitFootprint {
  width: number;
  height: number;
}

const DEFAULT_FOOTPRINT: UnitFootprint = { width: 1, height: 1 };
const MS_PER_SECOND = 1000;
const GOBLIN_PLACEMENT_FOOTPRINT: UnitFootprint = { width: 3, height: 2 };

const buildOffsetsForFootprint = (footprint: UnitFootprint): CellCoord[] => {
  const offsets: CellCoord[] = [];
  for (let y = 0; y < footprint.height; y++) {
    for (let x = 0; x < footprint.width; x++) {
      offsets.push({ x, y });
    }
  }
  return offsets;
};

const GOBLIN_SPAWN_OFFSETS = buildOffsetsForFootprint(GOBLIN_PLACEMENT_FOOTPRINT);

const UNIT_CATALOG: Record<UnitType, UnitBlueprint> = {
  KNIGHT: {
    type: 'KNIGHT',
    name: 'Knight',
    unlockCost: 1,
    placementCost: 1,
    maxHp: 16,
    attackDamage: 2,
    attackRange: 1,
    attackCooldownMs: 1050,
    moveCooldownMs: 280,
    moveSpeed: MS_PER_SECOND / 280,
    color: '#ff4d6d',
  },
  GOBLIN: {
    type: 'GOBLIN',
    name: 'Goblin Squad',
    unlockCost: 1,
    placementCost: 1,
    maxHp: 1,
    attackDamage: 1,
    attackRange: 1,
    placementFootprint: GOBLIN_PLACEMENT_FOOTPRINT,
    spawnOffsets: GOBLIN_SPAWN_OFFSETS,
    attackCooldownMs: 1050,
    moveCooldownMs: 140,
    moveSpeed: MS_PER_SECOND / 140,
    color: '#7ac77a',
  },
  ARCHER: {
    type: 'ARCHER',
    name: 'Archer',
    unlockCost: 2,
    placementCost: 2,
    maxHp: 8,
    attackDamage: 4,
    attackRange: 4,
    attackDistance: 'CHEBYSHEV',
    attackCooldownMs: 750,
    moveCooldownMs: 320,
    moveSpeed: MS_PER_SECOND / 320,
    color: '#ffb703',
  },
  SNIPER: {
    type: 'SNIPER',
    name: 'Sniper',
    unlockCost: 5,
    placementCost: 5,
    maxHp: 6,
    attackDamage: 2,
    attackRange: 20,
    attackCooldownMs: 375,
    moveCooldownMs: 1000,
    moveSpeed: 1,
    color: '#5dade2',
  },
  MAGE: {
    type: 'MAGE',
    name: 'Mage',
    unlockCost: 3,
    placementCost: 3,
    maxHp: 7,
    attackDamage: 3,
    attackRange: 10,
    aoeRadius: 10,
    attackCooldownMs: 1100,
    moveCooldownMs: 360,
    moveSpeed: MS_PER_SECOND / 360,
    color: '#c77dff',
  },
  GOLEM: {
    type: 'GOLEM',
    name: 'Golem',
    unlockCost: 4,
    placementCost: 4,
    maxHp: 32,
    attackDamage: 4,
    attackRange: 3,
    aoeRadius: 5,
    footprint: { width: 2, height: 2 },
    attackCooldownMs: 1050,
    moveCooldownMs: 280,
    moveSpeed: MS_PER_SECOND / 280,
    color: '#8d8d8d',
  },
};

export const getUnitBlueprint = (unitType: UnitType): UnitBlueprint => {
  const blueprint = UNIT_CATALOG[unitType];
  if (!blueprint) {
    const known = Object.keys(UNIT_CATALOG).join(', ');
    throw new Error(`Unknown unit type: ${String(unitType)} (known: ${known})`);
  }
  return blueprint;
};

export const getAllUnitTypes = (): UnitType[] => Object.keys(UNIT_CATALOG) as UnitType[];

export const getUnitFootprint = (unitType: UnitType): UnitFootprint => getUnitBlueprint(unitType).footprint ?? DEFAULT_FOOTPRINT;

export const getPlacementFootprint = (unitType: UnitType): UnitFootprint => {
  const blueprint = getUnitBlueprint(unitType);
  return blueprint.placementFootprint ?? blueprint.footprint ?? DEFAULT_FOOTPRINT;
};

export const getPlacementOffsets = (unitType: UnitType): CellCoord[] => {
  const blueprint = getUnitBlueprint(unitType);
  if (blueprint.spawnOffsets && blueprint.spawnOffsets.length > 0) return blueprint.spawnOffsets;
  return [{ x: 0, y: 0 }];
};

export const getUnitFootprintCells = (unitType: UnitType, anchor: CellCoord): CellCoord[] => {
  const footprint = getUnitFootprint(unitType);
  const cells: CellCoord[] = [];
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      cells.push({ x: anchor.x + dx, y: anchor.y + dy });
    }
  }
  return cells;
};

export const getPlacementFootprintCells = (unitType: UnitType, anchor: CellCoord): CellCoord[] => {
  const footprint = getPlacementFootprint(unitType);
  const cells: CellCoord[] = [];
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      cells.push({ x: anchor.x + dx, y: anchor.y + dy });
    }
  }
  return cells;
};

export const isCellInUnitFootprint = (unit: { type: UnitType; x: number; y: number }, cell: CellCoord): boolean => {
  const footprint = getUnitFootprint(unit.type);
  return (
    cell.x >= unit.x &&
    cell.x < unit.x + footprint.width &&
    cell.y >= unit.y &&
    cell.y < unit.y + footprint.height
  );
};

export const getUnitCenter = (unit: { type: UnitType; x: number; y: number }): { x: number; y: number } => {
  const footprint = getUnitFootprint(unit.type);
  return {
    x: unit.x + footprint.width / 2,
    y: unit.y + footprint.height / 2,
  };
};

export const getCounterUnitType = (unitType: UnitType): UnitType => {
  switch (unitType) {
    case 'KNIGHT':
      return 'ARCHER';
    case 'ARCHER':
      return 'MAGE';
    case 'SNIPER':
      return 'MAGE';
    case 'MAGE':
      return 'KNIGHT';
    case 'GOLEM':
      return 'MAGE';
    case 'GOBLIN':
      return 'ARCHER';
  }
};

export const getUnitStats = (unitType: UnitType, tier: number): { maxHp: number; attackDamage: number } => {
  const blueprint = getUnitBlueprint(unitType);
  const safeTier = Math.max(1, Math.floor(tier));
  return {
    maxHp: blueprint.maxHp * safeTier,
    attackDamage: blueprint.attackDamage * safeTier,
  };
};

const moveSpeedFromCooldown = (cooldownMs: number): number =>
  cooldownMs > 0 ? MS_PER_SECOND / Math.max(1, cooldownMs) : 0;

const moveCooldownFromSpeed = (moveSpeed: number): number =>
  moveSpeed > 0 ? Math.max(1, Math.round(MS_PER_SECOND / moveSpeed)) : MS_PER_SECOND;

export const getUnitMoveSpeed = (unitType: UnitType): number => {
  const blueprint = getUnitBlueprint(unitType);
  if (Number.isFinite(blueprint.moveSpeed) && blueprint.moveSpeed > 0) return blueprint.moveSpeed;
  return moveSpeedFromCooldown(blueprint.moveCooldownMs);
};

export const getUnitMoveCooldownMs = (unitType: UnitType): number => {
  const blueprint = getUnitBlueprint(unitType);
  if (Number.isFinite(blueprint.moveSpeed) && blueprint.moveSpeed > 0) {
    return moveCooldownFromSpeed(blueprint.moveSpeed);
  }
  return Math.max(1, Math.round(blueprint.moveCooldownMs));
};

export const createUnit = (params: {
  id: number;
  team: Team;
  type: UnitType;
  x: number;
  y: number;
  xp?: number;
  tier?: number;
  inactiveMsRemaining?: number;
}): UnitState => {
  const stats = getUnitStats(params.type, params.tier ?? 1);
  return {
    id: params.id,
    team: params.team,
    type: params.type,
    x: params.x,
    y: params.y,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    attackCooldownMs: 0,
    moveCooldownMs: 0,
    inactiveMsRemaining: params.inactiveMsRemaining ?? 0,
    xp: params.xp ?? 0,
    tier: params.tier ?? 1,
  };
};
