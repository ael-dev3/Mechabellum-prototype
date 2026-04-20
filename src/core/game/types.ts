export type GamePhase = 'DEPLOYMENT' | 'BATTLE' | 'INTERMISSION';
export type Team = 'PLAYER' | 'ENEMY';
export type CellZone = 'PLAYER' | 'NEUTRAL' | 'ENEMY';

export type UnitType = 'KNIGHT' | 'ARCHER' | 'SNIPER' | 'MAGE' | 'GOLEM' | 'GOBLIN';
export type BuildingType = 'GOLD_MINE' | 'GOBLIN_CAVE' | 'ARCHER_TOWER';
export type PlacementKind = 'UNIT' | 'BUILDING';

export interface CellCoord {
  x: number;
  y: number;
}

export interface CellState {
  x: number;
  y: number;
  zone: CellZone;
}

export interface GridState {
  rows: number;
  cols: number;
  cells: CellState[][];
}

export interface UnitBlueprint {
  type: UnitType;
  name: string;
  unlockCost: number;
  placementCost: number;
  maxHp: number;
  attackDamage: number;
  attackRange: number;
  attackDistance?: 'MANHATTAN' | 'CHEBYSHEV';
  aoeRadius?: number;
  footprint?: { width: number; height: number };
  placementFootprint?: { width: number; height: number };
  spawnOffsets?: CellCoord[];
  attackCooldownMs: number;
  moveCooldownMs: number;
  moveSpeed: number;
  color: string;
}

export interface BuildingBlueprint {
  type: BuildingType;
  name: string;
  unlockCost: number;
  placementCost: number;
  maxHp: number;
  aggroRange: number;
  goldPerTurn?: number;
  attackDamage?: number;
  attackRange?: number;
  attackCooldownMs?: number;
  attackDistance?: 'MANHATTAN' | 'CHEBYSHEV';
  footprint: { width: number; height: number };
  maxCount?: number;
  color: string;
}

export interface UnitState {
  id: number;
  team: Team;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackCooldownMs: number;
  moveCooldownMs: number;
  inactiveMsRemaining: number;
  xp: number;
  tier: number;
}

export interface BuildingState {
  id: number;
  team: Team;
  type: BuildingType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tier: number;
  upgradeReady: boolean;
  spawnCooldownMs: number;
  attackCooldownMs: number;
}

export type SfxEventKind =
  | 'KNIGHT_HIT_KNIGHT'
  | 'KNIGHT_HIT_ARCHER'
  | 'KNIGHT_HIT_MAGE'
  | 'GOBLIN_SPAWN'
  | 'VICTORY';

export interface SfxEvent {
  kind: SfxEventKind;
  count: number;
}

export interface DeploymentUnit {
  id: number;
  type: UnitType;
  x: number;
  y: number;
  xp: number;
  tier: number;
  placedTurn?: number;
  lastUpgradeTurn?: number;
}

export interface UiMessage {
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface BattleResult {
  winner: Team | 'DRAW';
  reason: 'ELIMINATION' | 'TIME';
}

export interface RoundUnitSummary {
  type: UnitType;
  tier: number;
  count: number;
  damagePerUnit: number;
  totalDamage: number;
}

export interface RoundSummary {
  round: number;
  winner: Team | 'DRAW';
  playerDamage: number;
  enemyDamage: number;
  playerUnits: RoundUnitSummary[];
  enemyUnits: RoundUnitSummary[];
}

export interface MatchResult {
  winner: Team | 'DRAW';
  reason: 'HP';
}

export interface GameState {
  phase: GamePhase;
  turn: number;
  gold: number;
  rngSeed: number;
  goldDebtNextTurn: number;
  loanUsedThisTurn: boolean;
  enemyGoldDebtNextTurn: number;
  enemyGold: number;
  enemyUnlockedUnits: Record<UnitType, boolean>;
  enemyPlacementSlots: number;
  enemyNextPlacementSlotCost: number;
  maxHp: number;
  playerHp: number;
  enemyHp: number;
  matchResult: MatchResult | null;
  intermissionMsRemaining: number;
  pendingPlayerDamage: number;
  pendingEnemyDamage: number;
  unlockedUnits: Record<UnitType, boolean>;
  unlockedBuildings: Record<BuildingType, boolean>;
  placementSlots: number;
  placementsUsedThisTurn: number;
  nextPlacementSlotCost: number;
  grid: GridState;
  deployments: DeploymentUnit[];
  enemyDeployments: DeploymentUnit[];
  units: UnitState[];
  buildings: BuildingState[];
  nextUnitId: number;
  nextBuildingId: number;
  selectedUnitType: UnitType;
  selectedBuildingType: BuildingType;
  selectedPlacementKind: PlacementKind;
  selectedUnitId: number | null;
  selectedBuildingId: number | null;
  hoveredCell: CellCoord | null;
  message: UiMessage | null;
  sfxEventId: number;
  sfxEvents: SfxEvent[];
  battleTimeMs: number;
  result: BattleResult | null;
  lastRoundSummary: RoundSummary | null;
}
