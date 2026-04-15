export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipBindOptions {
  text: string;
  placement?: TooltipPlacement;
  showDelayMs?: number;
  longPressMs?: number;
  touchHideDelayMs?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export class Tooltip {
  private readonly el: HTMLDivElement;
  private hideTimer: number | null = null;
  private readonly onWindowHide: () => void;

  constructor(parent: HTMLElement = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'tooltip';
    this.el.setAttribute('role', 'tooltip');
    this.el.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.el);

    this.onWindowHide = () => this.hide();
    window.addEventListener('scroll', this.onWindowHide, { passive: true });
    window.addEventListener('resize', this.onWindowHide);
  }

  public destroy(): void {
    window.removeEventListener('scroll', this.onWindowHide);
    window.removeEventListener('resize', this.onWindowHide);
    this.el.remove();
  }

  public hide(): void {
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el.classList.remove('tooltip--visible');
    this.el.setAttribute('aria-hidden', 'true');
  }

  public showAtClientPoint(text: string, clientX: number, clientY: number, placement: TooltipPlacement = 'top'): void {
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.el.textContent = text;
    this.el.style.left = '0px';
    this.el.style.top = '0px';
    this.el.style.visibility = 'hidden';
    this.el.classList.add('tooltip--visible');
    this.el.setAttribute('aria-hidden', 'false');

    const margin = 10;
    const offset = 12;
    const rect = this.el.getBoundingClientRect();

    let left = clientX - rect.width / 2;
    left = clamp(left, margin, window.innerWidth - margin - rect.width);

    const topPreferred = placement === 'top' ? clientY - rect.height - offset : clientY + offset;
    const topFallback = placement === 'top' ? clientY + offset : clientY - rect.height - offset;

    let top = topPreferred;
    if (top < margin || top + rect.height > window.innerHeight - margin) {
      top = topFallback;
    }
    top = clamp(top, margin, window.innerHeight - margin - rect.height);

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.visibility = 'visible';
  }

  public showForElement(text: string, el: HTMLElement, placement: TooltipPlacement = 'top'): void {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = placement === 'top' ? rect.top : rect.bottom;
    this.showAtClientPoint(text, x, y, placement);
  }

  public bind(el: HTMLElement, options: TooltipBindOptions): () => void {
    const placement = options.placement ?? 'top';
    const showDelayMs = options.showDelayMs ?? 150;
    const longPressMs = options.longPressMs ?? 450;
    const touchHideDelayMs = options.touchHideDelayMs ?? 1400;

    let hoverTimer: number | null = null;
    let pressTimer: number | null = null;
    let pressTriggered = false;
    let suppressClick = false;
    let pressStart: { x: number; y: number } | null = null;

    const clearHoverTimer = (): void => {
      if (!hoverTimer) return;
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    };

    const clearPressTimer = (): void => {
      if (!pressTimer) return;
      window.clearTimeout(pressTimer);
      pressTimer = null;
    };

    const scheduleShow = (): void => {
      clearHoverTimer();
      hoverTimer = window.setTimeout(() => {
        hoverTimer = null;
        this.showForElement(options.text, el, placement);
      }, showDelayMs);
    };

    const onPointerEnter = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      scheduleShow();
    };

    const onPointerLeave = (): void => {
      clearHoverTimer();
      clearPressTimer();
      pressTriggered = false;
      suppressClick = false;
      pressStart = null;
      this.hide();
    };

    const onFocus = (): void => {
      this.showForElement(options.text, el, placement);
    };

    const onBlur = (): void => {
      this.hide();
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse') return;
      pressStart = { x: e.clientX, y: e.clientY };
      pressTriggered = false;
      suppressClick = false;
      clearPressTimer();
      pressTimer = window.setTimeout(() => {
        pressTimer = null;
        pressTriggered = true;
        suppressClick = true;
        this.showForElement(options.text, el, placement);
      }, longPressMs);
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (!pressTimer || !pressStart) return;
      const dx = Math.abs(e.clientX - pressStart.x);
      const dy = Math.abs(e.clientY - pressStart.y);
      if (dx + dy > 10) {
        clearPressTimer();
        pressStart = null;
      }
    };

    const onPointerUpOrCancel = (): void => {
      clearPressTimer();
      pressStart = null;
      if (!pressTriggered) return;
      this.hideTimer = window.setTimeout(() => this.hide(), touchHideDelayMs);
    };

    const onClickCapture = (e: MouseEvent): void => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    };

    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUpOrCancel);
    el.addEventListener('pointercancel', onPointerUpOrCancel);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      clearHoverTimer();
      clearPressTimer();
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUpOrCancel);
      el.removeEventListener('pointercancel', onPointerUpOrCancel);
      el.removeEventListener('click', onClickCapture, true);
    };
  }
}
