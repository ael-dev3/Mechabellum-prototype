import type { Screen } from '../Screen';
import { Button } from '../atoms/Button';
import { Tooltip } from '../atoms/Tooltip';
import { CURRENT_VERSION } from '../../core/config/versionCatalog';
import { getSoundEnabled, toggleSound } from '../audio';

export interface MainMenuOptions {
  onStart: () => void;
  onShowcase: () => void;
}

export class MainMenu implements Screen {
  private readonly container: HTMLDivElement;
  private readonly tooltip: Tooltip;
  private soundTooltipUnsub: (() => void) | null = null;

  constructor(options: MainMenuOptions) {
    this.container = document.createElement('div');
    this.container.className = 'screen screen--start';
    this.tooltip = new Tooltip();

    const menu = document.createElement('div');
    menu.className = 'menu';

    const title = document.createElement('h1');
    title.className = 'menu__title';
    title.textContent = 'MB';

    const subtitle = document.createElement('p');
    subtitle.className = 'menu__subtitle';
    subtitle.textContent = 'Fantasy autobattler prototype.';

    const start = new Button({
      text: `Start v${CURRENT_VERSION}`,
      variant: 'primary',
      className: 'btn--start',
      onClick: options.onStart,
    });
    const showcase = new Button({
      text: 'Mobile AI Showcase',
      variant: 'secondary',
      className: 'btn--showcase',
      onClick: options.onShowcase,
    });

    let soundButton: Button;
    const updateSoundUi = (enabled: boolean): void => {
      soundButton.setText(enabled ? 'Audio: On' : 'Audio: Off');
      soundButton.toggleClass('btn--sound-on', enabled);
      soundButton.toggleClass('btn--sound-off', !enabled);
      soundButton.getElement().setAttribute('aria-pressed', enabled ? 'true' : 'false');
      if (this.soundTooltipUnsub) {
        this.soundTooltipUnsub();
      }
      this.soundTooltipUnsub = this.tooltip.bind(soundButton.getElement(), {
        text: enabled ? 'Audio is on. Click to mute.' : 'Enable music and sound effects.',
        placement: 'bottom',
      });
    };
    soundButton = new Button({
      text: 'Audio: Off',
      variant: 'ghost',
      className: 'btn--sound',
      onClick: () => {
        const enabled = toggleSound();
        updateSoundUi(enabled);
      },
    });
    soundButton.getElement().setAttribute('aria-label', 'Toggle audio');

    const actions = document.createElement('div');
    actions.className = 'menu__actions';
    actions.appendChild(start.getElement());
    actions.appendChild(showcase.getElement());

    menu.appendChild(title);
    menu.appendChild(subtitle);
    const soundRow = document.createElement('div');
    soundRow.className = 'menu__sound';
    soundRow.appendChild(soundButton.getElement());
    menu.appendChild(soundRow);
    menu.appendChild(actions);
    updateSoundUi(getSoundEnabled());

    this.container.appendChild(menu);
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public destroy(): void {
    if (this.soundTooltipUnsub) {
      this.soundTooltipUnsub();
      this.soundTooltipUnsub = null;
    }
    this.tooltip.destroy();
  }
}
