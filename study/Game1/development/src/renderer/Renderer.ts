import { IRenderer } from './IRenderer';

export class Renderer implements IRenderer {
    private container: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private started: boolean = false;
    private turn: string = '';
    private warrior: { x: number, y: number, color: string } | null = null;

    initialize(containerId: string): void {
        this.container = document.getElementById(containerId);
        if (this.container) {
            this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
            if (!this.canvas) {
                this.canvas = document.createElement('canvas');
                this.canvas.width = 800;
                this.canvas.height = 600;
                this.canvas.id = 'game-canvas';
                this.container.appendChild(this.canvas);
            }
            this.ctx = this.canvas.getContext('2d');
        }
        this.started = false;
        this.turn = '';
        this.warrior = null;
        this.renderFrame();
        console.log('Renderer initialized');
    }

    setStarted(started: boolean) {
        this.started = started;
        if (started) {
            this.turn = 'Placement';
            this.warrior = { x: 400, y: 300, color: '#ff3333' };
        } else {
            this.turn = '';
            this.warrior = null;
        }
        this.renderFrame();
    }

    setTurn(turn: string) {
        this.turn = turn;
        this.renderFrame();
    }

    renderFrame(): void {
        if (!this.ctx || !this.canvas) return;
        // Clear screen
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.started) {
            // Blank screen with centered Start button
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '32px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Game1', this.canvas.width / 2, this.canvas.height / 2 - 60);
            // Draw a fake button (visual only)
            this.ctx.fillStyle = '#444';
            this.ctx.fillRect(this.canvas.width / 2 - 75, this.canvas.height / 2 - 25, 150, 50);
            this.ctx.strokeStyle = '#fff';
            this.ctx.strokeRect(this.canvas.width / 2 - 75, this.canvas.height / 2 - 25, 150, 50);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Start', this.canvas.width / 2, this.canvas.height / 2 + 10);
            return;
        }
        // After start, show turn and warrior
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('Turn: ' + this.turn, 30, 40);
        if (this.warrior) {
            this.ctx.beginPath();
            this.ctx.arc(this.warrior.x, this.warrior.y, 30, 0, Math.PI * 2);
            this.ctx.fillStyle = this.warrior.color;
            this.ctx.fill();
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = '#fff';
            this.ctx.stroke();
            this.ctx.closePath();
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Warrior', this.warrior.x, this.warrior.y + 50);
        }
    }

    destroy(): void {
        console.log('Renderer destroyed');
    }
}