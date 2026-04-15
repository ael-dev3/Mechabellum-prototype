export interface GameConfig {
  gridRows: number;
  gridCols: number;
  enemyZoneRows: number;
  neutralZoneRows: number;
  flankColsPerSide: number;
  flankUnlockTurn: number;
  flankDeployDelayMs: number;
  intermissionMs: number;
  roundResultAutoAdvanceMs: number;
  battleMaxTimeMs: number;
  simulationStepMs: number;
}

export const GAME_CONFIG: GameConfig = {
  gridRows: 36,
  gridCols: 63,
  enemyZoneRows: 15,
  neutralZoneRows: 6,
  flankColsPerSide: 4,
  flankUnlockTurn: 2,
  flankDeployDelayMs: 5000,
  intermissionMs: 180_000,
  roundResultAutoAdvanceMs: 30_000,
  battleMaxTimeMs: 60_000,
  simulationStepMs: 120,
};
