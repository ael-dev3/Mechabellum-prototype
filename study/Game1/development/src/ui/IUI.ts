import { IEventBus } from '../events/IEventBus';

export interface IUI {
    initialize(containerId: string, eventBus: IEventBus): void;
    attachMenuHandlers(): void;
    processInput(): void;
    translateCanvasCoords(e: MouseEvent): { x: number, y: number };
    attachCanvasHandlers(
        onMouseDown: (e: MouseEvent) => void,
        onMouseMove: (e: MouseEvent) => void,
        onMouseUp: (e: MouseEvent) => void
    ): void;
    destroy(): void;
} 