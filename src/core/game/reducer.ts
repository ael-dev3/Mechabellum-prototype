import { GAME_CONFIG } from '../config/gameConfig';
import type { GameAction } from './actions';
import { createGrid, getCellZone, isEnemyFlankCell, isInBounds, isPlayerDeployableCell, isPlayerFlankCell } from './grid';
import { createInitialGameState } from './initialState';
import type {
  BattleResult,
  BuildingType,
  CellCoord,
  DeploymentUnit,
  GameState,
  RoundSummary,
  RoundUnitSummary,
  SfxEvent,
  Team,
  UnitState,
  UnitType,
} from './types';
import { spawnEnemyUnits } from './enemySpawner';
import { stepBattle, countAliveByTeam } from './simulateBattle';
import {
  createBuilding,
  getBuildingAttackStats,
  getBuildingBlueprint,
  getBuildingFootprint,
  getBuildingFootprintCells,
  getBuildingStats,
  getBuildingSpawnInfo,
  isCellInBuildingFootprint,
} from './buildingCatalog';
import {
  createUnit,
  getUnitFootprint,
  getPlacementFootprint,
  getPlacementFootprintCells,
  getPlacementOffsets,
  getUnitBlueprint,
  getUnitStats,
  isCellInUnitFootprint,
} from './unitCatalog';
import { addXp, xpRequiredForTier, toRoman } from './xp';

const goldForTurn = (turn: number): number => Math.max(2, turn);

const isDeploymentOccupied = (deployments: readonly DeploymentUnit[], coord: { x: number; y: number }): boolean =>
  deployments.some(d => isCellInUnitFootprint(d, coord));

const isBuildingOccupied = (
  buildings: readonly GameState['buildings'][number][],
  coord: { x: number; y: number }
): boolean =>
  buildings.some(b => isCellInBuildingFootprint(b, coord));

const isAnyDeploymentOccupied = (state: GameState, coord: { x: number; y: number }): boolean =>
  isDeploymentOccupied(state.deployments, coord) ||
  isDeploymentOccupied(state.enemyDeployments, coord) ||
  isBuildingOccupied(state.buildings, coord);

const isCombatBuilding = (building: GameState['buildings'][number]): boolean => {
  const tier = building.tier ?? 1;
  return Boolean(getBuildingAttackStats(building.type, tier) || getBuildingSpawnInfo(building.type, tier));
};

const countCombatBuildings = (buildings: readonly GameState['buildings'][number][], team: Team): number =>
  buildings.reduce((count, building) => (building.team === team && isCombatBuilding(building) ? count + 1 : count), 0);

const countCombatants = (
  units: readonly UnitState[],
  buildings: readonly GameState['buildings'][number][],
  team: Team
): number => countAliveByTeam(units, team) + countCombatBuildings(buildings, team);

const getPlacementIssue = (
  state: GameState,
  unitType: DeploymentUnit['type'],
  anchor: { x: number; y: number }
): string | null => {
  const blueprint = getUnitBlueprint(unitType);
  const footprint = getPlacementFootprint(unitType);
  const needsFootprint = footprint.width > 1 || footprint.height > 1;
  const sizeLabel = `${footprint.width}x${footprint.height}`;
  const flankCols = GAME_CONFIG.flankColsPerSide;
  const flankUnlockTurn = GAME_CONFIG.flankUnlockTurn;
  const flankDescriptor = `${flankCols}-column flank lanes on each edge`;
  for (const cell of getPlacementFootprintCells(unitType, anchor)) {
    const zone = getCellZone(state.grid, cell);
    const canDeploy = isPlayerDeployableCell(state.grid, cell, state.turn, flankCols, flankUnlockTurn);
    if (!canDeploy) {
      if (zone === 'PLAYER' && isPlayerFlankCell(state.grid, cell, flankCols)) {
        return needsFootprint
          ? `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone (player flank lanes are enemy-only).`
          : 'Player flank lanes are enemy-only. Use the Player zone.';
      }
      if (zone === 'ENEMY' && isEnemyFlankCell(state.grid, cell, flankCols)) {
        return needsFootprint
          ? `${blueprint.name} needs a clear ${sizeLabel} space. Enemy flank lanes unlock on turn ${flankUnlockTurn}.`
          : `Enemy flank lanes unlock on turn ${flankUnlockTurn}.`;
      }
      if (zone === 'ENEMY') {
        return needsFootprint
          ? `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone or enemy flank lanes.`
          : `Enemy territory is locked. Use the Player zone or ${flankDescriptor} on turn ${flankUnlockTurn} and later.`;
      }
      if (zone === 'NEUTRAL') {
        return needsFootprint
          ? `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone or enemy flank lanes.`
          : `Neutral zone cannot be used. Deploy in the Player zone or ${flankDescriptor} on turn ${flankUnlockTurn} and later.`;
      }
      return needsFootprint
        ? `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone or enemy flank lanes.`
        : `You can only place units in the Player zone or ${flankDescriptor} on turn ${flankUnlockTurn} and later.`;
    }
    if (isAnyDeploymentOccupied(state, cell)) {
      return 'That space is already occupied.';
    }
  }
  return null;
};

const getBuildingPlacementIssue = (
  state: GameState,
  buildingType: BuildingType,
  anchor: { x: number; y: number }
): string | null => {
  const blueprint = getBuildingBlueprint(buildingType);
  const footprint = getBuildingFootprint(buildingType);
  const sizeLabel = `${footprint.width}x${footprint.height}`;
  const flankCols = GAME_CONFIG.flankColsPerSide;
  const flankUnlockTurn = GAME_CONFIG.flankUnlockTurn;
  const flankDescriptor = `${flankCols}-column flank lanes on each edge`;
  for (const cell of getBuildingFootprintCells(buildingType, anchor)) {
    const zone = getCellZone(state.grid, cell);
    const canDeploy = isPlayerDeployableCell(state.grid, cell, state.turn, flankCols, flankUnlockTurn);
    if (!canDeploy) {
      if (zone === 'PLAYER' && isPlayerFlankCell(state.grid, cell, flankCols)) {
        return `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone (player flank lanes are enemy-only).`;
      }
      if (zone === 'ENEMY' && isEnemyFlankCell(state.grid, cell, flankCols)) {
        return `${blueprint.name} needs a clear ${sizeLabel} space. Enemy flank lanes unlock on turn ${flankUnlockTurn}.`;
      }
      if (zone === 'ENEMY') {
        return `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone or enemy flank lanes.`;
      }
      if (zone === 'NEUTRAL') {
        return `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone or enemy flank lanes.`;
      }
      return `${blueprint.name} needs a clear ${sizeLabel} space in the Player zone or ${flankDescriptor} on turn ${flankUnlockTurn} and later.`;
    }
    if (isAnyDeploymentOccupied(state, cell)) {
      return 'That space is already occupied.';
    }
  }
  return null;
};

const getSideDeploymentDelayMs = (state: GameState, deployment: DeploymentUnit, team: Team): number => {
  if (GAME_CONFIG.flankDeployDelayMs <= 0) return 0;
  const placedTurn = deployment.placedTurn ?? -1;
  if (placedTurn !== state.turn) return 0;
  const flankCols = GAME_CONFIG.flankColsPerSide;
  if (team === 'PLAYER') {
    return isEnemyFlankCell(state.grid, deployment, flankCols) ? GAME_CONFIG.flankDeployDelayMs : 0;
  }
  return isPlayerFlankCell(state.grid, deployment, flankCols) ? GAME_CONFIG.flankDeployDelayMs : 0;
};

const keyOf = (x: number, y: number): string => `${x},${y}`;

const getSpawnRingCells = (grid: GameState['grid'], building: GameState['buildings'][number]): CellCoord[] => {
  const footprint = getBuildingFootprint(building.type);
  const minX = building.x - 1;
  const maxX = building.x + footprint.width;
  const minY = building.y - 1;
  const maxY = building.y + footprint.height;
  const cells: CellCoord[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) continue;
      if (x >= building.x && x < building.x + footprint.width && y >= building.y && y < building.y + footprint.height) continue;
      cells.push({ x, y });
    }
  }
  return cells;
};

const spawnBuildingUnits = (params: {
  grid: GameState['grid'];
  buildings: readonly GameState['buildings'][number][];
  units: readonly UnitState[];
  nextUnitId: number;
  deltaMs: number;
}): { buildings: GameState['buildings'][number][]; units: UnitState[]; nextUnitId: number; spawnedGoblins: number } => {
  if (params.buildings.length === 0) {
    return { buildings: [...params.buildings], units: [...params.units], nextUnitId: params.nextUnitId, spawnedGoblins: 0 };
  }

  const occupied = new Set<string>();
  for (const unit of params.units) {
    const footprint = getUnitFootprint(unit.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupied.add(keyOf(unit.x + dx, unit.y + dy));
      }
    }
  }
  for (const building of params.buildings) {
    const footprint = getBuildingFootprint(building.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupied.add(keyOf(building.x + dx, building.y + dy));
      }
    }
  }

  let nextUnitId = params.nextUnitId;
  const spawnedUnits: UnitState[] = [];
  let spawnedGoblins = 0;

  const buildings = params.buildings.map(building => {
    const buildingTier = Math.max(1, Math.floor(building.tier ?? 1));
    const spawnInfo = getBuildingSpawnInfo(building.type, buildingTier);
    if (!spawnInfo || spawnInfo.intervalMs <= 0) return building;

    let cooldown = Number.isFinite(building.spawnCooldownMs) ? building.spawnCooldownMs : spawnInfo.intervalMs;
    cooldown -= params.deltaMs;
    let pendingSpawns = 0;
    while (cooldown <= 0) {
      pendingSpawns += spawnInfo.countPerInterval;
      cooldown += spawnInfo.intervalMs;
    }

    if (pendingSpawns > 0) {
      const candidates = getSpawnRingCells(params.grid, building);
      if (candidates.length > 0) {
        const startIndex = building.id % candidates.length;
        const ordered = candidates.slice(startIndex).concat(candidates.slice(0, startIndex));
        const spawnFootprint = getUnitFootprint(spawnInfo.unitType);
        const canSpawnAt = (cell: CellCoord): boolean => {
          for (let dy = 0; dy < spawnFootprint.height; dy++) {
            for (let dx = 0; dx < spawnFootprint.width; dx++) {
              const x = cell.x + dx;
              const y = cell.y + dy;
              if (x < 0 || y < 0 || x >= params.grid.cols || y >= params.grid.rows) return false;
              if (occupied.has(keyOf(x, y))) return false;
            }
          }
          return true;
        };
        for (const cell of ordered) {
          if (pendingSpawns <= 0) break;
          if (!canSpawnAt(cell)) continue;
          const id = nextUnitId++;
          spawnedUnits.push(
            createUnit({
              id,
              team: building.team,
              type: spawnInfo.unitType,
              x: cell.x,
              y: cell.y,
              tier: buildingTier,
              xp: 0,
            })
          );
          if (spawnInfo.unitType === 'GOBLIN') {
            spawnedGoblins += 1;
          }
          for (let dy = 0; dy < spawnFootprint.height; dy++) {
            for (let dx = 0; dx < spawnFootprint.width; dx++) {
              occupied.add(keyOf(cell.x + dx, cell.y + dy));
            }
          }
          pendingSpawns -= 1;
        }
      }
    }

    return { ...building, spawnCooldownMs: Math.max(0, cooldown) };
  });

  return {
    buildings,
    units: [...params.units, ...spawnedUnits],
    nextUnitId,
    spawnedGoblins,
  };
};

const deploymentsToPlayerUnitsForBattle = (state: GameState): UnitState[] =>
  state.deployments.map(d =>
    createUnit({
      id: d.id,
      team: 'PLAYER',
      type: d.type,
      x: d.x,
      y: d.y,
      xp: d.xp,
      tier: d.tier,
      inactiveMsRemaining: getSideDeploymentDelayMs(state, d, 'PLAYER'),
    })
  );

const deploymentsToPlayerUnitsForDisplay = (deployments: readonly DeploymentUnit[]): UnitState[] =>
  deployments.map(d => createUnit({ id: d.id, team: 'PLAYER', type: d.type, x: d.x, y: d.y, xp: d.xp, tier: d.tier }));

const deploymentsToEnemyUnitsForDisplay = (deployments: readonly DeploymentUnit[]): UnitState[] =>
  deployments.map(d => createUnit({ id: d.id, team: 'ENEMY', type: d.type, x: d.x, y: d.y, xp: d.xp, tier: d.tier }));

const applyXpToDeployments = (deployments: readonly DeploymentUnit[], xpGains: ReadonlyMap<number, number>): DeploymentUnit[] =>
  deployments.map(d => {
    const gain = xpGains.get(d.id) ?? 0;
    const tier = d.tier ?? 1;
    const currentXp = d.xp ?? 0;
    const nextXp = addXp(currentXp, gain, d.type, tier);
    if (nextXp === currentXp) return d;
    return { ...d, xp: nextXp, tier };
  });

const prepareBuildingsForBattle = (buildings: readonly GameState['buildings'][number][]): GameState['buildings'][number][] =>
  buildings.map(building => {
    const spawnInfo = getBuildingSpawnInfo(building.type, building.tier);
    const attackStats = getBuildingAttackStats(building.type, building.tier ?? 1);
    return {
      ...building,
      spawnCooldownMs: spawnInfo ? spawnInfo.intervalMs : building.spawnCooldownMs,
      attackCooldownMs: attackStats ? 0 : building.attackCooldownMs,
    };
  });

const canModifyDeployments = (state: GameState): boolean => state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION';

const skipBattleWithoutUnits = (state: GameState): GameState => {
  const {
    enemyUnits,
    enemyDeployments,
    nextUnitId,
    nextSeed,
    nextEnemyGoldDebtNextTurn,
    nextEnemyGold,
    nextEnemyUnlockedUnits,
    nextEnemyPlacementSlots,
    nextEnemyNextPlacementSlotCost,
  } = spawnEnemyUnits({
    grid: state.grid,
    playerUnits: [],
    buildings: state.buildings,
    existingEnemyDeployments: state.enemyDeployments,
    nextUnitId: state.nextUnitId,
    rngSeed: state.rngSeed,
    turn: state.turn,
    enemyGoldDebtNextTurn: state.enemyGoldDebtNextTurn,
    enemyGold: state.enemyGold,
    enemyUnlockedUnits: state.enemyUnlockedUnits,
    enemyPlacementSlots: state.enemyPlacementSlots,
    enemyNextPlacementSlotCost: state.enemyNextPlacementSlotCost,
  });

  const nextState = {
    ...state,
    enemyDeployments,
    nextUnitId,
    rngSeed: nextSeed,
    enemyGoldDebtNextTurn: nextEnemyGoldDebtNextTurn,
    enemyGold: nextEnemyGold,
    enemyUnlockedUnits: nextEnemyUnlockedUnits,
    enemyPlacementSlots: nextEnemyPlacementSlots,
    enemyNextPlacementSlotCost: nextEnemyNextPlacementSlotCost,
    hoveredCell: null,
    intermissionMsRemaining: 0,
    pendingPlayerDamage: 0,
    pendingEnemyDamage: 0,
    battleTimeMs: 0,
    result: null,
  };

  return endBattle(nextState, { units: enemyUnits, battleTimeMs: 0, timedOut: false });
};

const startBattleFromCurrentDeployments = (state: GameState): GameState => {
  const playerUnits = deploymentsToPlayerUnitsForBattle(state);
  const playerCombatBuildings = countCombatBuildings(state.buildings, 'PLAYER');
  if (playerUnits.length === 0 && playerCombatBuildings === 0) {
    return skipBattleWithoutUnits(state);
  }

  const {
    enemyUnits,
    enemyDeployments,
    nextUnitId,
    nextSeed,
    nextEnemyGoldDebtNextTurn,
    nextEnemyGold,
    nextEnemyUnlockedUnits,
    nextEnemyPlacementSlots,
    nextEnemyNextPlacementSlotCost,
  } = spawnEnemyUnits({
    grid: state.grid,
    playerUnits,
    buildings: state.buildings,
    existingEnemyDeployments: state.enemyDeployments,
    nextUnitId: state.nextUnitId,
    rngSeed: state.rngSeed,
    turn: state.turn,
    enemyGoldDebtNextTurn: state.enemyGoldDebtNextTurn,
    enemyGold: state.enemyGold,
    enemyUnlockedUnits: state.enemyUnlockedUnits,
    enemyPlacementSlots: state.enemyPlacementSlots,
    enemyNextPlacementSlotCost: state.enemyNextPlacementSlotCost,
  });

  const buildings = prepareBuildingsForBattle(state.buildings);

  return {
    ...state,
    phase: 'BATTLE',
    units: [...playerUnits, ...enemyUnits],
    buildings,
    nextUnitId,
    rngSeed: nextSeed,
    enemyGoldDebtNextTurn: nextEnemyGoldDebtNextTurn,
    enemyGold: nextEnemyGold,
    enemyUnlockedUnits: nextEnemyUnlockedUnits,
    enemyPlacementSlots: nextEnemyPlacementSlots,
    enemyNextPlacementSlotCost: nextEnemyNextPlacementSlotCost,
    enemyDeployments,
    hoveredCell: null,
    intermissionMsRemaining: 0,
    pendingPlayerDamage: 0,
    pendingEnemyDamage: 0,
    message: { kind: 'info', text: 'Battle started. Units act automatically.' },
    battleTimeMs: 0,
    result: null,
  };
};

const getBattleResult = (params: {
  playerAlive: number;
  enemyAlive: number;
  timedOut: boolean;
}): BattleResult => {
  const { playerAlive, enemyAlive, timedOut } = params;
  if (playerAlive === 0 && enemyAlive === 0) return { winner: 'DRAW', reason: 'ELIMINATION' };
  if (playerAlive === 0) return { winner: 'ENEMY', reason: 'ELIMINATION' };
  if (enemyAlive === 0) return { winner: 'PLAYER', reason: 'ELIMINATION' };
  return timedOut ? { winner: 'DRAW', reason: 'TIME' } : { winner: 'DRAW', reason: 'TIME' };
};

const HP_ROUND_PRECISION = 1000;

const normalizeHpValue = (value: number): number => Math.max(0, Math.round(value * HP_ROUND_PRECISION) / HP_ROUND_PRECISION);

const formatHpValue = (value: number): string => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/\.?0+$/, '');
};

const getUnitHpDamageWeight = (unitType: UnitType): number => {
  const blueprint = getUnitBlueprint(unitType);
  const spawnCount = Math.max(1, getPlacementOffsets(unitType).length);
  return blueprint.placementCost / spawnCount;
};

const getHpDamageByTeam = (units: readonly UnitState[], team: Team): number =>
  units.reduce((sum, unit) => {
    if (unit.team !== team || unit.hp <= 0) return sum;
    return sum + getUnitHpDamageWeight(unit.type);
  }, 0);

const summarizeSurvivors = (units: readonly UnitState[], team: Team): RoundUnitSummary[] => {
  const summaries = new Map<string, { type: UnitType; tier: number; count: number; damagePerUnit: number; totalDamage: number }>();
  for (const unit of units) {
    if (unit.team !== team || unit.hp <= 0) continue;
    const damagePerUnit = getUnitHpDamageWeight(unit.type);
    const key = `${unit.type}|${unit.tier}`;
    const entry = summaries.get(key);
    if (entry) {
      entry.count += 1;
      entry.totalDamage += damagePerUnit;
    } else {
      summaries.set(key, { type: unit.type, tier: unit.tier, count: 1, damagePerUnit, totalDamage: damagePerUnit });
    }
  }

  return [...summaries.values()]
    .map(summary => ({
      type: summary.type,
      tier: summary.tier,
      count: summary.count,
      damagePerUnit: normalizeHpValue(summary.damagePerUnit),
      totalDamage: normalizeHpValue(summary.totalDamage),
    }))
    .sort((a, b) => b.totalDamage - a.totalDamage || a.type.localeCompare(b.type) || a.tier - b.tier);
};

const buildRoundSummary = (params: {
  round: number;
  result: RoundSummary['winner'];
  playerDamage: number;
  enemyDamage: number;
  units: readonly UnitState[];
}): RoundSummary => ({
  round: params.round,
  winner: params.result,
  playerDamage: params.playerDamage,
  enemyDamage: params.enemyDamage,
  playerUnits: summarizeSurvivors(params.units, 'PLAYER'),
  enemyUnits: summarizeSurvivors(params.units, 'ENEMY'),
});

const getBuildingGoldIncome = (buildings: readonly GameState['buildings'][number][], team: Team): number =>
  buildings.reduce((sum, building) => {
    if (building.team !== team) return sum;
    const stats = getBuildingStats(building.type, building.tier);
    return sum + stats.goldPerTurn;
  }, 0);

const endBattle = (state: GameState, params: { units: readonly UnitState[]; battleTimeMs: number; timedOut: boolean }): GameState => {
  const playerCombatants = countCombatants(params.units, state.buildings, 'PLAYER');
  const enemyCombatants = countCombatants(params.units, state.buildings, 'ENEMY');

  const result = getBattleResult({ playerAlive: playerCombatants, enemyAlive: enemyCombatants, timedOut: params.timedOut });
  const playerDamageRaw = getHpDamageByTeam(params.units, 'PLAYER');
  const enemyDamageRaw = getHpDamageByTeam(params.units, 'ENEMY');
  const playerDamage = normalizeHpValue(playerDamageRaw);
  const enemyDamage = normalizeHpValue(enemyDamageRaw);
  const lastRoundSummary = buildRoundSummary({
    round: state.turn,
    result: result.winner,
    playerDamage,
    enemyDamage,
    units: params.units,
  });

  const enemyHp = normalizeHpValue(state.enemyHp - playerDamageRaw);
  const playerHp = normalizeHpValue(state.playerHp - enemyDamageRaw);
  const matchOver = enemyHp <= 0 || playerHp <= 0;

  const displayUnits = [
    ...deploymentsToPlayerUnitsForDisplay(state.deployments),
    ...deploymentsToEnemyUnitsForDisplay(state.enemyDeployments),
  ];
  const buildingsReady = state.buildings.map(building => ({ ...building, upgradeReady: true }));

  if (matchOver) {
    const winner = enemyHp <= 0 && playerHp <= 0 ? 'DRAW' : enemyHp <= 0 ? 'PLAYER' : 'ENEMY';
    const victorySfx: SfxEvent[] = winner === 'PLAYER' ? [{ kind: 'VICTORY', count: 1 }] : [];
    const hasVictorySfx = victorySfx.length > 0;
    const sfxEvents = hasVictorySfx ? [...state.sfxEvents, ...victorySfx] : state.sfxEvents;
    const sfxEventId = hasVictorySfx ? state.sfxEventId + 1 : state.sfxEventId;
    return {
      ...state,
      phase: 'INTERMISSION',
      enemyHp,
      playerHp,
      matchResult: { winner, reason: 'HP' },
      units: displayUnits,
      buildings: buildingsReady,
      battleTimeMs: params.battleTimeMs,
      result,
      intermissionMsRemaining: 0,
      pendingPlayerDamage: playerDamage,
      pendingEnemyDamage: enemyDamage,
      sfxEvents,
      sfxEventId,
      goldDebtNextTurn: 0,
      enemyGoldDebtNextTurn: 0,
      loanUsedThisTurn: false,
      placementSlots: 1,
      nextPlacementSlotCost: 2,
      enemyPlacementSlots: 1,
      enemyNextPlacementSlotCost: 2,
      lastRoundSummary,
      message:
        winner === 'DRAW'
          ? { kind: 'success', text: 'Game over: draw.' }
          : winner === 'PLAYER'
            ? { kind: 'success', text: 'Game over: victory!' }
            : { kind: 'success', text: 'Game over: defeat.' },
    };
  }

  const turn = state.turn + 1;
  const goldIncome = goldForTurn(turn);
  const playerBuildingIncome = getBuildingGoldIncome(state.buildings, 'PLAYER');
  const enemyBuildingIncome = getBuildingGoldIncome(state.buildings, 'ENEMY');
  const gold = Math.max(0, state.gold + goldIncome + playerBuildingIncome - state.goldDebtNextTurn);
  const enemyGold = Math.max(0, state.enemyGold + goldIncome + enemyBuildingIncome - state.enemyGoldDebtNextTurn);

  return {
    ...state,
    phase: 'INTERMISSION',
    turn,
    gold,
    enemyGold,
    enemyHp,
    playerHp,
    units: displayUnits,
    buildings: buildingsReady,
    battleTimeMs: params.battleTimeMs,
    result,
    intermissionMsRemaining: GAME_CONFIG.intermissionMs,
    pendingPlayerDamage: playerDamage,
    pendingEnemyDamage: enemyDamage,
    placementSlots: 1,
    placementsUsedThisTurn: 0,
    nextPlacementSlotCost: 2,
    goldDebtNextTurn: 0,
    enemyGoldDebtNextTurn: 0,
    loanUsedThisTurn: false,
    enemyPlacementSlots: 1,
    enemyNextPlacementSlotCost: 2,
    lastRoundSummary,
    message: {
      kind: 'info',
      text: `Prep: dealt ${formatHpValue(playerDamage)}, took ${formatHpValue(enemyDamage)}. Battle starts in ${Math.ceil(
        GAME_CONFIG.intermissionMs / 1000
      )}s (or Ready).`,
    },
  };
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'SELECT_UNIT': {
      const alreadyUnlocked = state.unlockedUnits[action.unitType];
      if (alreadyUnlocked) {
        return { ...state, selectedUnitType: action.unitType, selectedPlacementKind: 'UNIT', message: null };
      }

      const blueprint = getUnitBlueprint(action.unitType);
      if (!canModifyDeployments(state)) {
        return { ...state, message: { kind: 'error', text: 'Units can only be unlocked between battles.' } };
      }

      if (state.gold < blueprint.unlockCost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${blueprint.unlockCost}g to unlock ${blueprint.name} (you have ${state.gold}g).` },
        };
      }

      return {
        ...state,
        gold: state.gold - blueprint.unlockCost,
        unlockedUnits: { ...state.unlockedUnits, [action.unitType]: true },
        selectedUnitType: action.unitType,
        selectedPlacementKind: 'UNIT',
        message: { kind: 'success', text: `${blueprint.name} unlocked.` },
      };
    }
    case 'SELECT_BUILDING': {
      const alreadyUnlocked = state.unlockedBuildings[action.buildingType];
      if (alreadyUnlocked) {
        return { ...state, selectedBuildingType: action.buildingType, selectedPlacementKind: 'BUILDING', message: null };
      }

      const blueprint = getBuildingBlueprint(action.buildingType);
      if (!canModifyDeployments(state)) {
        return { ...state, message: { kind: 'error', text: 'Buildings can only be unlocked between battles.' } };
      }

      if (state.gold < blueprint.unlockCost) {
        return {
          ...state,
          message: {
            kind: 'error',
            text: `Need ${blueprint.unlockCost}g to unlock ${blueprint.name} (you have ${state.gold}g).`,
          },
        };
      }

      return {
        ...state,
        gold: state.gold - blueprint.unlockCost,
        unlockedBuildings: { ...state.unlockedBuildings, [action.buildingType]: true },
        selectedBuildingType: action.buildingType,
        selectedPlacementKind: 'BUILDING',
        message: { kind: 'success', text: `${blueprint.name} unlocked.` },
      };
    }
    case 'SELECT_PLACED_UNIT': {
      if (action.unitId === null) {
        return { ...state, selectedUnitId: null };
      }
      const deployment = state.deployments.find(d => d.id === action.unitId);
      if (!deployment) {
        return { ...state, selectedUnitId: null };
      }
      if (state.selectedUnitId === action.unitId) {
        return { ...state, selectedUnitId: null };
      }
      return { ...state, selectedUnitId: action.unitId };
    }
    case 'SET_HOVERED_CELL':
      return { ...state, hoveredCell: action.cell };
    case 'TAKE_LOAN': {
      if (!canModifyDeployments(state)) return state;
      if (state.matchResult) return state;
      if (state.loanUsedThisTurn) {
        return { ...state, message: { kind: 'error', text: 'Loan already used this turn.' } };
      }
      return {
        ...state,
        gold: state.gold + 2,
        goldDebtNextTurn: state.goldDebtNextTurn + 3,
        loanUsedThisTurn: true,
        message: { kind: 'info', text: 'Loan taken: +2 gold now, -3 gold next turn.' },
      };
    }
    case 'READY': {
      if (state.phase !== 'INTERMISSION' && state.phase !== 'DEPLOYMENT') return state;
      if (state.matchResult) return state;
      return startBattleFromCurrentDeployments(state);
    }
    case 'INTERMISSION_TICK': {
      if (state.phase !== 'INTERMISSION' && state.phase !== 'DEPLOYMENT') return state;
      if (state.matchResult) return state;
      if (state.intermissionMsRemaining <= 0) return state;

      const remaining = Math.max(0, state.intermissionMsRemaining - action.deltaMs);
      if (remaining > 0) {
        return { ...state, intermissionMsRemaining: remaining };
      }

      // Auto-start battle when the timer runs out.
      return startBattleFromCurrentDeployments({ ...state, intermissionMsRemaining: 0 });
    }
    case 'BUY_PLACEMENT_SLOT': {
      if (!canModifyDeployments(state)) return state;
      const cost = state.nextPlacementSlotCost;
      if (state.gold < cost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${cost}g to buy a placement slot (you have ${state.gold}g).` },
        };
      }
      return {
        ...state,
        gold: state.gold - cost,
        placementSlots: state.placementSlots + 1,
        nextPlacementSlotCost: 2,
        message: { kind: 'success', text: 'Temporary placement slot purchased (+1 this turn).' },
      };
    }
    case 'PLACE_UNIT': {
      if (!canModifyDeployments(state)) return state;
      if (!isInBounds(state.grid, action.cell)) return state;

      if (state.placementsUsedThisTurn >= state.placementSlots) {
        return { ...state, message: { kind: 'error', text: 'No placements left this turn. Press Ready to advance.' } };
      }

      if (!state.unlockedUnits[state.selectedUnitType]) {
        const blueprint = getUnitBlueprint(state.selectedUnitType);
        return { ...state, message: { kind: 'error', text: `${blueprint.name} is locked. Tap the unit to unlock it.` } };
      }

      const blueprint = getUnitBlueprint(state.selectedUnitType);
      const placementIssue = getPlacementIssue(state, state.selectedUnitType, action.cell);
      if (placementIssue) {
        return { ...state, message: { kind: 'error', text: placementIssue } };
      }
      if (state.gold < blueprint.placementCost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${blueprint.placementCost}g to place ${blueprint.name} (you have ${state.gold}g).` },
        };
      }

      let nextUnitId = state.nextUnitId;
      const spawnOffsets = getPlacementOffsets(state.selectedUnitType);
      const placedDeployments: DeploymentUnit[] = [];
      const placedUnits: UnitState[] = [];
      for (const offset of spawnOffsets) {
        const id = nextUnitId++;
        const x = action.cell.x + offset.x;
        const y = action.cell.y + offset.y;
        placedDeployments.push({
          id,
          type: state.selectedUnitType,
          x,
          y,
          xp: 0,
          tier: 1,
          placedTurn: state.turn,
        });
        placedUnits.push(
          createUnit({
            id,
            team: 'PLAYER',
            type: state.selectedUnitType,
            x,
            y,
            xp: 0,
            tier: 1,
          })
        );
      }
      const shouldPlayGoblinSpawn = state.selectedUnitType === 'GOBLIN';
      const sfxEvents: SfxEvent[] = shouldPlayGoblinSpawn ? [{ kind: 'GOBLIN_SPAWN', count: 1 }] : [];
      const sfxEventId = shouldPlayGoblinSpawn ? state.sfxEventId + 1 : state.sfxEventId;

      return {
        ...state,
        gold: state.gold - blueprint.placementCost,
        placementsUsedThisTurn: state.placementsUsedThisTurn + 1,
        deployments: [...state.deployments, ...placedDeployments],
        units: [...state.units, ...placedUnits],
        nextUnitId,
        sfxEvents,
        sfxEventId,
        message: null,
      };
    }
    case 'PLACE_BUILDING': {
      if (!canModifyDeployments(state)) return state;
      if (!isInBounds(state.grid, action.cell)) return state;

      const buildingType = state.selectedBuildingType;
      if (!state.unlockedBuildings[buildingType]) {
        const blueprint = getBuildingBlueprint(buildingType);
        return { ...state, message: { kind: 'error', text: `${blueprint.name} is locked. Tap it to unlock.` } };
      }

      const maxCount = getBuildingBlueprint(buildingType).maxCount ?? 1;
      const existingCount = state.buildings.filter(b => b.type === buildingType && b.team === 'PLAYER').length;
      if (existingCount >= maxCount) {
        const blueprint = getBuildingBlueprint(buildingType);
        const plural = maxCount === 1 ? '' : 's';
        return {
          ...state,
          message: { kind: 'error', text: `Only ${maxCount} ${blueprint.name}${plural} can be on your side.` },
        };
      }

      const blueprint = getBuildingBlueprint(buildingType);
      const placementIssue = getBuildingPlacementIssue(state, buildingType, action.cell);
      if (placementIssue) {
        return { ...state, message: { kind: 'error', text: placementIssue } };
      }
      if (state.gold < blueprint.placementCost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${blueprint.placementCost}g to place ${blueprint.name} (you have ${state.gold}g).` },
        };
      }

      const building = createBuilding({
        id: state.nextBuildingId,
        team: 'PLAYER',
        type: buildingType,
        x: action.cell.x,
        y: action.cell.y,
      });

      return {
        ...state,
        gold: state.gold - blueprint.placementCost,
        buildings: [...state.buildings, building],
        nextBuildingId: state.nextBuildingId + 1,
        message: null,
      };
    }
    case 'UPGRADE_UNIT': {
      if (!canModifyDeployments(state)) return state;
      const deploymentIndex = state.deployments.findIndex(d => d.id === action.unitId);
      if (deploymentIndex === -1) return state;

      const deployment = state.deployments[deploymentIndex];
      const currentTier = deployment.tier ?? 1;
      const currentXp = deployment.xp ?? 0;
      if (deployment.lastUpgradeTurn === state.turn) {
        return { ...state, message: { kind: 'info', text: 'This unit already upgraded this turn.' } };
      }
      const requiredXp = xpRequiredForTier(deployment.type, currentTier);
      if (currentXp < requiredXp) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${requiredXp} XP to upgrade this unit (has ${currentXp}).` },
        };
      }

      const blueprint = getUnitBlueprint(deployment.type);
      const upgradeCost = blueprint.placementCost;
      if (state.gold < upgradeCost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${upgradeCost}g to upgrade ${blueprint.name} (you have ${state.gold}g).` },
        };
      }

      const nextTier = currentTier + 1;
      const nextXp = addXp(Math.max(0, currentXp - requiredXp), 0, deployment.type, nextTier);
      const nextStats = getUnitStats(deployment.type, nextTier);
      const prevStats = getUnitStats(deployment.type, currentTier);
      const hpGain = nextStats.maxHp - prevStats.maxHp;

      const deployments = state.deployments.map(d =>
        d.id === deployment.id ? { ...d, tier: nextTier, xp: nextXp, lastUpgradeTurn: state.turn } : d
      );
      const units = state.units.map(u =>
        u.id === deployment.id
          ? {
              ...u,
              tier: nextTier,
              xp: nextXp,
              maxHp: nextStats.maxHp,
              hp: Math.min(nextStats.maxHp, u.hp + hpGain),
            }
          : u
      );

      return {
        ...state,
        gold: state.gold - upgradeCost,
        deployments,
        units,
        message: { kind: 'success', text: `${blueprint.name} upgraded to Tier ${toRoman(nextTier)}.` },
      };
    }
    case 'UPGRADE_ALL_UNITS': {
      if (!canModifyDeployments(state)) return state;

      const upgradeable = state.deployments.filter(d => {
        const currentTier = d.tier ?? 1;
        const currentXp = d.xp ?? 0;
        const requiredXp = xpRequiredForTier(d.type, currentTier);
        return currentXp >= requiredXp && d.lastUpgradeTurn !== state.turn;
      });
      const upgradeableIds = new Set(upgradeable.map(d => d.id));

      if (upgradeable.length === 0) {
        return { ...state, message: { kind: 'info', text: 'No units are ready to upgrade.' } };
      }

      const totalCost = upgradeable.reduce((sum, d) => sum + getUnitBlueprint(d.type).placementCost, 0);
      if (state.gold < totalCost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${totalCost}g to upgrade all units (you have ${state.gold}g).` },
        };
      }

      const upgradeMap = new Map<
        number,
        { nextTier: number; nextXp: number; nextMaxHp: number; hpGain: number }
      >();

      const deployments = state.deployments.map(d => {
        if (!upgradeableIds.has(d.id)) return d;
        const currentTier = d.tier ?? 1;
        const currentXp = d.xp ?? 0;
        const requiredXp = xpRequiredForTier(d.type, currentTier);
        const nextTier = currentTier + 1;
        const nextXp = addXp(Math.max(0, currentXp - requiredXp), 0, d.type, nextTier);
        const nextStats = getUnitStats(d.type, nextTier);
        const prevStats = getUnitStats(d.type, currentTier);
        const hpGain = nextStats.maxHp - prevStats.maxHp;
        upgradeMap.set(d.id, { nextTier, nextXp, nextMaxHp: nextStats.maxHp, hpGain });
        return { ...d, tier: nextTier, xp: nextXp, lastUpgradeTurn: state.turn };
      });

      const units = state.units.map(u => {
        const upgrade = upgradeMap.get(u.id);
        if (!upgrade) return u;
        return {
          ...u,
          tier: upgrade.nextTier,
          xp: upgrade.nextXp,
          maxHp: upgrade.nextMaxHp,
          hp: Math.min(upgrade.nextMaxHp, u.hp + upgrade.hpGain),
        };
      });

      return {
        ...state,
        gold: state.gold - totalCost,
        deployments,
        units,
        message: { kind: 'success', text: `Upgraded ${upgradeable.length} unit${upgradeable.length === 1 ? '' : 's'}.` },
      };
    }
    case 'UPGRADE_BUILDING': {
      if (!canModifyDeployments(state)) return state;

      const building = state.buildings.find(b => b.type === action.buildingType && b.team === 'PLAYER');
      if (!building) {
        const blueprint = getBuildingBlueprint(action.buildingType);
        return { ...state, message: { kind: 'error', text: `${blueprint.name} is not on your side.` } };
      }

      if (!building.upgradeReady) {
        return {
          ...state,
          message: { kind: 'info', text: 'Building upgrades unlock after surviving a battle.' },
        };
      }

      const blueprint = getBuildingBlueprint(building.type);
      const upgradeCost = blueprint.placementCost;
      if (state.gold < upgradeCost) {
        return {
          ...state,
          message: { kind: 'error', text: `Need ${upgradeCost}g to upgrade ${blueprint.name} (you have ${state.gold}g).` },
        };
      }

      const currentTier = building.tier ?? 1;
      const nextTier = currentTier + 1;
      const prevStats = getBuildingStats(building.type, currentTier);
      const nextStats = getBuildingStats(building.type, nextTier);
      const hpGain = nextStats.maxHp - prevStats.maxHp;

      const buildings = state.buildings.map(b =>
        b.id === building.id
          ? {
              ...b,
              tier: nextTier,
              maxHp: nextStats.maxHp,
              hp: Math.min(nextStats.maxHp, b.hp + hpGain),
              upgradeReady: false,
            }
          : b
      );

      return {
        ...state,
        gold: state.gold - upgradeCost,
        buildings,
        message: { kind: 'success', text: `${blueprint.name} upgraded to Tier ${toRoman(nextTier)}.` },
      };
    }
    case 'REMOVE_UNIT': {
      if (!canModifyDeployments(state)) return state;
      return {
        ...state,
        message: { kind: 'info', text: 'Placements are permanent for the match.' },
      };
    }
    case 'START_BATTLE': {
      if (state.phase !== 'DEPLOYMENT') return state;
      return startBattleFromCurrentDeployments(state);
    }
    case 'TICK': {
      if (state.phase !== 'BATTLE') return state;
      if (state.result) return state;

      const timedOutAlready = state.battleTimeMs >= GAME_CONFIG.battleMaxTimeMs;
      const playerCombatantsNow = countCombatants(state.units, state.buildings, 'PLAYER');
      const enemyCombatantsNow = countCombatants(state.units, state.buildings, 'ENEMY');
      if (timedOutAlready || playerCombatantsNow === 0 || enemyCombatantsNow === 0) {
        return endBattle(state, {
          units: state.units,
          battleTimeMs: state.battleTimeMs,
          timedOut: timedOutAlready,
        });
      }

      const battleTimeMs = state.battleTimeMs + action.deltaMs;
      const spawnResult = spawnBuildingUnits({
        grid: state.grid,
        buildings: state.buildings,
        units: state.units,
        nextUnitId: state.nextUnitId,
        deltaMs: action.deltaMs,
      });
      const { units, buildings, xpGains, knightKnightHits, knightArcherHits, knightMageHits } = stepBattle({
        grid: state.grid,
        units: spawnResult.units,
        buildings: spawnResult.buildings,
        deltaMs: action.deltaMs,
      });
      const deployments = applyXpToDeployments(state.deployments, xpGains);
      const enemyDeployments = applyXpToDeployments(state.enemyDeployments, xpGains);
      const sfxEvents: SfxEvent[] = [];
      if (spawnResult.spawnedGoblins > 0) sfxEvents.push({ kind: 'GOBLIN_SPAWN', count: spawnResult.spawnedGoblins });
      if (knightKnightHits > 0) sfxEvents.push({ kind: 'KNIGHT_HIT_KNIGHT', count: knightKnightHits });
      if (knightArcherHits > 0) sfxEvents.push({ kind: 'KNIGHT_HIT_ARCHER', count: knightArcherHits });
      if (knightMageHits > 0) sfxEvents.push({ kind: 'KNIGHT_HIT_MAGE', count: knightMageHits });
      const sfxEventId = sfxEvents.length > 0 ? state.sfxEventId + 1 : state.sfxEventId;

      const playerCombatants = countCombatants(units, buildings, 'PLAYER');
      const enemyCombatants = countCombatants(units, buildings, 'ENEMY');

      const battleDone =
        (playerCombatants === 0 && enemyCombatants === 0) ||
        playerCombatants === 0 ||
        enemyCombatants === 0 ||
        battleTimeMs >= GAME_CONFIG.battleMaxTimeMs;

      if (battleDone) {
        return endBattle({ ...state, deployments, enemyDeployments, sfxEvents, sfxEventId, buildings, nextUnitId: spawnResult.nextUnitId }, {
          units,
          battleTimeMs,
          timedOut: battleTimeMs >= GAME_CONFIG.battleMaxTimeMs,
        });
      }

      return {
        ...state,
        units,
        buildings,
        battleTimeMs,
        deployments,
        enemyDeployments,
        sfxEvents,
        sfxEventId,
        nextUnitId: spawnResult.nextUnitId,
      };
    }
    case 'FORCE_END_BATTLE': {
      if (state.phase !== 'BATTLE') return state;
      if (state.result) return state;
      const battleTimeMs = Math.max(state.battleTimeMs, GAME_CONFIG.battleMaxTimeMs);
      return endBattle(state, { units: state.units, battleTimeMs, timedOut: true });
    }
    default:
      return state;
  }
};

export const createNewGridGameState = (): GameState => ({
  ...createInitialGameState(),
  grid: createGrid(
    GAME_CONFIG.gridRows,
    GAME_CONFIG.gridCols,
    GAME_CONFIG.enemyZoneRows,
    GAME_CONFIG.neutralZoneRows
  ),
});
