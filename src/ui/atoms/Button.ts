export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonOptions {
  text: string;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export class Button {
  private readonly element: HTMLButtonElement;
  private readonly onClick?: () => void;

  constructor(options: ButtonOptions) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.textContent = options.text;
    this.element.className = this.buildClassName(options.variant ?? 'primary', options.className);
    if (options.title) this.element.title = options.title;
    if (options.disabled) this.element.disabled = true;
    this.onClick = options.onClick;
    if (this.onClick) this.element.addEventListener('click', this.handleClick);
  }

  private handleClick = (): void => {
    if (this.element.disabled) return;
    if (this.element.getAttribute('aria-disabled') === 'true') return;
    this.onClick?.();
  };

  private buildClassName(variant: ButtonVariant, extra?: string): string {
    const base = `btn btn--${variant}`;
    return extra ? `${base} ${extra}` : base;
  }

  public getElement(): HTMLButtonElement {
    return this.element;
  }

  public setDisabled(disabled: boolean): void {
    this.setAriaDisabled(false);
    this.element.disabled = disabled;
  }

  public setAriaDisabled(disabled: boolean): void {
    this.element.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    this.element.classList.toggle('btn--aria-disabled', disabled);
  }

  public setActive(active: boolean): void {
    this.element.classList.toggle('btn--active', active);
  }

  public setText(text: string): void {
    this.element.textContent = text;
  }

  public toggleClass(className: string, enabled: boolean): void {
    this.element.classList.toggle(className, enabled);
  }
}
