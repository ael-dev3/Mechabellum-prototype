import { GAME_CONFIG } from '../../core/config/gameConfig';
import { autoPrepPlayer, buildPlayerCells, buildPlayerRowBands, createRng, type PlayerRowBands } from '../../core/ai/autoPrep';
import type { GameAction } from '../../core/game/actions';
import { createInitialGameState } from '../../core/game/initialState';
import { gameReducer } from '../../core/game/reducer';
import type { CellCoord, GameState } from '../../core/game/types';
import { GameLoop } from '../../core/engine/GameLoop';
import { CanvasRenderer } from '../../core/rendering/CanvasRenderer';
import { Store } from '../../core/state/Store';
import type { Screen } from '../Screen';
import { Button } from '../atoms/Button';
import { getSoundEnabled, playSfx, setMatchActive, toggleSound } from '../audio';

export interface ShowcaseScreenOptions {
  onExit: () => void;
}

const SHOWCASE_START_GOLD = 2;
const SHOWCASE_EXIT_HOLD_MS = 900;
const SHOWCASE_RESET_DELAY_MS = 1200;
const SHOWCASE_SFX_VOLUME_SCALE = 0.5;

const createShowcaseState = (seed: number): GameState => {
  const base = createInitialGameState();
  return {
    ...base,
    rngSeed: seed,
    gold: SHOWCASE_START_GOLD,
    enemyGold: SHOWCASE_START_GOLD,
    intermissionMsRemaining: 0,
    message: null,
    matchResult: null,
    result: null,
  };
};

export class ShowcaseScreen implements Screen {
  private readonly container: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: CanvasRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly soundButton: Button;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onPointerEnd: () => void;
  private onStateUnsub: (() => void) | null = null;
  private loop: GameLoop | null = null;
  private store!: Store<GameState, GameAction>;
  private rand!: () => number;
  private playerCells!: CellCoord[];
  private playerRowBands!: PlayerRowBands;
  private autoRunTimer: number | null = null;
  private autoPrepRunning = false;
  private exitHoldTimer: number | null = null;
  private resetTimer: number | null = null;
  private matchAudioActive = false;
  private lastSfxEventId = 0;

  constructor(options: ShowcaseScreenOptions) {
    this.container = document.createElement('div');
    this.container.className = 'screen screen--showcase';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'showcase__canvas-wrap';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'showcase__canvas';
    canvasWrap.appendChild(this.canvas);
    this.container.appendChild(canvasWrap);

    const hud = document.createElement('div');
    hud.className = 'showcase__hud';
    const hudLeft = document.createElement('div');
    hudLeft.className = 'showcase__hud-group';
    const hudRight = document.createElement('div');
    hudRight.className = 'showcase__hud-group';

    const backButton = new Button({
      text: 'Back',
      variant: 'ghost',
      className: 'btn--showcase-back',
      onClick: options.onExit,
    });
    hudLeft.appendChild(backButton.getElement());

    const updateSoundUi = (enabled: boolean): void => {
      this.soundButton.setText(enabled ? 'Audio: On' : 'Audio: Off');
      this.soundButton.toggleClass('btn--sound-on', enabled);
      this.soundButton.toggleClass('btn--sound-off', !enabled);
      this.soundButton.getElement().setAttribute('aria-pressed', enabled ? 'true' : 'false');
    };

    this.soundButton = new Button({
      text: 'Audio: Off',
      variant: 'ghost',
      className: 'btn--sound btn--showcase-sound',
      onClick: () => updateSoundUi(toggleSound()),
    });
    this.soundButton.getElement().setAttribute('aria-label', 'Toggle audio');
    updateSoundUi(getSoundEnabled());
    hudRight.appendChild(this.soundButton.getElement());

    hud.appendChild(hudLeft);
    hud.appendChild(hudRight);
    this.container.appendChild(hud);

    const seed = Math.floor(Date.now() % 0x7fffffff);
    this.renderer = new CanvasRenderer(this.canvas);

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      this.renderer.resizeToCssPixels(cr.width, cr.height);
      this.renderer.render(this.store.getState());
    });
    this.resizeObserver.observe(canvasWrap);

    this.startSimulation(seed);

    this.matchAudioActive = true;
    setMatchActive(true);

    this.onKeyDown = event => {
      if (event.key === 'Escape') {
        options.onExit();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);

    this.onPointerEnd = () => {
      if (this.exitHoldTimer) {
        window.clearTimeout(this.exitHoldTimer);
        this.exitHoldTimer = null;
      }
    };

    this.onPointerDown = event => {
      if (event.pointerType !== 'touch') return;
      this.onPointerEnd();
      this.exitHoldTimer = window.setTimeout(() => {
        this.exitHoldTimer = null;
        options.onExit();
      }, SHOWCASE_EXIT_HOLD_MS);
    };

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerEnd);
    this.canvas.addEventListener('pointercancel', this.onPointerEnd);
    this.canvas.addEventListener('pointerleave', this.onPointerEnd);
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public destroy(): void {
    if (this.autoRunTimer) {
      window.clearTimeout(this.autoRunTimer);
      this.autoRunTimer = null;
    }
    if (this.exitHoldTimer) {
      window.clearTimeout(this.exitHoldTimer);
      this.exitHoldTimer = null;
    }
    if (this.resetTimer) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd);
    this.canvas.removeEventListener('pointerleave', this.onPointerEnd);
    if (this.onStateUnsub) {
      this.onStateUnsub();
      this.onStateUnsub = null;
    }
    if (this.loop) {
      this.loop.stop();
      this.loop = null;
    }
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.matchAudioActive) {
      this.matchAudioActive = false;
      setMatchActive(false);
    }
  }

  private onState(state: GameState): void {
    this.renderer.render(state);
    this.handleSfx(state);
    if (state.matchResult) {
      this.queueReset();
      return;
    }
    this.queueAutoRun(state);
  }

  private queueAutoRun(state: GameState): void {
    if (state.matchResult) return;
    if (state.phase !== 'DEPLOYMENT' && state.phase !== 'INTERMISSION') return;
    if (this.autoRunTimer !== null || this.autoPrepRunning) return;

    this.autoRunTimer = window.setTimeout(() => {
      this.autoRunTimer = null;
      this.autoPrepRunning = true;
      autoPrepPlayer(this.store, this.playerCells, this.rand, this.playerRowBands);
      this.autoPrepRunning = false;
      this.startBattleIfReady();
    }, 0);
  }

  private startBattleIfReady(): void {
    const state = this.store.getState();
    if (state.matchResult) return;
    if (state.phase !== 'DEPLOYMENT' && state.phase !== 'INTERMISSION') return;
    if (state.deployments.length === 0) return;

    if (state.intermissionMsRemaining > 0) {
      this.store.dispatch({ type: 'INTERMISSION_TICK', deltaMs: state.intermissionMsRemaining + 1 });
      return;
    }
    this.store.dispatch({ type: 'READY' });
  }

  private startSimulation(seed: number): void {
    if (this.onStateUnsub) {
      this.onStateUnsub();
      this.onStateUnsub = null;
    }
    if (this.loop) {
      this.loop.stop();
      this.loop = null;
    }
    if (this.autoRunTimer) {
      window.clearTimeout(this.autoRunTimer);
      this.autoRunTimer = null;
    }
    this.autoPrepRunning = false;
    this.lastSfxEventId = 0;
    this.rand = createRng(seed);
    this.store = new Store<GameState, GameAction>(createShowcaseState(seed), gameReducer);
    this.playerCells = buildPlayerCells(this.store.getState().grid);
    this.playerRowBands = buildPlayerRowBands(this.store.getState().grid, this.playerCells);
    this.loop = new GameLoop({ store: this.store, stepMs: GAME_CONFIG.simulationStepMs });
    this.onStateUnsub = this.store.subscribe(state => this.onState(state));
    this.onState(this.store.getState());
    this.loop.start();
  }

  private queueReset(): void {
    if (this.resetTimer !== null) return;
    this.resetTimer = window.setTimeout(() => {
      this.resetTimer = null;
      const seed = Math.floor(Date.now() % 0x7fffffff);
      this.startSimulation(seed);
    }, SHOWCASE_RESET_DELAY_MS);
  }

  private handleSfx(state: GameState): void {
    if (state.sfxEventId === this.lastSfxEventId) return;
    this.lastSfxEventId = state.sfxEventId;
    for (const event of state.sfxEvents) {
      playSfx(event.kind, event.count, SHOWCASE_SFX_VOLUME_SCALE);
    }
  }
}
