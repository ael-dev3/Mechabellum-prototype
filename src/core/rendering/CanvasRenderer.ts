import type { CellCoord, CellZone, GameState } from '../game/types';
import { getPlacementFootprint, getUnitBlueprint, getUnitFootprint } from '../game/unitCatalog';
import { getBuildingBlueprint, getBuildingFootprint } from '../game/buildingCatalog';
import { toRoman, xpRequiredForTier } from '../game/xp';
import { isPlayerDeployableCell } from '../game/grid';
import { GAME_CONFIG } from '../config/gameConfig';
import type { GridLayout } from './types';

const ZONE_FILL: Record<CellZone, string> = {
  PLAYER: 'rgba(46, 204, 113, 0.10)',
  NEUTRAL: 'rgba(241, 196, 15, 0.08)',
  ENEMY: 'rgba(231, 76, 60, 0.10)',
};

const TEAM_STROKE: Record<'PLAYER' | 'ENEMY', string> = {
  PLAYER: 'rgba(46, 204, 113, 0.95)',
  ENEMY: 'rgba(231, 76, 60, 0.95)',
};

const FLANK_TINT_ENEMY_DEPLOY = 'rgba(231, 76, 60, 0.16)';
const FLANK_TINT_PLAYER_DEPLOY = 'rgba(46, 204, 113, 0.16)';
const FLANK_TINT_LOCKED = 'rgba(148, 156, 166, 0.14)';
const INACTIVE_UNIT_FILL = 'rgba(148, 156, 166, 0.65)';

const GRID_MAP_SCALE = 4;
const GRID_CELL_SCALE = 0.5;
const GRID_ZOOM_MIN = 0.5;
const GRID_ZOOM_MAX = 2;

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fontFamily: string;
  private sizeCssPx = { width: 0, height: 0 };
  private layout: GridLayout = { cellSizePx: 1, gridLeftPx: 0, gridTopPx: 0, gridWidthPx: 0, gridHeightPx: 0 };
  private panPx = { x: 0, y: 0 };
  private zoom = GRID_ZOOM_MIN;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.canvas = canvas;
    this.ctx = ctx;
    this.fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
  }

  public resizeToCssPixels(width: number, height: number): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.sizeCssPx = { width, height };
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public getLayout(state: GameState): GridLayout {
    const baseLayout = this.getBaseLayout(state, this.zoom);
    this.panPx = this.clampPan(baseLayout, this.panPx);
    const gridLeftPx = baseLayout.gridLeftPx + this.panPx.x;
    const gridTopPx = baseLayout.gridTopPx + this.panPx.y;
    this.layout = { ...baseLayout, gridLeftPx, gridTopPx };
    return this.layout;
  }

  public getPan(): { x: number; y: number } {
    return { x: this.panPx.x, y: this.panPx.y };
  }

  public getZoom(): number {
    return this.zoom;
  }

  public setPan(state: GameState, panX: number, panY: number): void {
    const baseLayout = this.getBaseLayout(state, this.zoom);
    this.panPx = this.clampPan(baseLayout, { x: panX, y: panY });
  }

  public panBy(state: GameState, dx: number, dy: number): void {
    this.setPan(state, this.panPx.x + dx, this.panPx.y + dy);
  }

  public setZoom(state: GameState, zoom: number): void {
    const clampedZoom = this.clampZoom(zoom);
    this.zoom = clampedZoom;
    const baseLayout = this.getBaseLayout(state, clampedZoom);
    this.panPx = this.clampPan(baseLayout, this.panPx);
  }

  public setZoomAt(state: GameState, zoom: number, anchorX: number, anchorY: number): void {
    const layout = this.getLayout(state);
    if (layout.cellSizePx <= 0) return;
    const gridX = (anchorX - layout.gridLeftPx) / layout.cellSizePx;
    const gridY = (anchorY - layout.gridTopPx) / layout.cellSizePx;

    const clampedZoom = this.clampZoom(zoom);
    this.zoom = clampedZoom;
    const baseLayout = this.getBaseLayout(state, clampedZoom);
    const panX = anchorX - baseLayout.gridLeftPx - gridX * baseLayout.cellSizePx;
    const panY = anchorY - baseLayout.gridTopPx - gridY * baseLayout.cellSizePx;
    this.panPx = this.clampPan(baseLayout, { x: panX, y: panY });
  }

  public zoomBy(state: GameState, factor: number, anchorX: number, anchorY: number): void {
    if (!Number.isFinite(factor) || factor === 0) return;
    this.setZoomAt(state, this.zoom * factor, anchorX, anchorY);
  }

  public cellToCanvasCenter(state: GameState, cell: CellCoord): { x: number; y: number } {
    const layout = this.getLayout(state);
    return this.cellToCanvasCenterWithLayout(layout, cell);
  }

  public canvasToCell(state: GameState, canvasX: number, canvasY: number): CellCoord | null {
    const layout = this.getLayout(state);
    const localX = canvasX - layout.gridLeftPx;
    const localY = canvasY - layout.gridTopPx;
    if (localX < 0 || localY < 0 || localX >= layout.gridWidthPx || localY >= layout.gridHeightPx) return null;
    const x = Math.floor(localX / layout.cellSizePx);
    const y = Math.floor(localY / layout.cellSizePx);
    if (x < 0 || x >= state.grid.cols || y < 0 || y >= state.grid.rows) return null;
    return { x, y };
  }

  public render(state: GameState): void {
    const { width, height } = this.sizeCssPx;
    if (width <= 0 || height <= 0) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    // Backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
    bg.addColorStop(1, 'rgba(0, 0, 0, 0.10)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const layout = this.getLayout(state);

    // Zone backgrounds
    for (let y = 0; y < state.grid.rows; y++) {
      const zone = state.grid.cells[y][0]?.zone;
      const rowTop = layout.gridTopPx + y * layout.cellSizePx;
      ctx.fillStyle = zone ? ZONE_FILL[zone] : 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(layout.gridLeftPx, rowTop, layout.gridWidthPx, layout.cellSizePx);
    }

    this.drawFlankOverlays(state, layout);

    // Grid border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(layout.gridLeftPx, layout.gridTopPx, layout.gridWidthPx, layout.gridHeightPx);

    // Grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    for (let x = 1; x < state.grid.cols; x++) {
      const lineX = layout.gridLeftPx + x * layout.cellSizePx;
      ctx.beginPath();
      ctx.moveTo(lineX, layout.gridTopPx);
      ctx.lineTo(lineX, layout.gridTopPx + layout.gridHeightPx);
      ctx.stroke();
    }
    for (let y = 1; y < state.grid.rows; y++) {
      const lineY = layout.gridTopPx + y * layout.cellSizePx;
      ctx.beginPath();
      ctx.moveTo(layout.gridLeftPx, lineY);
      ctx.lineTo(layout.gridLeftPx + layout.gridWidthPx, lineY);
      ctx.stroke();
    }

    // Hover highlight in deployment/intermission
    if ((state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && state.hoveredCell && !state.matchResult) {
      const c = state.hoveredCell;
      const isUnitPlacement = state.selectedPlacementKind === 'UNIT';
      const footprint = isUnitPlacement
        ? getPlacementFootprint(state.selectedUnitType)
        : getBuildingFootprint(state.selectedBuildingType);
      const selectedBlueprint = isUnitPlacement
        ? getUnitBlueprint(state.selectedUnitType)
        : getBuildingBlueprint(state.selectedBuildingType);
      const isUnlocked = isUnitPlacement
        ? state.unlockedUnits[state.selectedUnitType]
        : state.unlockedBuildings[state.selectedBuildingType];
      const buildingLimitReached = (() => {
        if (isUnitPlacement) return false;
        const maxCount = getBuildingBlueprint(state.selectedBuildingType).maxCount ?? 1;
        const placedCount = state.buildings.filter(
          b => b.type === state.selectedBuildingType && b.team === 'PLAYER'
        ).length;
        return placedCount >= maxCount;
      })();
      const hasUnitSlot = state.placementsUsedThisTurn < state.placementSlots;
      const canPlace =
        isUnlocked &&
        !buildingLimitReached &&
        (isUnitPlacement ? hasUnitSlot : true) &&
        state.gold >= selectedBlueprint.placementCost;

      const occupied = new Set<string>();
      for (const deployment of state.deployments) {
        const deploymentFootprint = getUnitFootprint(deployment.type);
        for (let dy = 0; dy < deploymentFootprint.height; dy++) {
          for (let dx = 0; dx < deploymentFootprint.width; dx++) {
            occupied.add(`${deployment.x + dx},${deployment.y + dy}`);
          }
        }
      }
      for (const deployment of state.enemyDeployments) {
        const deploymentFootprint = getUnitFootprint(deployment.type);
        for (let dy = 0; dy < deploymentFootprint.height; dy++) {
          for (let dx = 0; dx < deploymentFootprint.width; dx++) {
            occupied.add(`${deployment.x + dx},${deployment.y + dy}`);
          }
        }
      }
      for (const building of state.buildings) {
        const buildingFootprint = getBuildingFootprint(building.type);
        for (let dy = 0; dy < buildingFootprint.height; dy++) {
          for (let dx = 0; dx < buildingFootprint.width; dx++) {
            occupied.add(`${building.x + dx},${building.y + dy}`);
          }
        }
      }

      let footprintValid = canPlace;
      for (let dy = 0; dy < footprint.height; dy++) {
        for (let dx = 0; dx < footprint.width; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (x < 0 || x >= state.grid.cols || y < 0 || y >= state.grid.rows) {
            footprintValid = false;
            continue;
          }
          if (
            !isPlayerDeployableCell(
              state.grid,
              { x, y },
              state.turn,
              GAME_CONFIG.flankColsPerSide,
              GAME_CONFIG.flankUnlockTurn
            )
          ) {
            footprintValid = false;
            continue;
          }
          if (occupied.has(`${x},${y}`)) {
            footprintValid = false;
          }
        }
      }

      const stroke = footprintValid ? 'rgba(46, 204, 113, 0.75)' : 'rgba(231, 76, 60, 0.75)';
      for (let dy = 0; dy < footprint.height; dy++) {
        for (let dx = 0; dx < footprint.width; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (x < 0 || x >= state.grid.cols || y < 0 || y >= state.grid.rows) continue;
          this.drawCellOutline(x, y, layout, stroke);
        }
      }

    }

    // Buildings
    for (const building of state.buildings) {
      if (building.hp <= 0) continue;
      this.drawBuilding(layout, building);
    }

    // Units
    const canModifyDeployments = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;
    const deploymentById = canModifyDeployments ? new Map(state.deployments.map(d => [d.id, d])) : null;
    for (const unit of state.units) {
      const blueprint = getUnitBlueprint(unit.type);
      const footprint = getUnitFootprint(unit.type);
      const center = this.unitToCanvasCenter(layout, unit, footprint);
      const footprintPx = Math.min(footprint.width, footprint.height) * layout.cellSizePx;
      const radiusScale = footprint.width > 1 || footprint.height > 1 ? 0.45 : 0.375;
      const radius = Math.max(8, footprintPx * radiusScale);
      const hpPct = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
      const isInactive = unit.inactiveMsRemaining > 0;

      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isInactive ? INACTIVE_UNIT_FILL : blueprint.color;
      ctx.fill();

      // Team border
      ctx.lineWidth = 3;
      ctx.strokeStyle = TEAM_STROKE[unit.team];
      ctx.stroke();

      if (hpPct < 1) {
        const missingAngle = (1 - hpPct) * Math.PI * 2;
        const startAngle = -Math.PI / 2;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.arc(center.x, center.y, radius + ctx.lineWidth + 2, startAngle, startAngle + missingAngle);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      const tierText = toRoman(unit.tier);
      if (tierText) {
        const fontSize = Math.max(9, Math.floor(radius));
        const textX = center.x + radius * 0.4;
        const textY = center.y + radius * 0.4;
        ctx.font = `700 ${fontSize}px ${this.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.strokeText(tierText, textX, textY);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillText(tierText, textX, textY);
      }

      if (state.selectedUnitId === unit.id) {
        this.drawSelectionRing(center.x, center.y, radius);
      }

      if (canModifyDeployments && unit.team === 'PLAYER') {
        const deployment = deploymentById?.get(unit.id) ?? null;
        const upgradedThisTurn = deployment?.lastUpgradeTurn === state.turn;
        const requiredXp = xpRequiredForTier(unit.type, unit.tier);
        const canUpgrade = !upgradedThisTurn && unit.xp >= requiredXp && state.gold >= blueprint.placementCost;
        if (canUpgrade) {
          this.drawUpgradeArrow(center.x, center.y, radius);
        }
      }
    }

    // Results overlay
    if (state.matchResult) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 28px ${this.fontFamily}`;
      const winner = state.matchResult.winner;
      const text =
        winner === 'DRAW'
          ? 'Draw'
          : winner === 'PLAYER'
            ? 'Victory!'
            : 'Defeat';
      ctx.fillText(text, width / 2, height / 2);
      ctx.font = `400 14px ${this.fontFamily}`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillText('Match over.', width / 2, height / 2 + 32);
    }
  }

  private cellToCanvasCenterWithLayout(layout: GridLayout, cell: CellCoord): { x: number; y: number } {
    const x = layout.gridLeftPx + (cell.x + 0.5) * layout.cellSizePx;
    const y = layout.gridTopPx + (cell.y + 0.5) * layout.cellSizePx;
    return { x, y };
  }

  private unitToCanvasCenter(
    layout: GridLayout,
    unit: { type: GameState['units'][number]['type']; x: number; y: number },
    footprint: { width: number; height: number }
  ): { x: number; y: number } {
    const x = layout.gridLeftPx + (unit.x + footprint.width / 2) * layout.cellSizePx;
    const y = layout.gridTopPx + (unit.y + footprint.height / 2) * layout.cellSizePx;
    return { x, y };
  }

  private getBaseLayout(state: GameState, zoom: number): GridLayout {
    const cellSizePx =
      Math.min(this.sizeCssPx.width / state.grid.cols, this.sizeCssPx.height / state.grid.rows) *
      GRID_MAP_SCALE *
      GRID_CELL_SCALE *
      zoom;
    const gridWidthPx = cellSizePx * state.grid.cols;
    const gridHeightPx = cellSizePx * state.grid.rows;
    const gridLeftPx = (this.sizeCssPx.width - gridWidthPx) / 2;
    const gridTopPx = (this.sizeCssPx.height - gridHeightPx) / 2;
    return { cellSizePx, gridLeftPx, gridTopPx, gridWidthPx, gridHeightPx };
  }

  private clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return this.zoom;
    return Math.max(GRID_ZOOM_MIN, Math.min(GRID_ZOOM_MAX, zoom));
  }

  private clampPan(baseLayout: GridLayout, pan: { x: number; y: number }): { x: number; y: number } {
    const maxPanX = Math.max(0, (baseLayout.gridWidthPx - this.sizeCssPx.width) / 2);
    const maxPanY = Math.max(0, (baseLayout.gridHeightPx - this.sizeCssPx.height) / 2);
    const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));
    return { x: clamp(pan.x, maxPanX), y: clamp(pan.y, maxPanY) };
  }

  private drawCellOutline(x: number, y: number, layout: GridLayout, strokeStyle: string): void {
    const left = layout.gridLeftPx + x * layout.cellSizePx;
    const top = layout.gridTopPx + y * layout.cellSizePx;
    this.ctx.strokeStyle = strokeStyle;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(left + 1, top + 1, layout.cellSizePx - 2, layout.cellSizePx - 2);
  }

  private drawFlankOverlays(state: GameState, layout: GridLayout): void {
    const flankCols = Math.max(
      0,
      Math.min(GAME_CONFIG.flankColsPerSide, Math.floor(state.grid.cols / 2))
    );
    if (flankCols === 0) return;

    const flankWidthPx = flankCols * layout.cellSizePx;
    const rightLeft = layout.gridLeftPx + (state.grid.cols - flankCols) * layout.cellSizePx;
    const flankActive = state.turn >= GAME_CONFIG.flankUnlockTurn;

    for (let y = 0; y < state.grid.rows; y++) {
      const zone = state.grid.cells[y][0]?.zone;
      if (zone !== 'PLAYER' && zone !== 'ENEMY') continue;
      const rowTop = layout.gridTopPx + y * layout.cellSizePx;
      const tint =
        zone === 'PLAYER'
          ? flankActive
            ? FLANK_TINT_ENEMY_DEPLOY
            : FLANK_TINT_LOCKED
          : flankActive
            ? FLANK_TINT_PLAYER_DEPLOY
            : FLANK_TINT_LOCKED;
      this.ctx.fillStyle = tint;
      this.ctx.fillRect(layout.gridLeftPx, rowTop, flankWidthPx, layout.cellSizePx);
      this.ctx.fillRect(rightLeft, rowTop, flankWidthPx, layout.cellSizePx);
    }
  }

  private drawBuilding(layout: GridLayout, building: GameState['buildings'][number]): void {
    const ctx = this.ctx;
    const blueprint = getBuildingBlueprint(building.type);
    const footprint = getBuildingFootprint(building.type);
    const left = layout.gridLeftPx + building.x * layout.cellSizePx;
    const top = layout.gridTopPx + building.y * layout.cellSizePx;
    const width = footprint.width * layout.cellSizePx;
    const height = footprint.height * layout.cellSizePx;
    const hpPct = building.maxHp > 0 ? Math.max(0, Math.min(1, building.hp / building.maxHp)) : 0;

    ctx.save();
    ctx.fillStyle = blueprint.color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(left + 1, top + 1, width - 2, height - 2);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = TEAM_STROKE[building.team];
    ctx.strokeRect(left + 1.5, top + 1.5, width - 3, height - 3);

    const barHeight = Math.max(4, Math.floor(layout.cellSizePx * 0.12));
    const barY = top + height - barHeight - 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(left + 2, barY, width - 4, barHeight);
    ctx.fillStyle = 'rgba(242, 213, 120, 0.95)';
    ctx.fillRect(left + 2, barY, (width - 4) * hpPct, barHeight);

    const label = blueprint.name.split(' ').map(word => word[0]).join('');
    const fontSize = Math.max(10, Math.floor(Math.min(width, height) * 0.2));
    ctx.font = `700 ${fontSize}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(24, 18, 6, 0.75)';
    ctx.fillText(label, left + width / 2 + 1, top + height / 2 + 1);
    ctx.fillStyle = 'rgba(255, 245, 230, 0.92)';
    ctx.fillText(label, left + width / 2, top + height / 2);

    const tierText = building.tier > 1 ? toRoman(building.tier) : '';
    if (tierText) {
      const tierSize = Math.max(9, Math.floor(fontSize * 0.7));
      ctx.font = `700 ${tierSize}px ${this.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(24, 18, 6, 0.7)';
      ctx.fillText(tierText, left + width - 4, top + 4);
      ctx.fillStyle = 'rgba(255, 245, 230, 0.9)';
      ctx.fillText(tierText, left + width - 5, top + 3);
    }
    ctx.restore();
  }

  private drawSelectionRing(centerX: number, centerY: number, radius: number): void {
    const ctx = this.ctx;
    const ringRadius = radius + Math.max(4, radius * 0.25);
    ctx.save();
    ctx.strokeStyle = 'rgba(96, 209, 255, 0.95)';
    ctx.lineWidth = Math.max(3, Math.floor(radius * 0.18));
    ctx.shadowColor = 'rgba(96, 209, 255, 0.65)';
    ctx.shadowBlur = Math.max(6, radius * 0.8);
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawUpgradeArrow(centerX: number, centerY: number, radius: number): void {
    const ctx = this.ctx;
    const arrowScale = 1.5;
    const baseHeight = Math.max(10, radius * 1.15);
    const baseWidth = Math.max(8, baseHeight * 0.7);
    const arrowHeight = baseHeight * arrowScale;
    const arrowWidth = baseWidth * arrowScale;
    const stemWidth = Math.max(3, arrowWidth * 0.25);
    const headHeight = arrowHeight * 0.55;
    const stemHeight = arrowHeight - headHeight;
    const baseY = centerY - radius - 2;
    const tipY = baseY - arrowHeight;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 214, 77, 0.95)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, tipY);
    ctx.lineTo(centerX - arrowWidth / 2, tipY + headHeight);
    ctx.lineTo(centerX - stemWidth / 2, tipY + headHeight);
    ctx.lineTo(centerX - stemWidth / 2, tipY + headHeight + stemHeight);
    ctx.lineTo(centerX + stemWidth / 2, tipY + headHeight + stemHeight);
    ctx.lineTo(centerX + stemWidth / 2, tipY + headHeight);
    ctx.lineTo(centerX + arrowWidth / 2, tipY + headHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
