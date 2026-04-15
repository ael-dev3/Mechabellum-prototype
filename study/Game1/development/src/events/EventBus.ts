import { IEventBus } from './IEventBus';

export class EventBus implements IEventBus {
    private events: Record<string, ((...args: any[]) => void)[]> = {};
    
    on(event: string, callback: (...args: any[]) => void): void {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }
    
    emit(event: string, ...args: any[]): void {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(...args));
    }
    
    clearAll(): void {
        this.events = {};
    }
} 