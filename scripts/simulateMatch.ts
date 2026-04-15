import { GAME_CONFIG } from '../src/core/config/gameConfig';
import type { GameAction } from '../src/core/game/actions';
import { createInitialGameState } from '../src/core/game/initialState';
import { gameReducer } from '../src/core/game/reducer';
import type { CellCoord, GameState, UnitType } from '../src/core/game/types';
import { isEnemyFlankCell, isPlayerDeployableCell, isPlayerFlankCell } from '../src/core/game/grid';
import { getPlacementFootprint, getUnitBlueprint, isCellInUnitFootprint } from '../src/core/game/unitCatalog';
import { Store } from '../src/core/state/Store';

const formatMs = (ms: number): string => `${Math.round(ms)}ms`;

const buildPlayerCells = (state: GameState): CellCoord[] => {
  const cells: CellCoord[] = [];
  for (let y = 0; y < state.grid.rows; y++) {
    for (let x = 0; x < state.grid.cols; x++) {
      const cell = state.grid.cells[y]?.[x];
      if (!cell) continue;
      const coord = { x, y };
      if (cell.zone === 'PLAYER') {
        if (isPlayerFlankCell(state.grid, coord, GAME_CONFIG.flankColsPerSide)) continue;
        cells.push(coord);
        continue;
      }
      if (isEnemyFlankCell(state.grid, coord, GAME_CONFIG.flankColsPerSide)) {
        cells.push(coord);
      }
    }
  }
  return cells.sort((a, b) => (b.y !== a.y ? b.y - a.y : a.x - b.x));
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
    }
  }
  return true;
};

const pickNextPlacementCell = (state: GameState, playerCells: readonly CellCoord[], unitType: UnitType): CellCoord => {
  const next = playerCells.find(c => isAnchorValidForPlayer(state, unitType, c));
  if (!next) throw new Error('No empty Player-zone cells remain for placement.');
  return next;
};

const canAffordUnlock = (state: GameState, unitType: UnitType): boolean => state.gold >= getUnitBlueprint(unitType).unlockCost;

const canAffordPlacement = (state: GameState, unitType: UnitType): boolean =>
  state.gold >= getUnitBlueprint(unitType).placementCost;

const main = (): void => {
  const store = new Store<GameState, GameAction>(createInitialGameState(), gameReducer);
  store.subscribeErrors(({ action, error }) => {
    const actionText = action ? JSON.stringify(action) : 'null';
    const message = error instanceof Error ? error.message : String(error);
    const s = store.getState();
    const depKeys = Object.keys(s.deployments);
    const depTypes = s.deployments.map(d => d?.type);
    // eslint-disable-next-line no-console
    console.error(`[reducer-error] action=${actionText} error=${message}`);
    // eslint-disable-next-line no-console
    console.error(
      `[reducer-error-state] turn=${s.turn} phase=${s.phase} gold=${s.gold} deploymentsLen=${s.deployments.length} deploymentsKeys=${depKeys.join(
        ','
      )} deploymentsTypes=${JSON.stringify(depTypes)} selected=${String(s.selectedUnitType)}`
    );
    if (error instanceof Error && error.stack) {
      // eslint-disable-next-line no-console
      console.error(error.stack);
    }
  });

  const playerCells = buildPlayerCells(store.getState());
  const dispatch = (action: GameAction): void => store.dispatch(action);

  let lastTurn = store.getState().turn;
  let lastPhase = store.getState().phase;

  const logState = (label: string): void => {
    const s = store.getState();
    const playerUnits = s.units.filter(u => u.team === 'PLAYER').length;
    const enemyUnits = s.units.filter(u => u.team === 'ENEMY').length;
    // eslint-disable-next-line no-console
    console.log(
      `[${label}] turn=${s.turn} phase=${s.phase} gold=${s.gold} hp=${s.playerHp}-${s.enemyHp} deployments=${s.deployments.length} units=${playerUnits}v${enemyUnits} prep=${formatMs(s.intermissionMsRemaining)} battle=${formatMs(s.battleTimeMs)}`
    );
  };

  const maybeUnlock = (unitType: UnitType): void => {
    const s = store.getState();
    if (s.unlockedUnits[unitType]) return;
    if (!canAffordUnlock(s, unitType)) return;
    dispatch({ type: 'SELECT_UNIT', unitType });
  };

  const maybePlace = (unitType: UnitType): boolean => {
    const s = store.getState();
    if (s.phase !== 'DEPLOYMENT' && s.phase !== 'INTERMISSION') return false;
    if (s.placementsUsedThisTurn >= s.placementSlots) return false;
    if (!s.unlockedUnits[unitType]) return false;
    if (!canAffordPlacement(s, unitType)) return false;
    const cell = pickNextPlacementCell(s, playerCells, unitType);
    dispatch({ type: 'SELECT_UNIT', unitType });
    dispatch({ type: 'PLACE_UNIT', cell });
    return true;
  };

  const autoPrep = (): void => {
    const s = store.getState();
    if (s.phase !== 'DEPLOYMENT' && s.phase !== 'INTERMISSION') return;

    maybeUnlock('KNIGHT');
    if (s.turn >= 2) maybeUnlock('ARCHER');
    if (s.turn >= 4) maybeUnlock('MAGE');
    if (s.turn >= 6) maybeUnlock('GOLEM');

    const placed =
      (s.turn >= 7 && maybePlace('GOLEM')) ||
      (s.turn >= 5 && maybePlace('MAGE')) ||
      (s.turn >= 3 && maybePlace('ARCHER')) ||
      maybePlace('KNIGHT');
    if (placed) logState('placed');
  };

  const tickIntermissionToStartBattle = (): void => {
    const before = store.getState();
    if (before.phase !== 'DEPLOYMENT' && before.phase !== 'INTERMISSION') return;
    if (before.matchResult) return;

    if (before.intermissionMsRemaining > 0) {
      dispatch({ type: 'INTERMISSION_TICK', deltaMs: before.intermissionMsRemaining });
    } else {
      dispatch({ type: 'READY' });
    }

    const after = store.getState();
    if (after.phase !== 'BATTLE') {
      throw new Error(
        `Expected auto-start into BATTLE, but got phase=${after.phase} (turn=${after.turn}) message=${after.message?.text ?? 'null'}`
      );
    }
  };

  const runBattleUntilEnd = (): void => {
    const start = store.getState();
    if (start.phase !== 'BATTLE') return;
    const maxTicks = Math.ceil(GAME_CONFIG.battleMaxTimeMs / GAME_CONFIG.simulationStepMs) + 20;

    let ticks = 0;
    while (store.getState().phase === 'BATTLE') {
      dispatch({ type: 'TICK', deltaMs: GAME_CONFIG.simulationStepMs });
      ticks += 1;
      if (ticks > maxTicks) {
        const s = store.getState();
        throw new Error(
          `Battle exceeded maxTicks=${maxTicks} (turn=${s.turn}) battleTimeMs=${s.battleTimeMs} units=${s.units.length}`
        );
      }
    }
  };

  logState('start');

  const targetTurn = 10;
  const safetyIterations = 2000;

  for (let i = 0; i < safetyIterations; i++) {
    const state = store.getState();
    if (state.matchResult) break;

    if (state.turn > targetTurn && state.phase !== 'BATTLE') break;

    if (state.phase === 'BATTLE') {
      runBattleUntilEnd();
      const end = store.getState();
      logState('battle-end');
      if (end.turn < lastTurn) throw new Error('Turn went backwards.');
      continue;
    }

    autoPrep();
    tickIntermissionToStartBattle();

    const afterStart = store.getState();
    if (afterStart.turn !== lastTurn || afterStart.phase !== lastPhase) {
      lastTurn = afterStart.turn;
      lastPhase = afterStart.phase;
      logState('battle-start');
    }
  }

  const end = store.getState();
  if (end.matchResult) {
    // eslint-disable-next-line no-console
    console.log(`[done] matchResult=${end.matchResult.winner} reason=${end.matchResult.reason} hp=${end.playerHp}-${end.enemyHp}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[done] reached turn=${end.turn} phase=${end.phase} hp=${end.playerHp}-${end.enemyHp}`);
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[sim-failed] ${message}`);
  if (error instanceof Error && error.stack) {
    // eslint-disable-next-line no-console
    console.error(error.stack);
  }
  // Non-zero exit for CI-ish usage (without relying on Node types).
  (globalThis as any).process?.exit?.(1);
}
