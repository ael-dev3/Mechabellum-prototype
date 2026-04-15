export interface IEventBus {
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    clearAll(): void;
} 