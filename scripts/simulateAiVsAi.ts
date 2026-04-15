import { autoPrepPlayer, buildPlayerCells, buildPlayerRowBands, createRng } from '../src/core/ai/autoPrep';
import { GAME_CONFIG } from '../src/core/config/gameConfig';
import type { GameAction } from '../src/core/game/actions';
import { createInitialGameState } from '../src/core/game/initialState';
import { gameReducer } from '../src/core/game/reducer';
import type { GameState } from '../src/core/game/types';
import { Store } from '../src/core/state/Store';

const formatMs = (ms: number): string => `${Math.round(ms)}ms`;

const tickIntermissionToStartBattle = (store: Store<GameState, GameAction>): void => {
  const before = store.getState();
  if (before.phase !== 'DEPLOYMENT' && before.phase !== 'INTERMISSION') return;
  if (before.matchResult) return;

  if (before.intermissionMsRemaining > 0) {
    store.dispatch({ type: 'INTERMISSION_TICK', deltaMs: before.intermissionMsRemaining });
  } else {
    store.dispatch({ type: 'READY' });
  }
};

const runBattleUntilEnd = (store: Store<GameState, GameAction>): void => {
  const start = store.getState();
  if (start.phase !== 'BATTLE') return;
  const maxTicks = Math.ceil(GAME_CONFIG.battleMaxTimeMs / GAME_CONFIG.simulationStepMs) + 20;

  let ticks = 0;
  while (store.getState().phase === 'BATTLE') {
    store.dispatch({ type: 'TICK', deltaMs: GAME_CONFIG.simulationStepMs });
    ticks += 1;
    if (ticks > maxTicks) {
      const s = store.getState();
      throw new Error(
        `Battle exceeded maxTicks=${maxTicks} (turn=${s.turn}) battleTimeMs=${s.battleTimeMs} units=${s.units.length}`
      );
    }
  }
};

const logState = (label: string, state: GameState): void => {
  const playerUnits = state.units.filter(u => u.team === 'PLAYER').length;
  const enemyUnits = state.units.filter(u => u.team === 'ENEMY').length;
  // eslint-disable-next-line no-console
  console.log(
    `[${label}] turn=${state.turn} phase=${state.phase} gold=${state.gold} enemyGold=${state.enemyGold} hp=${state.playerHp}-${state.enemyHp} deployments=${state.deployments.length} enemyDeployments=${state.enemyDeployments.length} units=${playerUnits}v${enemyUnits} prep=${formatMs(state.intermissionMsRemaining)} battle=${formatMs(state.battleTimeMs)}`
  );
};

const main = (): void => {
  const argv = ((globalThis as any).process?.argv as string[] | undefined) ?? [];
  const seed = Number(argv[2] ?? 1337);
  const rand = createRng(seed);
  const store = new Store<GameState, GameAction>(createInitialGameState(), gameReducer);
  const playerCells = buildPlayerCells(store.getState().grid);
  const playerRowBands = buildPlayerRowBands(store.getState().grid, playerCells);

  let lastTurn = store.getState().turn;
  let lastPhase = store.getState().phase;

  logState('start', store.getState());

  const targetTurn = 12;
  const safetyIterations = 2500;

  for (let i = 0; i < safetyIterations; i++) {
    const state = store.getState();
    if (state.matchResult) break;

    if (state.turn > targetTurn && state.phase !== 'BATTLE') break;

    if (state.phase === 'BATTLE') {
      runBattleUntilEnd(store);
      logState('battle-end', store.getState());
      continue;
    }

    autoPrepPlayer(store, playerCells, rand, playerRowBands);
    tickIntermissionToStartBattle(store);

    const afterStart = store.getState();
    if (afterStart.turn !== lastTurn || afterStart.phase !== lastPhase) {
      lastTurn = afterStart.turn;
      lastPhase = afterStart.phase;
      logState('battle-start', afterStart);
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
  (globalThis as any).process?.exit?.(1);
}
