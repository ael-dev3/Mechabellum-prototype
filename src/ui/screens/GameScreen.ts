import { GAME_CONFIG } from '../../core/config/gameConfig';
import type { GameAction } from '../../core/game/actions';
import type { BuildingType, GameState, RoundUnitSummary, UnitType, CellCoord } from '../../core/game/types';
import { createInitialGameState } from '../../core/game/initialState';
import { gameReducer } from '../../core/game/reducer';
import {
  getAllUnitTypes,
  getPlacementFootprint,
  getPlacementOffsets,
  getUnitBlueprint,
  getUnitFootprint,
  getUnitMoveSpeed,
  getUnitStats,
} from '../../core/game/unitCatalog';
import {
  getAllBuildingTypes,
  getBuildingAttackStats,
  getBuildingBlueprint,
  getBuildingFootprint,
  getBuildingSpawnInfo,
  getBuildingStats,
} from '../../core/game/buildingCatalog';
import { toRoman, xpRequiredForTier } from '../../core/game/xp';
import { GameLoop } from '../../core/engine/GameLoop';
import { CanvasInput } from '../../core/input/CanvasInput';
import { CanvasRenderer } from '../../core/rendering/CanvasRenderer';
import { Store } from '../../core/state/Store';
import { Button } from '../atoms/Button';
import { Tooltip } from '../atoms/Tooltip';
import type { Screen } from '../Screen';
import { getBuildingAt, getCellZone, getUnitAt, isEnemyFlankCell, isPlayerFlankCell } from '../../core/game/grid';
import { playSfx, setMatchActive } from '../audio';

export interface GameScreenOptions {
  onExit: () => void;
}

type DebugLevel = 'info' | 'warn' | 'error';

interface DebugLogEntry {
  id: number;
  tsMs: number;
  level: DebugLevel;
  message: string;
  details?: string;
}

export class GameScreen implements Screen {
  private readonly container: HTMLDivElement;
  private readonly store: Store<GameState, GameAction>;
  private readonly loop: GameLoop;
  private readonly renderer: CanvasRenderer;
  private readonly input: CanvasInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly tooltip: Tooltip;
  private readonly tooltipUnsubs: Array<() => void> = [];
  private upgradeAllTooltipUnsub: (() => void) | null = null;
  private lastUpgradeAllTooltip = '';
  private readonly canvas: HTMLCanvasElement;
  private lastCanvasTooltipKey: string | null = null;
  private pendingCanvasTooltipKey: string | null = null;
  private canvasTooltipTimer: number | null = null;
  private activeErrorToast: { element: HTMLDivElement; timeoutId: number | null } | null = null;
  private lastSfxEventId = 0;
  private matchAudioActive = false;

  private readonly phasePill: HTMLSpanElement;
  private readonly turnPill: HTMLSpanElement;
  private readonly goldPill: HTMLSpanElement;
  private readonly hpPill: HTMLSpanElement;
  private readonly placementsPill: HTMLSpanElement;
  private readonly unitsPill: HTMLSpanElement;
  private readonly roundBanner: HTMLDivElement;
  private readonly unitInfoEl: HTMLDivElement;
  private readonly unitInfoTitleEl: HTMLDivElement;
  private readonly unitInfoStatsEl: HTMLDivElement;
  private readonly unitInfoHintEl: HTMLDivElement;
  private readonly selectedUnitPanel: HTMLDivElement;
  private readonly selectedUnitSummaryEl: HTMLDivElement;
  private readonly selectedUnitSelectHintEl: HTMLDivElement;
  private readonly selectedUnitStatsEl: HTMLDivElement;
  private readonly selectedUnitXpEl: HTMLDivElement;
  private readonly selectedUnitXpBar: HTMLDivElement;
  private readonly selectedUnitXpFill: HTMLDivElement;
  private readonly selectedUnitLevelsEl: HTMLDivElement;
  private readonly selectedUnitReqEl: HTMLDivElement;
  private readonly selectedUnitTechEl: HTMLDivElement;
  private readonly upgradeUnitBtn: Button;
  private readonly buildingUpgradePanel: HTMLDivElement;
  private readonly buildingUpgradeSummaryEl: HTMLDivElement;
  private readonly buildingUpgradeStatsEl: HTMLDivElement;
  private readonly buildingUpgradeHintEl: HTMLDivElement;
  private readonly upgradeBuildingBtn: Button;
  private readonly messageEl: HTMLDivElement;
  private readonly buySlotBtn: Button;
  private readonly loanBtn: Button;
  private readonly upgradeAllBtn: Button;
  private readonly nextTurnBtn: Button;
  private readonly unitButtons: Map<UnitType, Button> = new Map();
  private readonly buildingButtons: Map<BuildingType, Button> = new Map();
  private readonly buildingCountEls: Map<BuildingType, HTMLDivElement> = new Map();
  private readonly buildingTooltipUnsubs: Map<BuildingType, () => void> = new Map();
  private readonly buildingTooltipText: Map<BuildingType, string> = new Map();

  private readonly roundResultOverlay: HTMLDivElement;
  private readonly roundResultTitleEl: HTMLDivElement;
  private readonly roundResultSubtitleEl: HTMLDivElement;
  private readonly roundResultDamageWrap: HTMLDivElement;
  private readonly roundResultDamagePlayerEl: HTMLDivElement;
  private readonly roundResultDamageEnemyEl: HTMLDivElement;
  private readonly roundResultTimerEl: HTMLDivElement;
  private readonly roundResultUnitsEl: HTMLDivElement;
  private readonly roundResultProceedBtn: Button;
  private roundResultVisible = false;
  private roundResultAutoCloseTimer: number | null = null;
  private roundResultAutoCloseAtMs: number | null = null;
  private lastRoundResultCountdown: number | null = null;
  private activeRoundResultRound: number | null = null;
  private dismissedRoundResultRound: number | null = null;

  private readonly toastStack: HTMLDivElement;
  private readonly debugStatsEl: HTMLDivElement;
  private readonly debugLogsEl: HTMLDivElement;
  private debugCollapsed = false;
  private debugVerbose = false;
  private debugEntries: DebugLogEntry[] = [];
  private debugNextEntryId = 1;
  private debugRenderQueued = false;
  private readonly debugUnsubs: Array<() => void> = [];
  private debugScanTimer: number | null = null;
  private lastDispatchAtMs = 0;
  private lastTimerProgressAtMs = 0;
  private lastTimerRemainingMs = 0;
  private lastBattleProgressAtMs = 0;
  private lastBattleTimeMs = 0;
  private lastVerboseBattleSecond: number | null = null;
  private lastVerboseIntermissionSecond: number | null = null;
  private lastInterventionAtMs = 0;
  private lastObservedPhase: GameState['phase'] | null = null;
  private lastObservedTurn: number | null = null;
  private lastObservedPlayerHp: number | null = null;
  private lastObservedEnemyHp: number | null = null;
  private lastObservedMatchResult: GameState['matchResult'] | null = null;

  private readonly onWindowError = (event: ErrorEvent): void => {
    const message = event.message || 'Uncaught error';
    const details = [
      event.filename ? `file=${event.filename}` : null,
      Number.isFinite(event.lineno) ? `line=${event.lineno}` : null,
      Number.isFinite(event.colno) ? `col=${event.colno}` : null,
      event.error instanceof Error ? `stack=${event.error.stack ?? ''}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    this.logDebug('error', message, details || undefined);
    this.showToast('error', message);
  };

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    this.logDebug('error', 'Unhandled promise rejection', reason.stack ?? reason.message);
    this.showToast('error', reason.message || 'Unhandled promise rejection');
  };

  constructor(options: GameScreenOptions) {
    this.container = document.createElement('div');
    this.container.className = 'screen screen--game';
    this.tooltip = new Tooltip();

    const game = document.createElement('div');
    game.className = 'game';

    const leftPanel = document.createElement('div');
    leftPanel.className = 'card game__sidebar game__sidebar--left';

    const rightPanel = document.createElement('div');
    rightPanel.className = 'card game__sidebar game__sidebar--right';

    const mapCard = document.createElement('div');
    mapCard.className = 'card game__map-card';

    this.roundBanner = document.createElement('div');
    this.roundBanner.className = 'game__round-banner';
    this.roundBanner.textContent = 'Round 1';
    mapCard.appendChild(this.roundBanner);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'game__canvas-wrap';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game__canvas';
    canvasWrap.appendChild(this.canvas);
    mapCard.appendChild(canvasWrap);

    const mapControls = document.createElement('div');
    mapControls.className = 'game__map-controls';
    mapControls.textContent = 'Drag to pan | Scroll to move | Hold Ctrl + Scroll to zoom';
    mapCard.appendChild(mapControls);

    const mapLegend = document.createElement('div');
    mapLegend.className = 'game__map-legend';

    const makeLegendSwatch = (className: string, tooltipText: string): HTMLButtonElement => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'game__map-legend-item';
      item.setAttribute('aria-label', tooltipText);
      const swatch = document.createElement('span');
      swatch.className = `game__map-legend-swatch ${className}`;
      item.appendChild(swatch);
      this.tooltipUnsubs.push(this.tooltip.bind(item, { text: tooltipText, placement: 'top' }));
      return item;
    };

    mapLegend.appendChild(
      makeLegendSwatch(
        'game__map-legend-swatch--green',
        `Green: player flank deploy (turn ${GAME_CONFIG.flankUnlockTurn}+)`
      )
    );
    mapLegend.appendChild(
      makeLegendSwatch(
        'game__map-legend-swatch--red',
        `Red: enemy flank deploy (turn ${GAME_CONFIG.flankUnlockTurn}+)`
      )
    );
    mapLegend.appendChild(
      makeLegendSwatch(
        'game__map-legend-swatch--grey',
        `Grey: locked before turn ${GAME_CONFIG.flankUnlockTurn}`
      )
    );
    mapCard.appendChild(mapLegend);

    const navRow = document.createElement('div');
    navRow.className = 'game__sidebar-header';

    const backBtn = new Button({ text: 'Back', variant: 'ghost', onClick: options.onExit });
    this.tooltipUnsubs.push(this.tooltip.bind(backBtn.getElement(), { text: 'Return to the main menu.' }));

    const titleWrap = document.createElement('div');
    titleWrap.className = 'game__brand';
    const title = document.createElement('h2');
    title.textContent = 'MB';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Autobattle map';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    navRow.appendChild(backBtn.getElement());
    navRow.appendChild(titleWrap);

    this.phasePill = document.createElement('span');
    this.phasePill.className = 'pill pill--phase';
    this.phasePill.textContent = 'Phase: Deployment';

    this.turnPill = document.createElement('span');
    this.turnPill.className = 'pill pill--turn';
    this.turnPill.textContent = 'Turn: 1';

    this.goldPill = document.createElement('span');
    this.goldPill.className = 'pill pill--gold';
    this.goldPill.textContent = 'Gold: 2';

    this.hpPill = document.createElement('span');
    this.hpPill.className = 'pill pill--hp';
    this.hpPill.textContent = 'HP: You 50 | Enemy 50';

    this.placementsPill = document.createElement('span');
    this.placementsPill.className = 'pill pill--placements';
    this.placementsPill.textContent = 'Unit placements: 0/1';

    this.unitsPill = document.createElement('span');
    this.unitsPill.className = 'pill pill--units';
    this.unitsPill.textContent = 'Units: 0 vs 0';

    const statsTitle = document.createElement('h3');
    statsTitle.textContent = 'Match';

    const statsStack = document.createElement('div');
    statsStack.className = 'game__stats';
    statsStack.appendChild(this.phasePill);
    statsStack.appendChild(this.turnPill);
    statsStack.appendChild(this.goldPill);
    statsStack.appendChild(this.hpPill);
    statsStack.appendChild(this.placementsPill);
    statsStack.appendChild(this.unitsPill);

    const divider1 = document.createElement('div');
    divider1.className = 'divider';

    const controlsTitle = document.createElement('h3');
    controlsTitle.textContent = 'Actions';

    const controlsCol = document.createElement('div');
    controlsCol.className = 'game__controls';

    const unitTitle = document.createElement('h3');
    unitTitle.textContent = 'Units';
    rightPanel.appendChild(unitTitle);

    const unitRow = document.createElement('div');
    unitRow.className = 'game__unit-grid';

    for (const unitType of getAllUnitTypes()) {
      const blueprint = getUnitBlueprint(unitType);
      const aoeText = blueprint.aoeRadius ? `, AOE ${blueprint.aoeRadius}` : '';
      const footprint = getPlacementFootprint(unitType);
      const squadSize = getPlacementOffsets(unitType).length;
      const sizeText = footprint.width > 1 || footprint.height > 1 ? ` Size ${footprint.width}x${footprint.height}.` : '';
      const squadText = squadSize > 1 ? ` Squad x${squadSize}.` : '';
      const moveSpeed = getUnitMoveSpeed(unitType);
      const moveSpeedText = moveSpeed.toFixed(2);
      const button = new Button({
        text: `${blueprint.name}`,
        variant: 'ghost',
        onClick: () => this.store.dispatch({ type: 'SELECT_UNIT', unitType }),
      });
      this.tooltipUnsubs.push(
        this.tooltip.bind(button.getElement(), {
          text: `${blueprint.name}: Unlock ${blueprint.unlockCost}g (once). Place ${blueprint.placementCost}g. HP ${blueprint.maxHp}, ATK ${blueprint.attackDamage}, RNG ${blueprint.attackRange}${aoeText}, MOV ${moveSpeedText}.${sizeText}${squadText}`,
        })
      );
      unitRow.appendChild(button.getElement());
      this.unitButtons.set(unitType, button);
    }

    rightPanel.appendChild(unitRow);

    this.unitInfoEl = document.createElement('div');
    this.unitInfoEl.className = 'unit-info';

    this.unitInfoTitleEl = document.createElement('div');
    this.unitInfoTitleEl.className = 'unit-info__title';
    this.unitInfoEl.appendChild(this.unitInfoTitleEl);

    this.unitInfoStatsEl = document.createElement('div');
    this.unitInfoStatsEl.className = 'unit-info__stats';
    this.unitInfoEl.appendChild(this.unitInfoStatsEl);

    this.unitInfoHintEl = document.createElement('div');
    this.unitInfoHintEl.className = 'unit-info__hint';
    this.unitInfoEl.appendChild(this.unitInfoHintEl);

    rightPanel.appendChild(this.unitInfoEl);

    this.selectedUnitPanel = document.createElement('div');
    this.selectedUnitPanel.className = 'unit-upgrade';

    const selectedTitle = document.createElement('div');
    selectedTitle.className = 'unit-upgrade__title';
    selectedTitle.textContent = 'Unit Upgrades';
    this.selectedUnitPanel.appendChild(selectedTitle);

    this.selectedUnitSummaryEl = document.createElement('div');
    this.selectedUnitSummaryEl.className = 'unit-upgrade__summary';
    this.selectedUnitPanel.appendChild(this.selectedUnitSummaryEl);

    this.selectedUnitSelectHintEl = document.createElement('div');
    this.selectedUnitSelectHintEl.className = 'unit-upgrade__note';
    this.selectedUnitPanel.appendChild(this.selectedUnitSelectHintEl);

    this.selectedUnitStatsEl = document.createElement('div');
    this.selectedUnitStatsEl.className = 'unit-upgrade__stats';
    this.selectedUnitPanel.appendChild(this.selectedUnitStatsEl);

    this.selectedUnitXpEl = document.createElement('div');
    this.selectedUnitXpEl.className = 'unit-upgrade__xp';
    this.selectedUnitPanel.appendChild(this.selectedUnitXpEl);

    this.selectedUnitXpBar = document.createElement('div');
    this.selectedUnitXpBar.className = 'unit-upgrade__bar';
    this.selectedUnitXpBar.setAttribute('role', 'progressbar');
    this.selectedUnitXpBar.setAttribute('aria-label', 'XP progress');
    this.selectedUnitXpFill = document.createElement('div');
    this.selectedUnitXpFill.className = 'unit-upgrade__bar-fill';
    this.selectedUnitXpBar.appendChild(this.selectedUnitXpFill);
    this.selectedUnitPanel.appendChild(this.selectedUnitXpBar);

    const levelsBlock = document.createElement('div');
    levelsBlock.className = 'unit-upgrade__block';
    const levelsTitle = document.createElement('div');
    levelsTitle.className = 'unit-upgrade__subtitle';
    levelsTitle.textContent = 'Levels';
    levelsBlock.appendChild(levelsTitle);

    this.selectedUnitLevelsEl = document.createElement('div');
    this.selectedUnitLevelsEl.className = 'unit-upgrade__levels';
    levelsBlock.appendChild(this.selectedUnitLevelsEl);

    this.selectedUnitReqEl = document.createElement('div');
    this.selectedUnitReqEl.className = 'unit-upgrade__hint';
    levelsBlock.appendChild(this.selectedUnitReqEl);

    const levelsActions = document.createElement('div');
    levelsActions.className = 'unit-upgrade__actions';
    this.upgradeUnitBtn = new Button({
      text: 'Upgrade',
      variant: 'secondary',
      onClick: () => this.handleUpgradeSelected(),
    });
    levelsActions.appendChild(this.upgradeUnitBtn.getElement());
    levelsBlock.appendChild(levelsActions);

    this.selectedUnitPanel.appendChild(levelsBlock);

    const techBlock = document.createElement('div');
    techBlock.className = 'unit-upgrade__block unit-upgrade__block--tech';
    const techTitle = document.createElement('div');
    techTitle.className = 'unit-upgrade__subtitle';
    techTitle.textContent = 'Tech';
    this.selectedUnitTechEl = document.createElement('div');
    this.selectedUnitTechEl.className = 'unit-upgrade__tech';
    this.selectedUnitTechEl.textContent = 'Tech upgrades coming soon.';
    techBlock.appendChild(techTitle);
    techBlock.appendChild(this.selectedUnitTechEl);
    this.selectedUnitPanel.appendChild(techBlock);

    rightPanel.appendChild(this.selectedUnitPanel);

    const unitsBuildingsDivider = document.createElement('div');
    unitsBuildingsDivider.className = 'divider';
    rightPanel.appendChild(unitsBuildingsDivider);

    const buildingTitle = document.createElement('h3');
    buildingTitle.textContent = 'Buildings';
    rightPanel.appendChild(buildingTitle);

    const buildingRow = document.createElement('div');
    buildingRow.className = 'game__building-grid';

    for (const buildingType of getAllBuildingTypes()) {
      const blueprint = getBuildingBlueprint(buildingType);
      const maxCount = blueprint.maxCount ?? 1;
      const buildingItem = document.createElement('div');
      buildingItem.className = 'game__building-item';
      const countEl = document.createElement('div');
      countEl.className = 'game__building-count';
      countEl.textContent = `0/${maxCount}`;
      buildingItem.appendChild(countEl);
      const button = new Button({
        text: `${blueprint.name}`,
        variant: 'ghost',
        onClick: () => this.store.dispatch({ type: 'SELECT_BUILDING', buildingType }),
      });
      this.bindBuildingTooltip(buildingType, button.getElement(), this.buildBuildingTooltipText(buildingType));
      buildingItem.appendChild(button.getElement());
      buildingRow.appendChild(buildingItem);
      this.buildingButtons.set(buildingType, button);
      this.buildingCountEls.set(buildingType, countEl);
    }

    rightPanel.appendChild(buildingRow);

    this.buildingUpgradePanel = document.createElement('div');
    this.buildingUpgradePanel.className = 'building-upgrade';

    const buildingUpgradeTitle = document.createElement('div');
    buildingUpgradeTitle.className = 'building-upgrade__title';
    buildingUpgradeTitle.textContent = 'Building Upgrades';
    this.buildingUpgradePanel.appendChild(buildingUpgradeTitle);

    this.buildingUpgradeSummaryEl = document.createElement('div');
    this.buildingUpgradeSummaryEl.className = 'building-upgrade__summary';
    this.buildingUpgradePanel.appendChild(this.buildingUpgradeSummaryEl);

    this.buildingUpgradeStatsEl = document.createElement('div');
    this.buildingUpgradeStatsEl.className = 'building-upgrade__stats';
    this.buildingUpgradePanel.appendChild(this.buildingUpgradeStatsEl);

    this.buildingUpgradeHintEl = document.createElement('div');
    this.buildingUpgradeHintEl.className = 'building-upgrade__hint';
    this.buildingUpgradePanel.appendChild(this.buildingUpgradeHintEl);

    const buildingUpgradeActions = document.createElement('div');
    buildingUpgradeActions.className = 'building-upgrade__actions';
    this.upgradeBuildingBtn = new Button({
      text: 'Upgrade',
      variant: 'secondary',
      onClick: () => this.handleUpgradeBuilding(),
    });
    buildingUpgradeActions.appendChild(this.upgradeBuildingBtn.getElement());
    this.buildingUpgradePanel.appendChild(buildingUpgradeActions);

    rightPanel.appendChild(this.buildingUpgradePanel);

    const divider2 = document.createElement('div');
    divider2.className = 'divider';
    rightPanel.appendChild(divider2);

    const help = document.createElement('p');
    help.className = 'panel__help';
    const prepSeconds = Math.ceil(GAME_CONFIG.intermissionMs / 1000);
    help.textContent =
      `Unlock units with gold; unused gold carries over. Buy Slot grants +1 unit placement for this turn only. Units gain XP from finishing blows; select a unit to view its upgrades. Flank lanes (${GAME_CONFIG.flankColsPerSide} columns on each edge) unlock on turn ${GAME_CONFIG.flankUnlockTurn}: enemy can deploy on your flank lanes (red) and you can deploy on enemy flanks (green). Flank deployments activate after ${Math.ceil(GAME_CONFIG.flankDeployDelayMs / 1000)}s in battle. Placements are permanent for the match. Buildings (like the Gold Mine) occupy space, grant +1 gold per turn while standing, can be destroyed, and must be rebuilt. Buildings do not use placement slots. Goblin Caves (10x10) spawn goblins each second; upgrades add more and scale stats. Enemy builds its own roster with its own gold (loans included), and their placements persist too. Units move toward the Neutral zone to fight. Surviving units deal damage based on unit cost; buildings do not. First battle auto-starts after ${prepSeconds}s; after each battle you get ${prepSeconds}s to prep. Press Ready to start early or skip a battle when you have no units.`;
    rightPanel.appendChild(help);

    this.messageEl = document.createElement('div');
    this.messageEl.className = 'message';

    this.buySlotBtn = new Button({
      text: 'Buy Slot (2g)',
      variant: 'ghost',
      onClick: () => this.store.dispatch({ type: 'BUY_PLACEMENT_SLOT' }),
    });
    this.tooltipUnsubs.push(
      this.tooltip.bind(this.buySlotBtn.getElement(), {
        text: 'Buy +1 unit placement slot for this turn (2g).',
      })
    );

    this.loanBtn = new Button({
      text: '+2 Gold',
      variant: 'ghost',
      onClick: () => this.store.dispatch({ type: 'TAKE_LOAN' }),
    });
    this.tooltipUnsubs.push(
      this.tooltip.bind(this.loanBtn.getElement(), {
        text: 'Gain +2 gold now, but start next turn with 3 less gold. (Once per turn.)',
      })
    );

    this.upgradeAllBtn = new Button({
      text: 'Upgrade All (0g)',
      variant: 'ghost',
      onClick: () => this.handleUpgradeAll(),
    });
    this.setUpgradeAllTooltip('Upgrade all units that have enough XP. Each unit can upgrade once per turn.');

    this.nextTurnBtn = new Button({
      text: 'Ready',
      variant: 'primary',
      onClick: () => this.store.dispatch({ type: 'READY' }),
    });
    this.tooltipUnsubs.push(
      this.tooltip.bind(this.nextTurnBtn.getElement(), {
        text: 'Start the battle now (or wait for the timer). If you have no units, this skips the battle and applies enemy damage.',
      })
    );

    controlsCol.appendChild(this.nextTurnBtn.getElement());
    controlsCol.appendChild(this.buySlotBtn.getElement());
    controlsCol.appendChild(this.loanBtn.getElement());
    controlsCol.appendChild(this.upgradeAllBtn.getElement());

    leftPanel.appendChild(navRow);
    leftPanel.appendChild(divider1);
    leftPanel.appendChild(statsTitle);
    leftPanel.appendChild(statsStack);

    const divider3 = document.createElement('div');
    divider3.className = 'divider';
    leftPanel.appendChild(divider3);

    leftPanel.appendChild(controlsTitle);
    leftPanel.appendChild(controlsCol);
    leftPanel.appendChild(this.messageEl);

    game.appendChild(leftPanel);
    game.appendChild(mapCard);
    game.appendChild(rightPanel);
    this.container.appendChild(game);

    this.roundResultOverlay = document.createElement('div');
    this.roundResultOverlay.className = 'round-result';
    this.roundResultOverlay.setAttribute('aria-hidden', 'true');
    const roundResultCard = document.createElement('div');
    roundResultCard.className = 'round-result__card';
    this.roundResultTitleEl = document.createElement('div');
    this.roundResultTitleEl.className = 'round-result__title';
    this.roundResultSubtitleEl = document.createElement('div');
    this.roundResultSubtitleEl.className = 'round-result__subtitle';
    this.roundResultDamageWrap = document.createElement('div');
    this.roundResultDamageWrap.className = 'round-result__damage';
    const enemyDamageBlock = document.createElement('div');
    enemyDamageBlock.className = 'round-result__damage-block round-result__damage-block--enemy';
    const enemyDamageLabel = document.createElement('div');
    enemyDamageLabel.className = 'round-result__damage-label';
    enemyDamageLabel.textContent = 'Damage to Enemy';
    this.roundResultDamageEnemyEl = document.createElement('div');
    this.roundResultDamageEnemyEl.className = 'round-result__damage-value';
    enemyDamageBlock.appendChild(enemyDamageLabel);
    enemyDamageBlock.appendChild(this.roundResultDamageEnemyEl);
    const playerDamageBlock = document.createElement('div');
    playerDamageBlock.className = 'round-result__damage-block round-result__damage-block--player';
    const playerDamageLabel = document.createElement('div');
    playerDamageLabel.className = 'round-result__damage-label';
    playerDamageLabel.textContent = 'Damage to Player';
    this.roundResultDamagePlayerEl = document.createElement('div');
    this.roundResultDamagePlayerEl.className = 'round-result__damage-value';
    playerDamageBlock.appendChild(playerDamageLabel);
    playerDamageBlock.appendChild(this.roundResultDamagePlayerEl);
    this.roundResultDamageWrap.appendChild(enemyDamageBlock);
    this.roundResultDamageWrap.appendChild(playerDamageBlock);
    this.roundResultTimerEl = document.createElement('div');
    this.roundResultTimerEl.className = 'round-result__timer';
    this.roundResultUnitsEl = document.createElement('div');
    this.roundResultUnitsEl.className = 'round-result__units';
    const roundResultActions = document.createElement('div');
    roundResultActions.className = 'round-result__actions';
    this.roundResultProceedBtn = new Button({
      text: 'Proceed to next round',
      variant: 'secondary',
      onClick: () => this.dismissRoundResult('manual'),
    });
    roundResultActions.appendChild(this.roundResultProceedBtn.getElement());
    roundResultCard.appendChild(this.roundResultTitleEl);
    roundResultCard.appendChild(this.roundResultSubtitleEl);
    roundResultCard.appendChild(this.roundResultDamageWrap);
    roundResultCard.appendChild(this.roundResultTimerEl);
    roundResultCard.appendChild(this.roundResultUnitsEl);
    roundResultCard.appendChild(roundResultActions);
    this.roundResultOverlay.appendChild(roundResultCard);
    this.container.appendChild(this.roundResultOverlay);

    this.store = new Store<GameState, GameAction>(createInitialGameState(), gameReducer);
    this.matchAudioActive = true;
    setMatchActive(true);
    const debugUi = this.createDebugUi();
    this.toastStack = debugUi.toastStack;
    this.debugStatsEl = debugUi.statsEl;
    this.debugLogsEl = debugUi.logsEl;
    this.container.appendChild(this.toastStack);
    this.installDebugHooks();
    this.renderer = new CanvasRenderer(this.canvas);
    this.input = new CanvasInput({
      canvas: this.canvas,
      store: this.store,
      renderer: this.renderer,
      onCellLongPress: ({ cell, clientX, clientY }) => this.showCellTooltipAtClientPoint(cell, clientX, clientY),
    });
    this.loop = new GameLoop({ store: this.store, stepMs: GAME_CONFIG.simulationStepMs });

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      this.renderer.resizeToCssPixels(cr.width, cr.height);
      this.renderer.render(this.store.getState());
    });
    this.resizeObserver.observe(canvasWrap);

    this.store.subscribe(s => this.onState(s));
    this.onState(this.store.getState());

    this.input.attach();
    this.loop.start();
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public destroy(): void {
    for (const unsub of this.debugUnsubs) unsub();
    this.debugUnsubs.length = 0;
    if (this.debugScanTimer) {
      window.clearInterval(this.debugScanTimer);
      this.debugScanTimer = null;
    }
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
    this.loop.stop();
    this.input.detach();
    this.resizeObserver.disconnect();
    if (this.matchAudioActive) {
      this.matchAudioActive = false;
      setMatchActive(false);
    }
    if (this.canvasTooltipTimer) {
      window.clearTimeout(this.canvasTooltipTimer);
      this.canvasTooltipTimer = null;
    }
    if (this.roundResultAutoCloseTimer) {
      window.clearTimeout(this.roundResultAutoCloseTimer);
      this.roundResultAutoCloseTimer = null;
    }
    for (const unsub of this.tooltipUnsubs) unsub();
    for (const unsub of this.buildingTooltipUnsubs.values()) unsub();
    this.buildingTooltipUnsubs.clear();
    this.buildingTooltipText.clear();
    if (this.upgradeAllTooltipUnsub) {
      this.upgradeAllTooltipUnsub();
      this.upgradeAllTooltipUnsub = null;
    }
    this.tooltip.destroy();
    if (this.activeErrorToast?.timeoutId) {
      window.clearTimeout(this.activeErrorToast.timeoutId);
    }
    if (this.activeErrorToast?.element) {
      this.activeErrorToast.element.remove();
    }
    this.activeErrorToast = null;
  }

  private createDebugUi(): {
    toastStack: HTMLDivElement;
    overlay: HTMLDivElement;
    statsEl: HTMLDivElement;
    logsEl: HTMLDivElement;
  } {
    const toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';

    const overlay = document.createElement('div');
    overlay.className = 'debug-overlay';

    const header = document.createElement('div');
    header.className = 'debug-overlay__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'debug-overlay__title-wrap';

    const title = document.createElement('div');
    title.className = 'debug-overlay__title';
    title.textContent = 'Debug Monitor';

    const statsEl = document.createElement('div');
    statsEl.className = 'debug-overlay__stats';
    statsEl.textContent = '...';

    titleWrap.appendChild(title);
    titleWrap.appendChild(statsEl);

    const actions = document.createElement('div');
    actions.className = 'debug-overlay__actions';

    const verboseBtn = document.createElement('button');
    verboseBtn.type = 'button';
    verboseBtn.className = 'debug-overlay__btn';
    verboseBtn.textContent = 'Verbose: Off';
    verboseBtn.addEventListener('click', () => {
      this.debugVerbose = !this.debugVerbose;
      verboseBtn.textContent = this.debugVerbose ? 'Verbose: On' : 'Verbose: Off';
      this.logDebug('info', `Verbose logging ${this.debugVerbose ? 'enabled' : 'disabled'}.`);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'debug-overlay__btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      this.debugEntries = [];
      this.debugNextEntryId = 1;
      this.queueDebugRender();
    });

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'debug-overlay__btn';
    collapseBtn.textContent = 'Collapse';
    collapseBtn.addEventListener('click', () => {
      this.debugCollapsed = !this.debugCollapsed;
      overlay.classList.toggle('debug-overlay--collapsed', this.debugCollapsed);
      collapseBtn.textContent = this.debugCollapsed ? 'Expand' : 'Collapse';
    });

    actions.appendChild(verboseBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(collapseBtn);

    header.appendChild(titleWrap);
    header.appendChild(actions);

    const logsEl = document.createElement('div');
    logsEl.className = 'debug-overlay__logs';

    overlay.appendChild(header);
    overlay.appendChild(logsEl);

    return { toastStack, overlay, statsEl, logsEl };
  }

  private installDebugHooks(): void {
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);

    const now = performance.now();
    const initial = this.store.getState();
    this.lastDispatchAtMs = now;
    this.lastTimerProgressAtMs = now;
    this.lastBattleProgressAtMs = now;
    this.lastTimerRemainingMs = initial.intermissionMsRemaining;
    this.lastBattleTimeMs = initial.battleTimeMs;

    this.debugUnsubs.push(
      this.store.subscribeErrors(({ action, error }) => {
        const name = action && typeof action === 'object' && action && 'type' in action ? String((action as { type: unknown }).type) : 'unknown';
        const err = error instanceof Error ? error : new Error(String(error));
        this.logDebug('error', `Reducer threw during ${name}`, err.stack ?? err.message);
        this.showToast('error', err.message || 'Reducer error');
      })
    );

    this.debugUnsubs.push(
      this.store.subscribeActions(({ action, prevState }) => {
        this.lastDispatchAtMs = performance.now();

        const type =
          action && typeof action === 'object' && action && 'type' in action ? String((action as { type: unknown }).type) : 'unknown';

        if (type !== 'TICK' && type !== 'INTERMISSION_TICK') {
          this.logDebug('info', `Action: ${type}`, `turn=${prevState.turn} phase=${prevState.phase}`);
        }
      })
    );

    this.logDebug('info', 'Debug overlay initialized.');

    this.debugScanTimer = window.setInterval(() => this.scanForStalls(), 650);
  }

  private scanForStalls(): void {
    const state = this.store.getState();
    const now = performance.now();

    if (state.phase === 'BATTLE') {
      if (state.battleTimeMs !== this.lastBattleTimeMs) {
        this.lastBattleTimeMs = state.battleTimeMs;
        this.lastBattleProgressAtMs = now;
      } else if (now - this.lastBattleProgressAtMs > 2500 && now - this.lastInterventionAtMs > 2500) {
        this.lastInterventionAtMs = now;
        this.logDebug('warn', 'Battle appears stalled; forcing round end.', `battleTimeMs=${state.battleTimeMs}`);
        this.showToast('warn', 'Battle stalled; forcing round end.');
        this.store.dispatch({ type: 'FORCE_END_BATTLE' });
      }
    } else if (state.phase === 'INTERMISSION' || state.phase === 'DEPLOYMENT') {
      if (state.intermissionMsRemaining !== this.lastTimerRemainingMs) {
        this.lastTimerRemainingMs = state.intermissionMsRemaining;
        this.lastTimerProgressAtMs = now;
      } else if (
        state.intermissionMsRemaining > 0 &&
        now - this.lastTimerProgressAtMs > 2500 &&
        now - this.lastInterventionAtMs > 2500
      ) {
        this.lastInterventionAtMs = now;
        this.logDebug('warn', 'Timer appears stalled; advancing countdown.', `remainingMs=${state.intermissionMsRemaining}`);
        this.showToast('warn', 'Timer stalled; advancing countdown.');
        this.store.dispatch({ type: 'INTERMISSION_TICK', deltaMs: 1500 });
      } else if (
        state.phase === 'INTERMISSION' &&
        state.intermissionMsRemaining === 0 &&
        !state.matchResult &&
        now - this.lastInterventionAtMs > 2500
      ) {
        this.lastInterventionAtMs = now;
        this.logDebug('warn', 'Intermission at 0s but battle not started; dispatching Ready.');
        this.showToast('warn', 'Auto-starting next battle.');
        this.store.dispatch({ type: 'READY' });
      }
    }

    if (now - this.lastDispatchAtMs > 4500 && now - this.lastInterventionAtMs > 4500) {
      this.lastInterventionAtMs = now;
      this.logDebug('error', 'No actions dispatched for 4.5s; loop may be stalled.');
      this.showToast('error', 'Game loop stalled (no updates). Check debug log.');
    }
  }

  private logDebug(level: DebugLevel, message: string, details?: string): void {
    const entry: DebugLogEntry = {
      id: this.debugNextEntryId++,
      tsMs: performance.now(),
      level,
      message,
      details,
    };
    this.debugEntries.push(entry);
    const maxEntries = 240;
    if (this.debugEntries.length > maxEntries) {
      this.debugEntries = this.debugEntries.slice(this.debugEntries.length - maxEntries);
    }
    this.queueDebugRender();
  }

  private showToast(level: DebugLevel, message: string): void {
    if (level === 'error' && this.activeErrorToast) {
      this.activeErrorToast.element.textContent = message;
      if (this.activeErrorToast.timeoutId) {
        window.clearTimeout(this.activeErrorToast.timeoutId);
      }
      this.activeErrorToast.timeoutId = window.setTimeout(() => {
        this.activeErrorToast?.element.remove();
        this.activeErrorToast = null;
      }, 4500);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${level}`;
    toast.textContent = message;
    const removeToast = (): void => {
      toast.remove();
      if (this.activeErrorToast?.element === toast) {
        this.activeErrorToast = null;
      }
    };
    toast.addEventListener('click', removeToast);
    this.toastStack.appendChild(toast);

    const timeoutId = window.setTimeout(() => {
      removeToast();
    }, 4500);
    if (level === 'error') {
      this.activeErrorToast = { element: toast, timeoutId };
    }
  }

  private queueDebugRender(): void {
    if (this.debugRenderQueued) return;
    this.debugRenderQueued = true;
    window.requestAnimationFrame(() => {
      this.debugRenderQueued = false;
      this.renderDebug();
    });
  }

  private renderDebug(): void {
    if (this.debugCollapsed) {
      this.debugLogsEl.textContent = '';
      return;
    }

    const shouldStick =
      this.debugLogsEl.scrollTop + this.debugLogsEl.clientHeight >= this.debugLogsEl.scrollHeight - 16;

    this.debugLogsEl.innerHTML = '';
    for (const entry of this.debugEntries) {
      const row = document.createElement('div');
      row.className = `debug-overlay__entry debug-overlay__entry--${entry.level}`;
      const t = Math.floor(entry.tsMs);
      const details = entry.details ? ` ${entry.details}` : '';
      row.textContent = `#${entry.id} [${t}ms] ${entry.level.toUpperCase()}: ${entry.message}${details}`;
      this.debugLogsEl.appendChild(row);
    }

    if (shouldStick) {
      this.debugLogsEl.scrollTop = this.debugLogsEl.scrollHeight;
    }
  }

  private handleUpgradeSelected(): void {
    const state = this.store.getState();
    if (!state.selectedUnitId) return;
    this.store.dispatch({ type: 'UPGRADE_UNIT', unitId: state.selectedUnitId });
  }

  private handleUpgradeAll(): void {
    this.store.dispatch({ type: 'UPGRADE_ALL_UNITS' });
  }

  private getSelectedPlayerBuilding(state: GameState): GameState['buildings'][number] | null {
    if (state.selectedBuildingId !== null) {
      const selected = state.buildings.find(b => b.id === state.selectedBuildingId && b.team === 'PLAYER') ?? null;
      if (selected) {
        return selected;
      }
    }
    const candidates = state.buildings.filter(b => b.type === state.selectedBuildingType && b.team === 'PLAYER');
    return candidates.length === 1 ? candidates[0] : null;
  }

  private handleUpgradeBuilding(): void {
    const state = this.store.getState();
    const building = this.getSelectedPlayerBuilding(state);
    if (!building) return;
    this.store.dispatch({ type: 'UPGRADE_BUILDING', buildingId: building.id });
  }

  private getUpgradeAllSummary(state: GameState): { cost: number; readyCount: number } {
    let cost = 0;
    let readyCount = 0;
    for (const deployment of state.deployments) {
      const currentTier = deployment.tier ?? 1;
      const currentXp = deployment.xp ?? 0;
      const requiredXp = xpRequiredForTier(deployment.type, currentTier);
      if (currentXp < requiredXp) continue;
      if (deployment.lastUpgradeTurn === state.turn) continue;
      readyCount += 1;
      cost += getUnitBlueprint(deployment.type).placementCost;
    }
    return { cost, readyCount };
  }

  private setUpgradeAllTooltip(text: string): void {
    if (text === this.lastUpgradeAllTooltip) return;
    this.lastUpgradeAllTooltip = text;
    if (this.upgradeAllTooltipUnsub) {
      this.upgradeAllTooltipUnsub();
    }
    this.upgradeAllTooltipUnsub = this.tooltip.bind(this.upgradeAllBtn.getElement(), { text });
  }

  private buildBuildingTooltipText(buildingType: BuildingType, state?: GameState): string {
    const blueprint = getBuildingBlueprint(buildingType);
    const footprint = getBuildingFootprint(buildingType);
    const sizeText = `Size ${footprint.width}x${footprint.height}`;
    const incomeText = blueprint.goldPerTurn ? ` Income +${blueprint.goldPerTurn}g/turn.` : '';
    const attackStats = getBuildingAttackStats(buildingType, 1);
    const attackText = attackStats
      ? ` ATK ${attackStats.attackDamage} | RNG ${attackStats.attackRange} | CD ${(attackStats.attackCooldownMs / 1000).toFixed(2)}s.`
      : '';
    const spawnInfo = getBuildingSpawnInfo(buildingType, 1);
    const spawnUnitLabel = spawnInfo ? spawnInfo.unitType.toLowerCase() : '';
    const spawnUnitSuffix = spawnInfo && spawnInfo.countPerInterval !== 1 ? 's' : '';
    const spawnText = spawnInfo
      ? ` Spawns ${spawnInfo.countPerInterval} ${spawnUnitLabel}${spawnUnitSuffix}/s (+1/s per upgrade).`
      : '';
    const maxCount = blueprint.maxCount ?? 1;
    const placedCount = state
      ? state.buildings.filter(b => b.type === buildingType && b.team === 'PLAYER').length
      : 0;
    const limitText =
      placedCount >= maxCount
        ? ` Placed ${placedCount}/${maxCount}. Cannot place more.`
        : ` Placed ${placedCount}/${maxCount}.`;
    return `${blueprint.name}: Unlock ${blueprint.unlockCost}g (once). Place ${blueprint.placementCost}g. HP ${blueprint.maxHp}, Aggro ${blueprint.aggroRange}, ${sizeText}.${attackText}${incomeText}${spawnText}${limitText}`;
  }

  private bindBuildingTooltip(buildingType: BuildingType, target: HTMLElement, text: string): void {
    const existing = this.buildingTooltipUnsubs.get(buildingType);
    if (existing) existing();
    const unsub = this.tooltip.bind(target, { text });
    this.buildingTooltipUnsubs.set(buildingType, unsub);
    this.buildingTooltipText.set(buildingType, text);
  }

  private updateBuildingTooltips(state: GameState): void {
    for (const [buildingType, button] of this.buildingButtons.entries()) {
      const nextText = this.buildBuildingTooltipText(buildingType, state);
      const prevText = this.buildingTooltipText.get(buildingType);
      if (prevText === nextText) continue;
      this.bindBuildingTooltip(buildingType, button.getElement(), nextText);
    }
  }

  private dismissRoundResult(reason: 'manual' | 'auto' | 'state'): void {
    if (!this.roundResultVisible) return;
    const activeRound = this.activeRoundResultRound;
    if (this.roundResultAutoCloseTimer) {
      window.clearTimeout(this.roundResultAutoCloseTimer);
      this.roundResultAutoCloseTimer = null;
    }
    this.roundResultAutoCloseAtMs = null;
    this.lastRoundResultCountdown = null;
    this.roundResultVisible = false;
    this.roundResultOverlay.classList.remove('round-result--visible', 'round-result--player', 'round-result--enemy', 'round-result--draw');
    this.roundResultOverlay.setAttribute('aria-hidden', 'true');
    if (reason !== 'state') {
      this.dismissedRoundResultRound = activeRound;
    }
    this.activeRoundResultRound = null;
  }

  private showRoundResult(summary: NonNullable<GameState['lastRoundSummary']>, autoAdvanceMs: number): void {
    this.activeRoundResultRound = summary.round;
    this.roundResultVisible = true;
    this.roundResultOverlay.classList.add('round-result--visible');
    this.roundResultOverlay.classList.toggle('round-result--player', summary.winner === 'PLAYER');
    this.roundResultOverlay.classList.toggle('round-result--enemy', summary.winner === 'ENEMY');
    this.roundResultOverlay.classList.toggle('round-result--draw', summary.winner === 'DRAW');
    this.roundResultOverlay.setAttribute('aria-hidden', 'false');

    this.roundResultTitleEl.textContent = `Round ${summary.round} Results`;
    this.roundResultSubtitleEl.textContent =
      summary.winner === 'DRAW' ? 'Draw' : `${summary.winner === 'PLAYER' ? 'Player' : 'Enemy'} Wins`;
    this.roundResultDamageEnemyEl.textContent = this.formatHp(summary.playerDamage);
    this.roundResultDamagePlayerEl.textContent = this.formatHp(summary.enemyDamage);

    this.roundResultUnitsEl.innerHTML = '';
    this.roundResultUnitsEl.appendChild(
      this.buildRoundTeamColumn('Player Survivors', summary.playerUnits, summary.playerDamage, 'player')
    );
    this.roundResultUnitsEl.appendChild(
      this.buildRoundTeamColumn('Enemy Survivors', summary.enemyUnits, summary.enemyDamage, 'enemy')
    );

    if (this.roundResultAutoCloseTimer) {
      window.clearTimeout(this.roundResultAutoCloseTimer);
    }
    const clampedAutoAdvanceMs = Math.max(0, autoAdvanceMs);
    const initialCountdown = Math.max(0, Math.ceil(clampedAutoAdvanceMs / 1000));
    this.roundResultTimerEl.textContent = `Auto-advance in ${initialCountdown}s`;
    this.roundResultProceedBtn.setText(
      initialCountdown > 0 ? `Proceed to next round (${initialCountdown}s)` : 'Proceed to next round'
    );
    this.roundResultAutoCloseAtMs = clampedAutoAdvanceMs > 0 ? Date.now() + clampedAutoAdvanceMs : null;
    this.roundResultAutoCloseTimer =
      clampedAutoAdvanceMs > 0 ? window.setTimeout(() => this.dismissRoundResult('auto'), clampedAutoAdvanceMs) : null;
    this.lastRoundResultCountdown = null;
    this.updateRoundResultCountdown();
  }

  private buildRoundTeamColumn(
    title: string,
    units: RoundUnitSummary[],
    totalDamage: number,
    teamClass: 'player' | 'enemy'
  ): HTMLDivElement {
    const column = document.createElement('div');
    column.className = `round-result__team round-result__team--${teamClass}`;

    const header = document.createElement('div');
    header.className = 'round-result__team-header';
    const heading = document.createElement('div');
    heading.className = 'round-result__team-title';
    heading.textContent = title;
    const total = document.createElement('div');
    total.className = 'round-result__team-total';
    total.textContent = `Damage: ${this.formatHp(totalDamage)}`;
    header.appendChild(heading);
    header.appendChild(total);
    column.appendChild(header);

    column.appendChild(this.buildRoundTierList(units, totalDamage, teamClass));
    return column;
  }

  private getDamagePercent(totalDamage: number, unitDamage: number): number {
    if (!Number.isFinite(totalDamage) || totalDamage <= 0) return 0;
    if (!Number.isFinite(unitDamage) || unitDamage <= 0) return 0;
    return Math.round((unitDamage / totalDamage) * 100);
  }

  private buildRoundTierList(
    units: RoundUnitSummary[],
    totalDamage: number,
    teamClass: 'player' | 'enemy'
  ): HTMLDivElement {
    const tierWrap = document.createElement('div');
    tierWrap.className = `round-result__tiers round-result__tiers--${teamClass}`;
    const tiers = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const;
    const tierMap: Record<(typeof tiers)[number], RoundUnitSummary[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
      E: [],
      F: [],
    };

    if (units.length > 0) {
      const sorted = [...units].sort((a, b) => b.totalDamage - a.totalDamage);
      if (sorted.length === 1) {
        tierMap.S.push(sorted[0]);
      } else {
        const maxIndex = sorted.length - 1;
        sorted.forEach((unit, index) => {
          const tierIndex = Math.floor((index / maxIndex) * (tiers.length - 1));
          tierMap[tiers[tierIndex]].push(unit);
        });
      }
    }

    for (const tier of tiers) {
      const row = document.createElement('div');
      row.className = `round-result__tier round-result__tier--${tier.toLowerCase()}`;
      const label = document.createElement('div');
      label.className = 'round-result__tier-label';
      label.textContent = tier;
      const entries = tierMap[tier];
      const unitsEl = document.createElement('div');
      unitsEl.className = 'round-result__tier-units';
      if (entries.length === 0) {
        unitsEl.textContent = '-';
      } else {
        unitsEl.textContent = entries
          .map(entry => {
            const blueprint = getUnitBlueprint(entry.type);
            const tierLabel = entry.tier > 1 ? ` ${toRoman(entry.tier) || entry.tier}` : '';
            const countLabel = entry.count > 1 ? ` x${entry.count}` : '';
            const percent = this.getDamagePercent(totalDamage, entry.totalDamage);
            const perUnit = this.formatHp(entry.damagePerUnit);
            const totalUnitDamage = this.formatHp(entry.totalDamage);
            return `${blueprint.name}${tierLabel}${countLabel} - ${perUnit} dmg ea | ${totalUnitDamage} total | ${percent}%`;
          })
          .join(' | ');
      }
      row.appendChild(label);
      row.appendChild(unitsEl);
      tierWrap.appendChild(row);
    }

    return tierWrap;
  }

  private updateRoundResultCountdown(): void {
    if (!this.roundResultVisible || this.roundResultAutoCloseAtMs === null) return;
    const remainingMs = this.roundResultAutoCloseAtMs - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    if (remainingSec === this.lastRoundResultCountdown) return;
    this.lastRoundResultCountdown = remainingSec;
    this.roundResultTimerEl.textContent = `Auto-advance in ${remainingSec}s`;
    this.roundResultProceedBtn.setText(
      remainingSec > 0 ? `Proceed to next round (${remainingSec}s)` : 'Proceed to next round'
    );
  }

  private updateRoundResultOverlay(state: GameState): void {
    if (!state.result || !state.lastRoundSummary || state.phase !== 'INTERMISSION' || state.matchResult) {
      this.dismissRoundResult('state');
      return;
    }

    if (this.dismissedRoundResultRound === state.lastRoundSummary.round) {
      return;
    }

    if (this.activeRoundResultRound !== state.lastRoundSummary.round || !this.roundResultVisible) {
      const autoAdvanceMs = Math.min(state.intermissionMsRemaining, GAME_CONFIG.roundResultAutoAdvanceMs);
      this.showRoundResult(state.lastRoundSummary, autoAdvanceMs);
      return;
    }

    this.updateRoundResultCountdown();
  }

  private handleSfx(state: GameState): void {
    if (state.sfxEventId === this.lastSfxEventId) return;
    this.lastSfxEventId = state.sfxEventId;
    for (const event of state.sfxEvents) {
      playSfx(event.kind, event.count);
    }
  }

  private onState(state: GameState): void {
    this.updateDebugStats(state);
    this.updateSelectedUnitPanel(state);
    this.updateBuildingUpgradePanel(state);
    if (state.matchResult && this.matchAudioActive) {
      this.matchAudioActive = false;
      setMatchActive(false);
    }

    if (this.lastObservedTurn === null) {
      this.lastObservedTurn = state.turn;
      this.lastObservedPhase = state.phase;
      this.lastObservedPlayerHp = state.playerHp;
      this.lastObservedEnemyHp = state.enemyHp;
      this.lastObservedMatchResult = state.matchResult;
      this.logDebug('info', `State initialized: turn=${state.turn} phase=${state.phase}`);
    } else {
      if (this.lastObservedTurn !== state.turn) {
        this.logDebug('info', `Turn advanced: ${this.lastObservedTurn} -> ${state.turn}`);
        this.lastObservedTurn = state.turn;
      }
      if (this.lastObservedPhase !== state.phase) {
        this.logDebug('info', `Phase: ${this.lastObservedPhase} -> ${state.phase}`);
        this.lastObservedPhase = state.phase;
        this.lastVerboseBattleSecond = null;
        this.lastVerboseIntermissionSecond = null;
        const now = performance.now();
        if (state.phase === 'BATTLE') {
          this.lastBattleProgressAtMs = now;
          this.lastBattleTimeMs = state.battleTimeMs;
        } else {
          this.lastTimerProgressAtMs = now;
          this.lastTimerRemainingMs = state.intermissionMsRemaining;
        }
      }
      if (this.lastObservedPlayerHp !== state.playerHp || this.lastObservedEnemyHp !== state.enemyHp) {
        const playerHpText = this.formatHp(state.playerHp);
        const enemyHpText = this.formatHp(state.enemyHp);
        this.logDebug('info', `HP: You ${playerHpText} | Enemy ${enemyHpText}`);
        this.lastObservedPlayerHp = state.playerHp;
        this.lastObservedEnemyHp = state.enemyHp;
      }
      if (this.lastObservedMatchResult !== state.matchResult && state.matchResult) {
        this.logDebug('info', `Match over: ${state.matchResult.winner} (${state.matchResult.reason})`);
        this.showToast('info', `Match over: ${state.matchResult.winner}`);
        this.lastObservedMatchResult = state.matchResult;
      } else if (this.lastObservedMatchResult !== state.matchResult) {
        this.lastObservedMatchResult = state.matchResult;
      }
    }
    this.renderer.render(state);
    this.updateCanvasTooltip(state);
    this.handleSfx(state);
    this.updateRoundResultOverlay(state);

    this.phasePill.textContent =
      state.phase === 'DEPLOYMENT'
        ? state.intermissionMsRemaining > 0
          ? `Phase: Deployment (${Math.ceil(state.intermissionMsRemaining / 1000)}s)`
          : 'Phase: Deployment'
        : state.phase === 'BATTLE'
          ? `Phase: Battle (${Math.max(0, Math.ceil((GAME_CONFIG.battleMaxTimeMs - state.battleTimeMs) / 1000))}s)`
          : `Phase: Intermission (${Math.ceil(state.intermissionMsRemaining / 1000)}s)`;

    this.turnPill.textContent = `Turn: ${state.turn}`;
    const phaseLabel = state.phase === 'BATTLE' ? 'Battle' : 'Prep';
    this.roundBanner.textContent = `Round ${state.turn} - ${phaseLabel}`;
    const debtText = state.goldDebtNextTurn > 0 ? ` (Debt -${state.goldDebtNextTurn} next)` : '';
    this.goldPill.textContent = `Gold: ${state.gold}${debtText}`;
    const playerHpText = this.formatHp(state.playerHp);
    const enemyHpText = this.formatHp(state.enemyHp);
    this.hpPill.textContent = `HP: You ${playerHpText} | Enemy ${enemyHpText}`;
    const placementsLeft = Math.max(0, state.placementSlots - state.placementsUsedThisTurn);
    this.placementsPill.textContent = `Unit placements: ${state.placementsUsedThisTurn}/${state.placementSlots} (${placementsLeft} left)`;

    const playerUnits = state.units.filter(u => u.team === 'PLAYER').length;
    const enemyUnits = state.units.filter(u => u.team === 'ENEMY').length;
    this.unitsPill.textContent = `Units: You ${playerUnits} vs Enemy ${enemyUnits}`;

    const canDeploy = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;
    const canReady = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;

    for (const [unitType, btn] of this.unitButtons.entries()) {
      const blueprint = getUnitBlueprint(unitType);
      const unlocked = state.unlockedUnits[unitType];
      const costLabel = unlocked ? `Place ${blueprint.placementCost}g` : `Unlock ${blueprint.unlockCost}g`;
      btn.setText(`${blueprint.name} (${costLabel})`);
      btn.toggleClass('btn--locked', !unlocked);
      btn.toggleClass('btn--unlocked', unlocked);
      btn.setAriaDisabled(!canDeploy);
      btn.setActive(state.selectedPlacementKind === 'UNIT' && unitType === state.selectedUnitType);
    }

    for (const [buildingType, btn] of this.buildingButtons.entries()) {
      const blueprint = getBuildingBlueprint(buildingType);
      const unlocked = state.unlockedBuildings[buildingType];
      const costLabel = unlocked ? `Place ${blueprint.placementCost}g` : `Unlock ${blueprint.unlockCost}g`;
      const maxCount = blueprint.maxCount ?? 1;
      const placedCount = state.buildings.filter(b => b.type === buildingType && b.team === 'PLAYER').length;
      btn.setText(`${blueprint.name} (${costLabel})`);
      btn.toggleClass('btn--locked', !unlocked);
      btn.toggleClass('btn--unlocked', unlocked);
      btn.setAriaDisabled(!canDeploy);
      btn.setActive(state.selectedPlacementKind === 'BUILDING' && buildingType === state.selectedBuildingType);
      const countEl = this.buildingCountEls.get(buildingType);
      if (countEl) {
        countEl.textContent = `${placedCount}/${maxCount}`;
        countEl.classList.toggle('game__building-count--full', placedCount >= maxCount);
        countEl.classList.toggle('game__building-count--locked', !unlocked);
      }
    }
    this.updateBuildingTooltips(state);

    if (state.selectedPlacementKind === 'BUILDING') {
      const selectedBlueprint = getBuildingBlueprint(state.selectedBuildingType);
      const selectedUnlocked = state.unlockedBuildings[state.selectedBuildingType];
      const selectedFootprint = getBuildingFootprint(state.selectedBuildingType);
      const sizeText = ` | Size ${selectedFootprint.width}x${selectedFootprint.height}`;
      const costLabel = selectedUnlocked
        ? `Place ${selectedBlueprint.placementCost}g`
        : `Unlock ${selectedBlueprint.unlockCost}g`;
      const maxCount = selectedBlueprint.maxCount ?? 1;
      const placedCount = state.buildings.filter(
        b => b.type === state.selectedBuildingType && b.team === 'PLAYER'
      ).length;
      const limitReached = placedCount >= maxCount;
      const existingBuilding = this.getSelectedPlayerBuilding(state);
      const buildingTier = existingBuilding?.tier ?? 1;
      const tierLabel = toRoman(buildingTier);
      const buildingStats = getBuildingStats(state.selectedBuildingType, buildingTier);
      const incomeText = buildingStats.goldPerTurn > 0 ? ` | Income +${buildingStats.goldPerTurn}g/turn` : '';
      const attackStats = getBuildingAttackStats(state.selectedBuildingType, buildingTier);
      const attackText = attackStats
        ? ` | ATK ${attackStats.attackDamage} | RNG ${attackStats.attackRange} | CD ${(attackStats.attackCooldownMs / 1000).toFixed(2)}s`
        : '';
      const spawnInfo = getBuildingSpawnInfo(state.selectedBuildingType, buildingTier);
      const spawnUnitLabel = spawnInfo ? spawnInfo.unitType.toLowerCase() : '';
      const spawnUnitSuffix = spawnInfo && spawnInfo.countPerInterval !== 1 ? 's' : '';
      const spawnText = spawnInfo ? ` | Spawns ${spawnInfo.countPerInterval} ${spawnUnitLabel}${spawnUnitSuffix}/s` : '';

      this.unitInfoEl.classList.toggle('unit-info--locked', !selectedUnlocked);
      this.unitInfoTitleEl.textContent = `${selectedBlueprint.name}${tierLabel ? ` Tier ${tierLabel}` : ''} - ${
        selectedUnlocked ? 'Unlocked' : 'Locked'
      }`;
      this.unitInfoStatsEl.textContent = `${costLabel} | HP ${buildingStats.maxHp} | Aggro ${buildingStats.aggroRange}${sizeText}${attackText}${incomeText}${spawnText} | Limit ${maxCount} per player`;
      if (!selectedUnlocked) {
        this.unitInfoHintEl.textContent = canDeploy
          ? `Tap ${selectedBlueprint.name} to unlock.`
          : 'Unlocking is disabled during battle.';
      } else if (!canDeploy) {
        this.unitInfoHintEl.textContent = 'Placements are locked during battle.';
      } else if (limitReached) {
        this.unitInfoHintEl.textContent = `${selectedBlueprint.name} placed ${placedCount}/${maxCount}. Destroyed buildings must be rebuilt.`;
      } else {
        this.unitInfoHintEl.textContent = `Tap a player cell to place. Enemy flanks unlock on turn ${GAME_CONFIG.flankUnlockTurn} (green); your flank lanes are enemy-only (red). Limit ${maxCount} per player. Buildings do not use placement slots.`;
      }
    } else {
      const selectedBlueprint = getUnitBlueprint(state.selectedUnitType);
      const selectedUnlocked = state.unlockedUnits[state.selectedUnitType];
      const selectedStats = getUnitStats(state.selectedUnitType, 1);
      const selectedFootprint = getPlacementFootprint(state.selectedUnitType);
      const selectedSquadSize = getPlacementOffsets(state.selectedUnitType).length;
      const rangeSuffix = selectedBlueprint.attackDistance === 'CHEBYSHEV' ? ' (diag)' : '';
      const aoeText = selectedBlueprint.aoeRadius ? ` | AOE ${selectedBlueprint.aoeRadius}` : '';
      const sizeText =
        selectedFootprint.width > 1 || selectedFootprint.height > 1
          ? ` | Size ${selectedFootprint.width}x${selectedFootprint.height}`
          : '';
      const squadText = selectedSquadSize > 1 ? ` | Squad x${selectedSquadSize}` : '';
      const costLabel = selectedUnlocked
        ? `Place ${selectedBlueprint.placementCost}g`
        : `Unlock ${selectedBlueprint.unlockCost}g`;

      this.unitInfoEl.classList.toggle('unit-info--locked', !selectedUnlocked);
      this.unitInfoTitleEl.textContent = `${selectedBlueprint.name} - ${selectedUnlocked ? 'Unlocked' : 'Locked'}`;
      const selectedMoveSpeed = getUnitMoveSpeed(state.selectedUnitType);
      const selectedMoveText = selectedMoveSpeed.toFixed(2);
      this.unitInfoStatsEl.textContent = `${costLabel} | T1 HP ${selectedStats.maxHp} | ATK ${selectedStats.attackDamage} | RNG ${selectedBlueprint.attackRange}${rangeSuffix}${aoeText} | MOV ${selectedMoveText}${sizeText}${squadText}`;
      this.unitInfoHintEl.textContent = selectedUnlocked
        ? canDeploy
          ? `Tap a player cell to place. Enemy flanks unlock on turn ${GAME_CONFIG.flankUnlockTurn} (green); your flank lanes are enemy-only (red). Tap your unit to view upgrades.`
          : 'Placements are locked during battle.'
        : canDeploy
          ? `Tap ${selectedBlueprint.name} to unlock.`
          : 'Unlocking is disabled during battle.';
    }

    this.buySlotBtn.setAriaDisabled(!canDeploy || state.gold < state.nextPlacementSlotCost);
    this.buySlotBtn.setText(`Buy Slot (${state.nextPlacementSlotCost}g)`);
    this.loanBtn.setAriaDisabled(!canDeploy || state.loanUsedThisTurn);
    this.loanBtn.setText(state.loanUsedThisTurn ? 'Loan Used' : '+2 Gold');
    const upgradeAllSummary = this.getUpgradeAllSummary(state);
    const upgradeAllCost = upgradeAllSummary.cost;
    const upgradeAllCount = upgradeAllSummary.readyCount;
    const upgradedThisTurnCount = state.deployments.filter(d => d.lastUpgradeTurn === state.turn).length;
    const canUpgradeAll = canDeploy && upgradeAllCost > 0 && state.gold >= upgradeAllCost;
    this.upgradeAllBtn.setAriaDisabled(!canUpgradeAll);
    this.upgradeAllBtn.setText(`Upgrade All (${upgradeAllCost}g)`);
    let upgradeAllTooltip = 'Upgrade all units that have enough XP. Each unit can upgrade once per turn.';
    if (!canDeploy) {
      upgradeAllTooltip = 'Upgrade all units between battles only.';
    } else if (upgradeAllCount === 0) {
      upgradeAllTooltip =
        upgradedThisTurnCount > 0
          ? 'All eligible units already upgraded this turn.'
          : 'No units are ready to upgrade yet.';
    } else if (state.gold < upgradeAllCost) {
      upgradeAllTooltip = `Need ${upgradeAllCost}g to upgrade ${upgradeAllCount} unit${upgradeAllCount === 1 ? '' : 's'} (you have ${state.gold}g).`;
    } else {
      upgradeAllTooltip = `Upgrade ${upgradeAllCount} unit${upgradeAllCount === 1 ? '' : 's'} for ${upgradeAllCost}g total.`;
    }
    this.setUpgradeAllTooltip(upgradeAllTooltip);
    this.nextTurnBtn.setAriaDisabled(!canReady);
    const readyLabel =
      state.intermissionMsRemaining > 0 ? `Ready (${Math.ceil(state.intermissionMsRemaining / 1000)}s)` : 'Ready';
    this.nextTurnBtn.setText(canReady ? readyLabel : 'Ready');

    const msg = state.message;
    if (!msg) {
      this.messageEl.textContent = '';
      this.messageEl.className = 'message message--hidden';
      this.messageEl.hidden = true;
    } else {
      this.messageEl.textContent = msg.text;
      this.messageEl.className = `message message--${msg.kind}`;
      this.messageEl.hidden = false;
      if (msg.kind === 'error') {
        this.logDebug('error', msg.text, `turn=${state.turn} phase=${state.phase}`);
        this.showToast('error', msg.text);
      }
    }

    if (this.debugVerbose) {
      if (state.phase === 'BATTLE') {
        const sec = Math.floor(state.battleTimeMs / 1000);
        if (sec !== this.lastVerboseBattleSecond) {
          this.lastVerboseBattleSecond = sec;
          const playerAlive = state.units.filter(u => u.team === 'PLAYER' && u.hp > 0).length;
          const enemyAlive = state.units.filter(u => u.team === 'ENEMY' && u.hp > 0).length;
          this.logDebug('info', `Battle t=${sec}s alive=${playerAlive}v${enemyAlive}`);
        }
      } else {
        this.lastVerboseBattleSecond = null;
      }

      const isPrepPhase = state.phase === 'INTERMISSION' || state.phase === 'DEPLOYMENT';
      if (isPrepPhase && state.intermissionMsRemaining > 0) {
        const sec = Math.ceil(state.intermissionMsRemaining / 1000);
        if (sec !== this.lastVerboseIntermissionSecond) {
          this.lastVerboseIntermissionSecond = sec;
          this.logDebug('info', `Prep timer: ${sec}s (turn ${state.turn})`);
        }
      } else {
        this.lastVerboseIntermissionSecond = null;
      }
    }
  }

  private updateDebugStats(state: GameState): void {
    const playerAlive = state.units.filter(u => u.team === 'PLAYER' && u.hp > 0).length;
    const enemyAlive = state.units.filter(u => u.team === 'ENEMY' && u.hp > 0).length;
    const prep = state.intermissionMsRemaining > 0 ? `${Math.ceil(state.intermissionMsRemaining / 1000)}s` : '0s';
    const battle = state.battleTimeMs > 0 ? `${Math.floor(state.battleTimeMs / 1000)}s` : '0s';
    const playerHpText = this.formatHp(state.playerHp);
    const enemyHpText = this.formatHp(state.enemyHp);
    this.debugStatsEl.textContent = `T${state.turn} ${state.phase} | HP ${playerHpText}-${enemyHpText} | Units ${playerAlive}v${enemyAlive} | Prep ${prep} | Battle ${battle}`;
  }

  private formatHp(value: number): string {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(2).replace(/\.?0+$/, '');
  }

  private updateSelectedUnitPanel(state: GameState): void {
    const canModify = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;
    const selected = state.selectedUnitId
      ? state.deployments.find(d => d.id === state.selectedUnitId) ?? null
      : null;

    if (!selected) {
      this.selectedUnitPanel.classList.add('unit-upgrade--empty');
      this.selectedUnitPanel.classList.remove('unit-upgrade--ready');
      this.selectedUnitSummaryEl.textContent = 'Select a unit on the map to view upgrades.';
      this.selectedUnitSelectHintEl.textContent = '';
      this.selectedUnitStatsEl.textContent = '';
      this.selectedUnitXpEl.textContent = '';
      this.selectedUnitXpBar.classList.add('unit-upgrade__bar--hidden');
      this.selectedUnitXpFill.style.width = '0%';
      this.selectedUnitLevelsEl.textContent = '';
      this.selectedUnitReqEl.textContent = '';
      this.selectedUnitTechEl.textContent = 'Select a unit to preview tech upgrades (coming soon).';
      this.upgradeUnitBtn.setText('Upgrade');
      this.upgradeUnitBtn.setAriaDisabled(true);
      return;
    }

    const blueprint = getUnitBlueprint(selected.type);
    const tier = selected.tier ?? 1;
    const nextTier = tier + 1;
    const tierLabel = toRoman(tier);
    const nextTierLabel = toRoman(nextTier);
    const currentStats = getUnitStats(selected.type, tier);
    const nextStats = getUnitStats(selected.type, nextTier);
    const moveSpeed = getUnitMoveSpeed(selected.type);
    const moveSpeedText = moveSpeed.toFixed(2);
    const rangeSuffix = blueprint.attackDistance === 'CHEBYSHEV' ? ' (diag)' : '';
    const aoeText = blueprint.aoeRadius ? ` | AOE ${blueprint.aoeRadius}` : '';
    const footprint = getUnitFootprint(selected.type);
    const sizeText =
      footprint.width > 1 || footprint.height > 1 ? ` | Size ${footprint.width}x${footprint.height}` : '';
    const squadSize = getPlacementOffsets(selected.type).length;
    const squadText = squadSize > 1 ? ` | Squad x${squadSize}` : '';
    const requiredXp = xpRequiredForTier(selected.type, tier);
    const cost = blueprint.placementCost;
    const hasXp = selected.xp >= requiredXp;
    const hasGold = state.gold >= cost;
    const upgradedThisTurn = selected.lastUpgradeTurn === state.turn;
    const canUpgrade = canModify && hasXp && hasGold && !upgradedThisTurn;

    this.selectedUnitPanel.classList.remove('unit-upgrade--empty');
    this.selectedUnitSummaryEl.textContent = `${blueprint.name} Tier ${tierLabel || tier} | (${selected.x}, ${selected.y})`;
    this.selectedUnitSelectHintEl.textContent = 'Tap the unit again to deselect.';
    this.selectedUnitStatsEl.textContent = `HP ${currentStats.maxHp} | ATK ${currentStats.attackDamage} | RNG ${blueprint.attackRange}${rangeSuffix}${aoeText} | MOV ${moveSpeedText}${sizeText}${squadText}`;
    const cappedXp = Math.min(selected.xp, requiredXp);
    const xpSuffix = hasXp ? ' (capped)' : '';
    this.selectedUnitXpEl.textContent = `XP ${cappedXp}/${requiredXp}${xpSuffix}`;
    const xpProgress = requiredXp > 0 ? Math.min(1, cappedXp / requiredXp) : 0;
    this.selectedUnitXpBar.classList.remove('unit-upgrade__bar--hidden');
    this.selectedUnitXpFill.style.width = `${Math.round(xpProgress * 100)}%`;
    this.selectedUnitXpBar.setAttribute('aria-valuemin', '0');
    this.selectedUnitXpBar.setAttribute('aria-valuemax', '100');
    this.selectedUnitXpBar.setAttribute('aria-valuenow', `${Math.round(xpProgress * 100)}`);
    this.selectedUnitLevelsEl.textContent = `Next Tier ${nextTierLabel || nextTier}: HP ${nextStats.maxHp} | ATK ${nextStats.attackDamage} | MOV ${moveSpeedText}`;
    this.selectedUnitTechEl.textContent = 'Tech upgrades coming soon.';

    if (!canModify) {
      this.selectedUnitReqEl.textContent = 'Upgrades are available between battles.';
    } else if (upgradedThisTurn) {
      this.selectedUnitReqEl.textContent = 'Already upgraded this turn.';
    } else if (!hasXp && !hasGold) {
      this.selectedUnitReqEl.textContent = `Needs ${requiredXp} XP and ${cost}g.`;
    } else if (!hasXp) {
      this.selectedUnitReqEl.textContent = `Needs ${requiredXp} XP to upgrade.`;
    } else if (!hasGold) {
      this.selectedUnitReqEl.textContent = `Needs ${cost}g to upgrade. XP capped.`;
    } else {
      this.selectedUnitReqEl.textContent = `Ready to upgrade for ${cost}g.`;
    }

    this.selectedUnitPanel.classList.toggle('unit-upgrade--ready', canUpgrade);
    const upgradeLabel = canUpgrade ? `Upgrade to Tier ${nextTierLabel || nextTier} (${cost}g)` : `Upgrade (${cost}g)`;
    this.upgradeUnitBtn.setText(upgradeLabel);
    this.upgradeUnitBtn.setAriaDisabled(!canUpgrade);
  }

  private updateBuildingUpgradePanel(state: GameState): void {
    const canModify = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;
    const blueprint = getBuildingBlueprint(state.selectedBuildingType);
    const playerBuildings = state.buildings.filter(b => b.type === state.selectedBuildingType && b.team === 'PLAYER');
    const building = this.getSelectedPlayerBuilding(state);
    const upgradeCost = blueprint.placementCost;

    if (playerBuildings.length === 0) {
      this.buildingUpgradePanel.classList.add('building-upgrade--empty');
      this.buildingUpgradePanel.classList.remove('building-upgrade--ready');
      this.buildingUpgradeSummaryEl.textContent = `${blueprint.name} upgrades`;
      this.buildingUpgradeStatsEl.textContent = `Place a ${blueprint.name} to unlock upgrades.`;
      if (!state.unlockedBuildings[state.selectedBuildingType]) {
        this.buildingUpgradeHintEl.textContent = `Unlock ${blueprint.name} for ${blueprint.unlockCost}g to start.`;
      } else {
        this.buildingUpgradeHintEl.textContent = 'Upgrades unlock after the building survives a battle.';
      }
      this.upgradeBuildingBtn.setText(`Upgrade (${upgradeCost}g)`);
      this.upgradeBuildingBtn.setAriaDisabled(true);
      return;
    }

    if (!building) {
      const count = playerBuildings.length;
      const plural = count === 1 ? '' : 's';
      this.buildingUpgradePanel.classList.remove('building-upgrade--empty');
      this.buildingUpgradePanel.classList.remove('building-upgrade--ready');
      this.buildingUpgradeSummaryEl.textContent = `${blueprint.name} upgrades`;
      this.buildingUpgradeStatsEl.textContent = `${count} ${blueprint.name}${plural} placed. Tap one on the map to inspect and upgrade that copy.`;
      this.buildingUpgradeHintEl.textContent = 'Select a placed building to target its upgrade.';
      this.upgradeBuildingBtn.setText(`Upgrade (${upgradeCost}g)`);
      this.upgradeBuildingBtn.setAriaDisabled(true);
      return;
    }

    const tier = building.tier ?? 1;
    const nextTier = tier + 1;
    const tierLabel = toRoman(tier);
    const nextTierLabel = toRoman(nextTier);
    const stats = getBuildingStats(building.type, tier);
    const nextStats = getBuildingStats(building.type, nextTier);
    const attackStats = getBuildingAttackStats(building.type, tier);
    const nextAttackStats = getBuildingAttackStats(building.type, nextTier);
    const spawnInfo = getBuildingSpawnInfo(building.type, tier);
    const nextSpawnInfo = getBuildingSpawnInfo(building.type, nextTier);
    const spawnUnitLabel = spawnInfo ? spawnInfo.unitType.toLowerCase() : '';
    const spawnUnitSuffix = spawnInfo && spawnInfo.countPerInterval !== 1 ? 's' : '';
    const nextSpawnUnitSuffix = nextSpawnInfo && nextSpawnInfo.countPerInterval !== 1 ? 's' : '';
    const spawnText = spawnInfo ? ` Spawns ${spawnInfo.countPerInterval} ${spawnUnitLabel}${spawnUnitSuffix}/s.` : '';
    const nextSpawnText = nextSpawnInfo
      ? ` Spawns ${nextSpawnInfo.countPerInterval} ${spawnUnitLabel}${nextSpawnUnitSuffix}/s.`
      : '';
    const incomeText = stats.goldPerTurn > 0 ? ` Income +${stats.goldPerTurn}g/turn.` : '';
    const nextIncomeText = nextStats.goldPerTurn > 0 ? ` Income +${nextStats.goldPerTurn}g/turn.` : '';
    const attackText = attackStats
      ? ` Attack ${attackStats.attackDamage} | Range ${attackStats.attackRange} | CD ${(attackStats.attackCooldownMs / 1000).toFixed(2)}s.`
      : '';
    const nextAttackText = nextAttackStats
      ? ` Attack ${nextAttackStats.attackDamage} | Range ${nextAttackStats.attackRange} | CD ${(
          nextAttackStats.attackCooldownMs / 1000
        ).toFixed(2)}s.`
      : '';

    this.buildingUpgradePanel.classList.remove('building-upgrade--empty');
    this.buildingUpgradeSummaryEl.textContent = `${blueprint.name} Tier ${tierLabel || tier} | (${building.x}, ${building.y})`;
    this.buildingUpgradeStatsEl.textContent =
      `Current: HP ${stats.maxHp} | Aggro ${stats.aggroRange}.${attackText}${incomeText}${spawnText}` +
      ` Next ${nextTierLabel || nextTier}: HP ${nextStats.maxHp} | Aggro ${nextStats.aggroRange}.${nextAttackText}${nextIncomeText}${nextSpawnText}`;

    const upgradeReady = building.upgradeReady;
    const canUpgrade = canModify && upgradeReady && state.gold >= upgradeCost;
    this.buildingUpgradePanel.classList.toggle('building-upgrade--ready', canUpgrade);
    const upgradeLabel = canUpgrade
      ? `Upgrade to Tier ${nextTierLabel || nextTier} (${upgradeCost}g)`
      : `Upgrade (${upgradeCost}g)`;
    this.upgradeBuildingBtn.setText(upgradeLabel);
    this.upgradeBuildingBtn.setAriaDisabled(!canUpgrade);

    if (!canModify) {
      this.buildingUpgradeHintEl.textContent = 'Upgrades are available between battles only.';
    } else if (!upgradeReady) {
      this.buildingUpgradeHintEl.textContent = 'Survive a battle to unlock the next upgrade.';
    } else if (state.gold < upgradeCost) {
      this.buildingUpgradeHintEl.textContent = `Need ${upgradeCost}g to upgrade (you have ${state.gold}g).`;
    } else {
      this.buildingUpgradeHintEl.textContent = `Ready to upgrade to Tier ${nextTierLabel || nextTier}.`;
    }
  }

  private updateCanvasTooltip(state: GameState): void {
    if (!state.hoveredCell) {
      if (this.canvasTooltipTimer) {
        window.clearTimeout(this.canvasTooltipTimer);
        this.canvasTooltipTimer = null;
      }
      this.pendingCanvasTooltipKey = null;
      if (this.lastCanvasTooltipKey) {
        this.tooltip.hide();
        this.lastCanvasTooltipKey = null;
      }
      return;
    }

    const cell = state.hoveredCell;
    const key = `${cell.x},${cell.y}`;
    if (key === this.lastCanvasTooltipKey) return;
    if (this.canvasTooltipTimer && key === this.pendingCanvasTooltipKey) return;

    if (this.canvasTooltipTimer) {
      window.clearTimeout(this.canvasTooltipTimer);
      this.canvasTooltipTimer = null;
    }

    this.pendingCanvasTooltipKey = key;
    this.tooltip.hide();
    this.lastCanvasTooltipKey = null;

    this.canvasTooltipTimer = window.setTimeout(() => {
      this.canvasTooltipTimer = null;
      const current = this.store.getState();
      if (!current.hoveredCell) return;
      const currentKey = `${current.hoveredCell.x},${current.hoveredCell.y}`;
      if (currentKey !== key) return;

      const text = this.getCellTooltipText(current, current.hoveredCell);
      if (!text) return;

      const canvasRect = this.canvas.getBoundingClientRect();
      const center = this.renderer.cellToCanvasCenter(current, current.hoveredCell);
      this.tooltip.showAtClientPoint(text, canvasRect.left + center.x, canvasRect.top + center.y, 'top');
      this.lastCanvasTooltipKey = key;
      this.pendingCanvasTooltipKey = null;
    }, 140);
  }

  private showCellTooltipAtClientPoint(cell: CellCoord, clientX: number, clientY: number): void {
    if (this.canvasTooltipTimer) {
      window.clearTimeout(this.canvasTooltipTimer);
      this.canvasTooltipTimer = null;
    }
    this.pendingCanvasTooltipKey = null;
    const state = this.store.getState();
    const text = this.getCellTooltipText(state, cell);
    if (!text) return;

    const key = `${cell.x},${cell.y}`;
    this.lastCanvasTooltipKey = key;
    this.tooltip.showAtClientPoint(text, clientX, clientY, 'top');

    window.setTimeout(() => {
      if (this.lastCanvasTooltipKey !== key) return;
      this.tooltip.hide();
      this.lastCanvasTooltipKey = null;
    }, 1600);
  }

  private getCellTooltipText(state: GameState, cell: CellCoord): string | null {
    const zone = getCellZone(state.grid, cell);
    if (!zone) return null;
    const coordText = `(${cell.x}, ${cell.y})`;
    const flankCols = GAME_CONFIG.flankColsPerSide;
    const flankUnlockTurn = GAME_CONFIG.flankUnlockTurn;
    const flankActive = state.turn >= flankUnlockTurn;
    const flankDescriptor = `${flankCols} columns on each edge`;
    const flankDelaySeconds = Math.ceil(GAME_CONFIG.flankDeployDelayMs / 1000);
    const flankDelayNote =
      flankDelaySeconds > 0 ? ` Deployments here activate after ${flankDelaySeconds}s in battle.` : '';
    const playerFlank = isPlayerFlankCell(state.grid, cell, flankCols);
    const enemyFlank = isEnemyFlankCell(state.grid, cell, flankCols);

    const unit = getUnitAt(state.units, cell);
    if (unit) {
      const blueprint = getUnitBlueprint(unit.type);
      const aoeText = blueprint.aoeRadius ? `, AOE ${blueprint.aoeRadius}` : '';
      const tierText = toRoman(unit.tier);
      const tierSuffix = tierText ? ` ${tierText}` : '';
      const requiredXp = xpRequiredForTier(unit.type, unit.tier);
      const cappedXp = Math.min(unit.xp, requiredXp);
      const xpText =
        unit.xp >= requiredXp ? `${cappedXp}/${requiredXp} (capped)` : `${unit.xp}/${requiredXp}`;
      const stats = getUnitStats(unit.type, unit.tier);
      const moveSpeed = getUnitMoveSpeed(unit.type);
      const moveSpeedText = moveSpeed.toFixed(2);
      const inactiveSeconds = Math.ceil(unit.inactiveMsRemaining / 1000);
      const inactiveNote =
        unit.inactiveMsRemaining > 0
          ? ` Activating in ${inactiveSeconds}s (can be attacked; cannot attack).`
          : '';
      const upgradeHint =
        unit.team === 'PLAYER' && (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION')
          ? ` Tap to view upgrades: ${blueprint.placementCost}g, XP ${requiredXp} (once per turn).`
          : '';
      return `${coordText} ${blueprint.name}${tierSuffix} (${unit.team === 'PLAYER' ? 'You' : 'Enemy'}): HP ${unit.hp}/${stats.maxHp}, ATK ${stats.attackDamage}, RNG ${blueprint.attackRange}${aoeText}, MOV ${moveSpeedText}, XP ${xpText}.${inactiveNote}${upgradeHint}`;
    }

    const building = getBuildingAt(state.buildings, cell);
    if (building) {
      const blueprint = getBuildingBlueprint(building.type);
      const footprint = getBuildingFootprint(building.type);
      const stats = getBuildingStats(building.type, building.tier ?? 1);
      const tierLabel = toRoman(building.tier ?? 1);
      const tierText = tierLabel ? ` ${tierLabel}` : '';
      const incomeText = stats.goldPerTurn > 0 ? `, Income +${stats.goldPerTurn}g/turn` : '';
      const attackStats = getBuildingAttackStats(building.type, building.tier ?? 1);
      const attackText = attackStats
        ? `, ATK ${attackStats.attackDamage} | RNG ${attackStats.attackRange} | CD ${(attackStats.attackCooldownMs / 1000).toFixed(2)}s`
        : '';
      const spawnInfo = getBuildingSpawnInfo(building.type, building.tier ?? 1);
      const spawnUnitLabel = spawnInfo ? spawnInfo.unitType.toLowerCase() : '';
      const spawnUnitSuffix = spawnInfo && spawnInfo.countPerInterval !== 1 ? 's' : '';
      const spawnText = spawnInfo ? `, Spawns ${spawnInfo.countPerInterval} ${spawnUnitLabel}${spawnUnitSuffix}/s` : '';
      const canModify = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;
      const upgradeNote =
        building.team === 'PLAYER' && canModify && building.upgradeReady
          ? ` Upgrade ready (${blueprint.placementCost}g).`
          : '';
      const selectionNote =
        building.team === 'PLAYER' && canModify
          ? state.selectedBuildingId === building.id
            ? ' Tap again to deselect.'
            : ' Tap to select this building for upgrades.'
          : '';
      return `${coordText} ${blueprint.name}${tierText} (${building.team === 'PLAYER' ? 'You' : 'Enemy'}): HP ${building.hp}/${stats.maxHp}, Aggro ${stats.aggroRange}, Size ${footprint.width}x${footprint.height}${attackText}${incomeText}${spawnText}.${upgradeNote}${selectionNote}`;
    }

    const isUnitPlacement = state.selectedPlacementKind === 'UNIT';
    const selectionBlueprint = isUnitPlacement
      ? getUnitBlueprint(state.selectedUnitType)
      : getBuildingBlueprint(state.selectedBuildingType);
    const selectionFootprint = isUnitPlacement
      ? getPlacementFootprint(state.selectedUnitType)
      : getBuildingFootprint(state.selectedBuildingType);
    const selectionUnlocked = isUnitPlacement
      ? state.unlockedUnits[state.selectedUnitType]
      : state.unlockedBuildings[state.selectedBuildingType];
    const selectionSizeHint =
      selectionFootprint.width > 1 || selectionFootprint.height > 1
        ? ` Requires ${selectionFootprint.width}x${selectionFootprint.height} space.`
        : '';
    const selectionIncomeHint = isUnitPlacement
      ? ''
      : (() => {
          const stats = getBuildingStats(state.selectedBuildingType, 1);
          return stats.goldPerTurn > 0 ? ` Income +${stats.goldPerTurn}g/turn.` : '';
        })();
    const selectionAttackHint = isUnitPlacement
      ? ''
      : (() => {
          const attackStats = getBuildingAttackStats(state.selectedBuildingType, 1);
          if (!attackStats) return '';
          return ` ATK ${attackStats.attackDamage} | RNG ${attackStats.attackRange} | CD ${(attackStats.attackCooldownMs / 1000).toFixed(2)}s.`;
        })();
    const selectionSpawnHint = isUnitPlacement
      ? ''
      : (() => {
          const spawnInfo = getBuildingSpawnInfo(state.selectedBuildingType, 1);
          if (!spawnInfo) return '';
          const spawnUnitLabel = spawnInfo.unitType.toLowerCase();
          const spawnUnitSuffix = spawnInfo.countPerInterval !== 1 ? 's' : '';
          return ` Spawns ${spawnInfo.countPerInterval} ${spawnUnitLabel}${spawnUnitSuffix}/s (+1/s per upgrade).`;
        })();
    const selectionSquadHint = isUnitPlacement
      ? (() => {
          const squadSize = getPlacementOffsets(state.selectedUnitType).length;
          return squadSize > 1 ? ` Spawns ${squadSize} units.` : '';
        })()
      : '';
    const maxCount = !isUnitPlacement ? getBuildingBlueprint(state.selectedBuildingType).maxCount ?? 1 : 0;
    const placedCount = !isUnitPlacement
      ? state.buildings.filter(b => b.type === state.selectedBuildingType && b.team === 'PLAYER').length
      : 0;
    const limitReached = !isUnitPlacement && placedCount >= maxCount;
    const limitHint = !isUnitPlacement
      ? limitReached
        ? ` ${selectionBlueprint.name} placed ${placedCount}/${maxCount}. Cannot place more.`
        : ` ${selectionBlueprint.name} placed ${placedCount}/${maxCount}.`
      : '';

    if (zone === 'PLAYER') {
      if (playerFlank) {
        const zoneLabel = `Player flank lane (${flankDescriptor})`;
        const flankNote = flankActive
          ? ` Enemy can deploy here on turn ${flankUnlockTurn} and later.${flankDelayNote}`
          : ` Locked before turn ${flankUnlockTurn}; enemy deployment begins then.${flankDelayNote}`;
        if (state.phase !== 'DEPLOYMENT' && state.phase !== 'INTERMISSION') {
          return `${coordText} ${zoneLabel}: enemy-only lane. Deployments are locked during battle.${flankNote}`;
        }
        return `${coordText} ${zoneLabel}: enemy-only lane.${flankNote}`;
      }

      const zoneLabel = 'Player zone';
      if (state.phase !== 'DEPLOYMENT' && state.phase !== 'INTERMISSION') {
        return `${coordText} ${zoneLabel}: placements are locked during battle.`;
      }
      if (!selectionUnlocked) {
        return `${coordText} ${zoneLabel}: ${selectionBlueprint.name} is locked. Unlock it first (${selectionBlueprint.unlockCost}g).${selectionSizeHint}${selectionSquadHint}${selectionAttackHint}${selectionIncomeHint}${selectionSpawnHint}`;
      }
      const placementsLeft = Math.max(0, state.placementSlots - state.placementsUsedThisTurn);
      const placementsHint = isUnitPlacement
        ? ` Placements left this turn: ${placementsLeft}.`
        : ' Buildings do not use placement slots.';
      return `${coordText} ${zoneLabel}: tap an empty cell to place ${selectionBlueprint.name} (${selectionBlueprint.placementCost}g).${placementsHint}${selectionSizeHint}${selectionSquadHint}${selectionAttackHint}${selectionIncomeHint}${selectionSpawnHint}${limitHint}`;
    }

    if (zone === 'ENEMY' && enemyFlank) {
      const zoneLabel = `Enemy flank lane (${flankDescriptor})`;
      if (!flankActive) {
        return `${coordText} ${zoneLabel}: locked before turn ${flankUnlockTurn}. Unlocks for player deployment then.${flankDelayNote}`;
      }
      if (state.phase !== 'DEPLOYMENT' && state.phase !== 'INTERMISSION') {
        return `${coordText} ${zoneLabel}: player-deployable flank. Deployments are locked during battle.${flankDelayNote}`;
      }
      if (!selectionUnlocked) {
        return `${coordText} ${zoneLabel}: ${selectionBlueprint.name} is locked. Unlock it first (${selectionBlueprint.unlockCost}g).${selectionSizeHint}${selectionSquadHint}${selectionAttackHint}${selectionIncomeHint}${selectionSpawnHint}${flankDelayNote}`;
      }
      const placementsLeft = Math.max(0, state.placementSlots - state.placementsUsedThisTurn);
      const placementsHint = isUnitPlacement
        ? ` Placements left this turn: ${placementsLeft}.`
        : ' Buildings do not use placement slots.';
      return `${coordText} ${zoneLabel}: tap an empty cell to place ${selectionBlueprint.name} (${selectionBlueprint.placementCost}g).${placementsHint}${selectionSizeHint}${selectionSquadHint}${selectionAttackHint}${selectionIncomeHint}${selectionSpawnHint}${limitHint}${flankDelayNote}`;
    }

    if (zone === 'NEUTRAL') {
      return `${coordText} Neutral zone: you can't place units here.`;
    }

    return `${coordText} Enemy zone: enemy spawns here. Player deployment is limited to the ${flankDescriptor} on turn ${flankUnlockTurn} and later.${flankDelayNote}`;
  }
}
