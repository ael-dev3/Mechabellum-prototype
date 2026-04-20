import { GAME_CONFIG } from '../src/core/config/gameConfig';
import { createBuilding, getBuildingBlueprint } from '../src/core/game/buildingCatalog';
import { spawnEnemyUnits } from '../src/core/game/enemySpawner';
import { isPlayerDeployableCell } from '../src/core/game/grid';
import { createInitialGameState } from '../src/core/game/initialState';
import { gameReducer } from '../src/core/game/reducer';
import { stepBattle } from '../src/core/game/simulateBattle';
import { createUnit } from '../src/core/game/unitCatalog';
import type { CellCoord, DeploymentUnit, GameState } from '../src/core/game/types';

const fail = (message: string): never => {
  throw new Error(message);
};

const assertEqual = <T>(actual: T, expected: T, message: string): void => {
  if (actual !== expected) {
    fail(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
};

const assertOk = (value: unknown, message: string): void => {
  if (!value) {
    fail(message);
  }
};

const assertSameReference = <T>(actual: T, expected: T, message: string): void => {
  if (actual !== expected) {
    fail(message);
  }
};

const assertDeepEqual = (
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  message: string
): void => {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    fail(`${message} (expected ${expectedText}, got ${actualText})`);
  }
};

const runTest = (name: string, testFn: () => void): void => {
  try {
    testFn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
};

const findFirstPlayerDeployableCell = (state: GameState): CellCoord => {
  for (let y = 0; y < state.grid.rows; y++) {
    for (let x = 0; x < state.grid.cols; x++) {
      const cell = { x, y };
      if (
        isPlayerDeployableCell(
          state.grid,
          cell,
          state.turn,
          GAME_CONFIG.flankColsPerSide,
          GAME_CONFIG.flankUnlockTurn
        )
      ) {
        return cell;
      }
    }
  }
  throw new Error('No player deployable cell found.');
};

const assertFullGoblinSquad = (deployments: readonly DeploymentUnit[]): void => {
  assertEqual(deployments.length, 6, 'Goblin Squad should occupy all 6 cells of its 3x2 formation.');
  const keys = new Set(deployments.map(deployment => `${deployment.x},${deployment.y}`));
  assertEqual(keys.size, 6, 'Goblin Squad cells should be unique.');

  const xs = deployments.map(deployment => deployment.x);
  const ys = deployments.map(deployment => deployment.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  assertEqual(maxX - minX + 1, 3, 'Goblin Squad width should stay 3 cells.');
  assertEqual(maxY - minY + 1, 2, 'Goblin Squad height should stay 2 cells.');

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      assertOk(keys.has(`${x},${y}`), `Missing Goblin Squad cell ${x},${y}.`);
    }
  }
};

runTest('enemy mirror avoidance replaces a whole placement instead of spawning a singleton goblin', () => {
  const initial = createInitialGameState();
  const result = spawnEnemyUnits({
    grid: initial.grid,
    playerUnits: [createUnit({ id: 1, team: 'PLAYER', type: 'KNIGHT', x: 5, y: 12 })],
    buildings: [],
    existingEnemyDeployments: [],
    nextUnitId: 100,
    rngSeed: 2,
    turn: 3,
    enemyGoldDebtNextTurn: 0,
    enemyGold: 1,
    enemyUnlockedUnits: {
      KNIGHT: true,
      GOBLIN: true,
      ARCHER: false,
      SNIPER: false,
      MAGE: false,
      GOLEM: false,
    },
    enemyPlacementSlots: 1,
    enemyNextPlacementSlotCost: 2,
  });

  const goblinDeployments = result.enemyDeployments.filter(deployment => deployment.type === 'GOBLIN');
  assertFullGoblinSquad(goblinDeployments);
});

runTest('enemy AI can take a loan to create an opening deployment', () => {
  const initial = createInitialGameState();
  const result = spawnEnemyUnits({
    grid: initial.grid,
    playerUnits: [],
    buildings: [],
    existingEnemyDeployments: [],
    nextUnitId: 1,
    rngSeed: 1,
    turn: 1,
    enemyGoldDebtNextTurn: 0,
    enemyGold: 0,
    enemyUnlockedUnits: {
      KNIGHT: false,
      GOBLIN: false,
      ARCHER: false,
      SNIPER: false,
      MAGE: false,
      GOLEM: false,
    },
    enemyPlacementSlots: 1,
    enemyNextPlacementSlotCost: 2,
  });

  assertOk(result.enemyDeployments.length > 0, 'Enemy loan should enable at least one opening placement.');
  assertEqual(result.nextEnemyGoldDebtNextTurn, 3, 'Enemy loan should schedule 3 gold debt for the next turn.');
});

runTest('building placement does not consume unit placement slots', () => {
  const initial = createInitialGameState();
  const placementCell = findFirstPlayerDeployableCell(initial);
  const state: GameState = {
    ...initial,
    phase: 'INTERMISSION',
    turn: 3,
    gold: 10,
    placementSlots: 1,
    placementsUsedThisTurn: 1,
    selectedBuildingType: 'GOLD_MINE',
    unlockedBuildings: {
      ...initial.unlockedBuildings,
      GOLD_MINE: true,
    },
    selectedBuildingId: null,
    message: null,
  };

  const nextState = gameReducer(state, { type: 'PLACE_BUILDING', cell: placementCell });

  assertEqual(nextState.buildings.length, 1, 'Building should place even when all unit placement slots are used.');
  assertEqual(nextState.placementsUsedThisTurn, 1, 'Building placement must not change unit placement usage.');
  assertEqual(
    nextState.gold,
    10 - getBuildingBlueprint('GOLD_MINE').placementCost,
    'Building placement should still charge its gold cost.'
  );
});

runTest('ranged units hold position when already in diagonal range but waiting on cooldown', () => {
  const initial = createInitialGameState();
  const archer = {
    ...createUnit({ id: 1, team: 'PLAYER', type: 'ARCHER', x: 4, y: 10 }),
    attackCooldownMs: 600,
    moveCooldownMs: 0,
  };
  const knight = {
    ...createUnit({ id: 2, team: 'ENEMY', type: 'KNIGHT', x: 5, y: 9 }),
    attackCooldownMs: 600,
    moveCooldownMs: 600,
  };

  const result = stepBattle({
    grid: initial.grid,
    units: [archer, knight],
    buildings: [],
    deltaMs: 100,
  });

  const nextArcher = result.units.find(unit => unit.id === archer.id);
  const nextKnight = result.units.find(unit => unit.id === knight.id);
  if (!nextArcher) {
    fail('Archer should still be alive after a no-attack cooldown tick.');
  }
  if (!nextKnight) {
    fail('Knight should still be alive after a no-attack cooldown tick.');
  }
  const archerAfterTick = nextArcher!;
  const knightAfterTick = nextKnight!;
  assertDeepEqual(
    { x: archerAfterTick.x, y: archerAfterTick.y },
    { x: archer.x, y: archer.y },
    'Archer should hold position instead of jittering while already in diagonal range.'
  );
  assertDeepEqual(
    { x: knightAfterTick.x, y: knightAfterTick.y },
    { x: knight.x, y: knight.y },
    'Target unit should remain in place when its own move cooldown has not expired.'
  );
});

runTest('finished matches reject unit unlocks and placements', () => {
  const initial = createInitialGameState();
  const placementCell = findFirstPlayerDeployableCell(initial);
  const finishedState: GameState = {
    ...initial,
    phase: 'INTERMISSION',
    turn: 4,
    gold: 10,
    matchResult: { winner: 'PLAYER', reason: 'HP' },
    unlockedUnits: {
      ...initial.unlockedUnits,
      KNIGHT: true,
    },
    selectedUnitType: 'KNIGHT',
  };

  const afterUnlockAttempt = gameReducer(finishedState, { type: 'SELECT_UNIT', unitType: 'ARCHER' });
  const afterPlacementAttempt = gameReducer(finishedState, { type: 'PLACE_UNIT', cell: placementCell });

  assertSameReference(afterUnlockAttempt, finishedState, 'Finished matches must ignore post-game unit unlock attempts.');
  assertSameReference(afterPlacementAttempt, finishedState, 'Finished matches must ignore post-game unit placements.');
});

runTest('finished matches reject building placement, unit upgrades, and building upgrades', () => {
  const initial = createInitialGameState();
  const placementCell = findFirstPlayerDeployableCell(initial);
  const placedKnight = {
    id: 101,
    type: 'KNIGHT' as const,
    x: placementCell.x,
    y: placementCell.y,
    xp: 999,
    tier: 1,
    placedTurn: 1,
  };
  const placedMine = createBuilding({
    id: 201,
    team: 'PLAYER',
    type: 'GOLD_MINE',
    x: placementCell.x + 4,
    y: placementCell.y,
    tier: 1,
    upgradeReady: true,
  });
  const finishedState: GameState = {
    ...initial,
    phase: 'INTERMISSION',
    turn: 4,
    gold: 10,
    matchResult: { winner: 'PLAYER', reason: 'HP' },
    unlockedBuildings: {
      ...initial.unlockedBuildings,
      GOLD_MINE: true,
    },
    selectedBuildingType: 'GOLD_MINE',
    selectedBuildingId: placedMine.id,
    deployments: [placedKnight],
    units: [createUnit({ id: placedKnight.id, team: 'PLAYER', type: 'KNIGHT', x: placedKnight.x, y: placedKnight.y, xp: placedKnight.xp, tier: placedKnight.tier })],
    buildings: [placedMine],
  };

  const afterBuildingPlacement = gameReducer(finishedState, { type: 'PLACE_BUILDING', cell: placementCell });
  const afterUnitUpgrade = gameReducer(finishedState, { type: 'UPGRADE_UNIT', unitId: placedKnight.id });
  const afterBuildingUpgrade = gameReducer(finishedState, { type: 'UPGRADE_BUILDING', buildingId: placedMine.id });

  assertSameReference(afterBuildingPlacement, finishedState, 'Finished matches must ignore post-game building placements.');
  assertSameReference(afterUnitUpgrade, finishedState, 'Finished matches must ignore post-game unit upgrades.');
  assertSameReference(afterBuildingUpgrade, finishedState, 'Finished matches must ignore post-game building upgrades.');
});

runTest('selected building upgrades target the clicked copy instead of the first building of that type', () => {
  const initial = createInitialGameState();
  const firstTower = createBuilding({
    id: 301,
    team: 'PLAYER',
    type: 'ARCHER_TOWER',
    x: 2,
    y: 18,
    tier: 2,
    upgradeReady: false,
  });
  const secondTower = createBuilding({
    id: 302,
    team: 'PLAYER',
    type: 'ARCHER_TOWER',
    x: 8,
    y: 18,
    tier: 1,
    upgradeReady: true,
  });
  const state: GameState = {
    ...initial,
    phase: 'INTERMISSION',
    turn: 5,
    gold: 10,
    unlockedBuildings: {
      ...initial.unlockedBuildings,
      ARCHER_TOWER: true,
    },
    selectedBuildingType: 'ARCHER_TOWER',
    selectedBuildingId: null,
    buildings: [firstTower, secondTower],
    message: null,
  };

  const selectedState = gameReducer(state, { type: 'SELECT_PLACED_BUILDING', buildingId: secondTower.id });
  assertEqual(selectedState.selectedBuildingId, secondTower.id, 'Clicking a placed building should select that exact copy.');

  const upgradedState = gameReducer(selectedState, { type: 'UPGRADE_BUILDING', buildingId: secondTower.id });
  const upgradedFirstTower = upgradedState.buildings.find(building => building.id === firstTower.id);
  const upgradedSecondTower = upgradedState.buildings.find(building => building.id === secondTower.id);

  assertOk(upgradedFirstTower, 'The first tower should still exist after upgrading a different tower.');
  assertOk(upgradedSecondTower, 'The selected tower should still exist after upgrading.');
  assertEqual(upgradedFirstTower!.tier, 2, 'The first tower must keep its own tier.');
  assertEqual(upgradedSecondTower!.tier, 2, 'The selected tower should gain the upgrade.');
  assertEqual(upgradedSecondTower!.upgradeReady, false, 'The upgraded tower should consume its ready state.');
  assertEqual(upgradedState.gold, 7, 'Upgrading the selected tower should charge the tower upgrade cost once.');
});

console.log('[done] gameplay regression scenarios passed');
