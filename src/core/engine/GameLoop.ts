import type { GameAction } from '../game/actions';
import type { GameState } from '../game/types';
import type { Store } from '../state/Store';
import { GAME_CONFIG } from '../config/gameConfig';

export class GameLoop {
  private readonly store: Store<GameState, GameAction>;
  private readonly stepMs: number;
  private rafId: number | null = null;
  private fallbackId: number | null = null;
  private lastTimeMs = 0;
  private lastFrameAtMs = 0;
  private accumulatorMs = 0;
  private intermissionAccumulatorMs = 0;
  private intermissionDeadlineMs: number | null = null;
  private lastIntermissionRemainingMs = 0;
  private lastPhase: GameState['phase'] | null = null;
  private battleElapsedMs = 0;

  constructor(params: { store: Store<GameState, GameAction>; stepMs: number }) {
    this.store = params.store;
    this.stepMs = params.stepMs;
  }

  public start(): void {
    if (this.rafId !== null) return;
    const now = this.nowMs();
    this.lastTimeMs = now;
    this.lastFrameAtMs = now;
    this.accumulatorMs = 0;
    this.intermissionAccumulatorMs = 0;
    this.intermissionDeadlineMs = null;
    this.lastIntermissionRemainingMs = 0;
    this.lastPhase = null;
    this.battleElapsedMs = 0;
    this.rafId = requestAnimationFrame(this.onFrame);
    this.startFallback();
  }

  public stop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.stopFallback();
  }

  private onFrame = (nowMs: number): void => {
    this.rafId = requestAnimationFrame(this.onFrame);
    this.step(nowMs);
  };

  private step(nowMs: number): void {
    this.lastFrameAtMs = nowMs;
    const state = this.store.getState();
    let frameDeltaMs = Math.max(0, nowMs - this.lastTimeMs);
    this.lastTimeMs = nowMs;

    if (state.phase === 'BATTLE') {
      if (this.lastPhase !== 'BATTLE') {
        this.battleElapsedMs = 0;
        this.accumulatorMs = 0;
        // Avoid huge deltas causing immediate battle timeouts when entering battle.
        frameDeltaMs = 0;
      }
      this.lastPhase = 'BATTLE';
      this.intermissionAccumulatorMs = 0;

      this.battleElapsedMs += frameDeltaMs;

      const actions: GameAction[] = [];
      const maxStepsPerFrame = 8;

      this.accumulatorMs = Math.min(this.accumulatorMs + frameDeltaMs, this.stepMs * maxStepsPerFrame);

      while (this.accumulatorMs >= this.stepMs && actions.length < maxStepsPerFrame) {
        actions.push({ type: 'TICK', deltaMs: this.stepMs });
        this.accumulatorMs -= this.stepMs;
      }

      if (this.battleElapsedMs >= GAME_CONFIG.battleMaxTimeMs) {
        actions.push({ type: 'FORCE_END_BATTLE' });
      }

      this.store.dispatchBatch(actions);
      return;
    }

    if (state.phase === 'INTERMISSION' || (state.phase === 'DEPLOYMENT' && state.intermissionMsRemaining > 0)) {
      if (this.lastPhase !== state.phase) {
        this.intermissionAccumulatorMs = 0;
      }
      if (
        this.lastPhase !== state.phase ||
        this.intermissionDeadlineMs === null ||
        state.intermissionMsRemaining > this.lastIntermissionRemainingMs
      ) {
        this.intermissionDeadlineMs = nowMs + Math.max(0, state.intermissionMsRemaining);
      }
      this.lastPhase = state.phase;
      this.battleElapsedMs = 0;
      this.accumulatorMs = 0;
      this.intermissionAccumulatorMs += frameDeltaMs;

      const timerTickEveryMs = 120;
      if (this.intermissionAccumulatorMs >= timerTickEveryMs) {
        const deltaMs = this.intermissionAccumulatorMs;
        this.intermissionAccumulatorMs = 0;
        this.store.dispatch({ type: 'INTERMISSION_TICK', deltaMs });
      }

      if (
        this.intermissionDeadlineMs !== null &&
        state.intermissionMsRemaining > 0 &&
        nowMs >= this.intermissionDeadlineMs + timerTickEveryMs
      ) {
        this.intermissionDeadlineMs = null;
        this.intermissionAccumulatorMs = 0;
        this.store.dispatch({ type: 'INTERMISSION_TICK', deltaMs: state.intermissionMsRemaining + 1 });
      }

      this.lastIntermissionRemainingMs = state.intermissionMsRemaining;
      return;
    }

    this.lastPhase = state.phase;
    this.battleElapsedMs = 0;
    this.accumulatorMs = 0;
    this.intermissionAccumulatorMs = 0;
    this.intermissionDeadlineMs = null;
    this.lastIntermissionRemainingMs = 0;
  }

  private startFallback(): void {
    if (this.fallbackId !== null) return;
    const intervalMs = Math.max(120, Math.floor(this.stepMs));
    this.fallbackId = window.setInterval(() => {
      if (this.rafId === null) return;
      const now = this.nowMs();
      const thresholdMs = Math.max(250, this.stepMs * 2);
      if (now - this.lastFrameAtMs < thresholdMs) return;
      this.step(now);
    }, intervalMs);
  }

  private stopFallback(): void {
    if (this.fallbackId === null) return;
    window.clearInterval(this.fallbackId);
    this.fallbackId = null;
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }
}
