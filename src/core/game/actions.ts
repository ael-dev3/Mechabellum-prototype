import type { BuildingType, CellCoord, UnitType } from './types';

export interface SelectUnitAction {
  type: 'SELECT_UNIT';
  unitType: UnitType;
}

export interface SelectPlacedUnitAction {
  type: 'SELECT_PLACED_UNIT';
  unitId: number | null;
}

export interface SelectBuildingAction {
  type: 'SELECT_BUILDING';
  buildingType: BuildingType;
}

export interface SetHoveredCellAction {
  type: 'SET_HOVERED_CELL';
  cell: CellCoord | null;
}

export interface PlaceUnitAction {
  type: 'PLACE_UNIT';
  cell: CellCoord;
}

export interface PlaceBuildingAction {
  type: 'PLACE_BUILDING';
  cell: CellCoord;
}

export interface RemoveUnitAction {
  type: 'REMOVE_UNIT';
  cell: CellCoord;
}

export interface StartBattleAction {
  type: 'START_BATTLE';
}

export interface TickAction {
  type: 'TICK';
  deltaMs: number;
}

export interface NextTurnAction {
  type: 'READY';
}

export interface BuyPlacementSlotAction {
  type: 'BUY_PLACEMENT_SLOT';
}

export interface TakeLoanAction {
  type: 'TAKE_LOAN';
}

export interface IntermissionTickAction {
  type: 'INTERMISSION_TICK';
  deltaMs: number;
}

export interface ForceEndBattleAction {
  type: 'FORCE_END_BATTLE';
}

export interface UpgradeUnitAction {
  type: 'UPGRADE_UNIT';
  unitId: number;
}

export interface UpgradeAllUnitsAction {
  type: 'UPGRADE_ALL_UNITS';
}

export interface UpgradeBuildingAction {
  type: 'UPGRADE_BUILDING';
  buildingType: BuildingType;
}

export type GameAction =
  | SelectUnitAction
  | SelectPlacedUnitAction
  | SelectBuildingAction
  | SetHoveredCellAction
  | PlaceUnitAction
  | PlaceBuildingAction
  | RemoveUnitAction
  | StartBattleAction
  | TickAction
  | NextTurnAction
  | BuyPlacementSlotAction
  | TakeLoanAction
  | IntermissionTickAction
  | ForceEndBattleAction
  | UpgradeUnitAction
  | UpgradeAllUnitsAction
  | UpgradeBuildingAction;
