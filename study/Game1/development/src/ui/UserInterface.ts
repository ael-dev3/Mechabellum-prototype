/**
 * Main user interface controller for the game.
 * Handles rendering, user input, and UI updates.
 */
import { IUI } from './IUI';
import { IEventBus } from '../events/IEventBus';

export class UserInterface implements IUI {
  private containerId: string = '';
  private eventBus: IEventBus | null = null;

  initialize(containerId: string, eventBus: IEventBus): void {
    this.containerId = containerId;
    this.eventBus = eventBus;
    console.log(`UI initialized with container ${containerId}`);
  }
  
  attachMenuHandlers(): void {
    // Hide canvas initially and set up start button to show it and emit startGame
    const startBtn = (document.getElementById('start-button') as HTMLButtonElement) ||
                     (document.getElementById('start-game') as HTMLButtonElement);
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    // Hide any existing canvas until game starts
    if (canvas) {
      canvas.style.display = 'none';
    }
    if (startBtn && canvas && this.eventBus) {
      startBtn.addEventListener('click', () => {
        // Hide start button/menu and show canvas
        startBtn.style.display = 'none';
        canvas.style.display = 'block';
        // Signal engine to start game loop
        this.eventBus!.emit('startGame');
      });
    }
  }
  
  processInput(): void {
    // Process user input
  }
  
  translateCanvasCoords(e: MouseEvent): { x: number, y: number } {
    const canvas = document.getElementById(this.containerId) as HTMLCanvasElement;
    const rect = canvas?.getBoundingClientRect();
    
    if (rect) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
    
    return { x: 0, y: 0 };
  }
  
  attachCanvasHandlers(
    onMouseDown: (e: MouseEvent) => void,
    onMouseMove: (e: MouseEvent) => void,
    onMouseUp: (e: MouseEvent) => void
  ): void {
    const canvas = document.getElementById(this.containerId);
    if (canvas) {
      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseup', onMouseUp);
    }
  }
  
  destroy(): void {
    console.log('UI destroyed');
  }
}
