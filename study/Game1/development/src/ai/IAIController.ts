import { Unit } from '../entity/Entity';

export interface IAIController {
    initialize(): void;
    takeTurn(units: Unit[]): void;
} 