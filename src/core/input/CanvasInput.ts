import type { GameAction } from '../game/actions';
import type { GameState } from '../game/types';
import type { Store } from '../state/Store';
import type { CanvasRenderer } from '../rendering/CanvasRenderer';
import type { CellCoord } from '../game/types';
import { getUnitAt } from '../game/grid';

export class CanvasInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly store: Store<GameState, GameAction>;
  private readonly renderer: CanvasRenderer;
  private lastHoverKey: string | null = null;
  private readonly onCellLongPress?: (params: { cell: CellCoord; clientX: number; clientY: number }) => void;
  private isMouseDown = false;
  private isMousePanning = false;
  private mouseDownClient: { x: number; y: number } | null = null;
  private mouseDownPan: { x: number; y: number } | null = null;
  private readonly panThresholdPx = 6;

  private touchPointerId: number | null = null;
  private touchStartClient: { x: number; y: number } | null = null;
  private touchCell: CellCoord | null = null;
  private touchLongPressTimer: number | null = null;
  private touchLongPressFired = false;

  constructor(params: {
    canvas: HTMLCanvasElement;
    store: Store<GameState, GameAction>;
    renderer: CanvasRenderer;
    onCellLongPress?: (params: { cell: CellCoord; clientX: number; clientY: number }) => void;
  }) {
    this.canvas = params.canvas;
    this.store = params.store;
    this.renderer = params.renderer;
    this.onCellLongPress = params.onCellLongPress;
  }

  public attach(): void {
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public detach(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onPointerLeave = (): void => {
    this.clearHover();
    this.resetMousePanState();
    this.clearTouchLongPressTimer();
    this.resetTouchState();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') {
      this.maybeCancelTouchLongPress(e);
      return;
    }

    if (this.isMouseDown && (e.buttons & 1) === 0) {
      this.resetMousePanState();
      this.tryReleaseCapture(e.pointerId);
    }

    if (this.isMouseDown && this.mouseDownClient && this.mouseDownPan && (e.buttons & 1) === 1) {
      const dx = e.clientX - this.mouseDownClient.x;
      const dy = e.clientY - this.mouseDownClient.y;
      if (!this.isMousePanning) {
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > this.panThresholdPx * this.panThresholdPx) {
          this.setMousePanning(true);
          this.clearHover();
        }
      }
      if (this.isMousePanning) {
        const state = this.store.getState();
        this.renderer.setPan(state, this.mouseDownPan.x + dx, this.mouseDownPan.y + dy);
        this.renderer.render(state);
        return;
      }
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const state = this.store.getState();
    const cell = this.renderer.canvasToCell(state, x, y);

    const hoverKey = cell ? `${cell.x},${cell.y}` : null;
    if (hoverKey === this.lastHoverKey) return;
    this.lastHoverKey = hoverKey;

    this.store.dispatch({ type: 'SET_HOVERED_CELL', cell });
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') {
      this.beginTouchInteraction(e);
      return;
    }

    if (e.button !== 0) return;
    this.isMouseDown = true;
    this.setMousePanning(false);
    this.mouseDownClient = { x: e.clientX, y: e.clientY };
    this.mouseDownPan = this.renderer.getPan();
    this.tryCapture(e.pointerId);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') {
      if (this.touchPointerId !== e.pointerId) return;

      this.tryReleaseCapture(e.pointerId);
      this.clearTouchLongPressTimer();

      const cell = this.touchCell;
      const fired = this.touchLongPressFired;
      this.resetTouchState();

      if (!cell || fired) return;

      this.handleCellAction(cell);
      return;
    }

    if (!this.isMouseDown) return;
    const wasPanning = this.isMousePanning;
    this.resetMousePanState();
    this.tryReleaseCapture(e.pointerId);
    if (wasPanning || e.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const state = this.store.getState();
    const cell = this.renderer.canvasToCell(state, x, y);
    if (!cell) return;
    this.handleCellAction(cell);
  };

  private handleCellAction(cell: CellCoord): void {
    const state = this.store.getState();
    const unit = getUnitAt(state.units, cell);
    if (unit && unit.team === 'PLAYER') {
      const canSelect = (state.phase === 'DEPLOYMENT' || state.phase === 'INTERMISSION') && !state.matchResult;
      if (canSelect) {
        this.store.dispatch({ type: 'SELECT_PLACED_UNIT', unitId: unit.id });
      }
      return;
    }
    if (state.selectedPlacementKind === 'BUILDING') {
      this.store.dispatch({ type: 'PLACE_BUILDING', cell });
      return;
    }
    this.store.dispatch({ type: 'PLACE_UNIT', cell });
  }

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      this.resetMousePanState();
      this.tryReleaseCapture(e.pointerId);
      return;
    }
    if (this.touchPointerId !== e.pointerId) return;
    this.tryReleaseCapture(e.pointerId);
    this.clearTouchLongPressTimer();
    this.resetTouchState();
  };

  private onWheel = (e: WheelEvent): void => {
    if (e.deltaX === 0 && e.deltaY === 0) return;
    e.preventDefault();
    const state = this.store.getState();
    if (e.ctrlKey) {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      this.renderer.zoomBy(state, zoomFactor, x, y);
    } else {
      this.renderer.panBy(state, -e.deltaX, -e.deltaY);
    }
    this.renderer.render(state);
    this.clearHover();
  };

  private beginTouchInteraction(e: PointerEvent): void {
    this.clearTouchLongPressTimer();
    this.resetTouchState();

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const state = this.store.getState();
    const cell = this.renderer.canvasToCell(state, x, y);
    if (!cell) return;

    this.tryCapture(e.pointerId);
    this.touchPointerId = e.pointerId;
    this.touchStartClient = { x: e.clientX, y: e.clientY };
    this.touchCell = cell;
    this.touchLongPressFired = false;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    this.touchLongPressTimer = window.setTimeout(() => {
      this.touchLongPressTimer = null;
      if (!this.touchCell) return;
      this.touchLongPressFired = true;
      this.onCellLongPress?.({ cell: this.touchCell, clientX: startClientX, clientY: startClientY });
    }, 450);
  }

  private maybeCancelTouchLongPress(e: PointerEvent): void {
    if (!this.touchLongPressTimer) return;
    if (this.touchPointerId !== e.pointerId) return;
    if (!this.touchStartClient) return;

    const dx = Math.abs(e.clientX - this.touchStartClient.x);
    const dy = Math.abs(e.clientY - this.touchStartClient.y);
    if (dx + dy <= 10) return;

    this.clearTouchLongPressTimer();
  }

  private clearTouchLongPressTimer(): void {
    if (!this.touchLongPressTimer) return;
    window.clearTimeout(this.touchLongPressTimer);
    this.touchLongPressTimer = null;
  }

  private resetTouchState(): void {
    this.touchPointerId = null;
    this.touchStartClient = null;
    this.touchCell = null;
    this.touchLongPressFired = false;
  }

  private resetMousePanState(): void {
    this.isMouseDown = false;
    this.setMousePanning(false);
    this.mouseDownClient = null;
    this.mouseDownPan = null;
  }

  private setMousePanning(isPanning: boolean): void {
    this.isMousePanning = isPanning;
    this.canvas.classList.toggle('game__canvas--panning', isPanning);
  }

  private clearHover(): void {
    if (!this.lastHoverKey && !this.store.getState().hoveredCell) return;
    this.lastHoverKey = null;
    this.store.dispatch({ type: 'SET_HOVERED_CELL', cell: null });
  }

  private tryCapture(pointerId: number): void {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // no-op
    }
  }

  private tryReleaseCapture(pointerId: number): void {
    try {
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // no-op
    }
  }
}
