export interface IRenderer {
    initialize(containerId: string): void;
    renderFrame(): void;
    setStarted(started: boolean): void;
    setTurn(turn: string): void;
    destroy(): void;
}