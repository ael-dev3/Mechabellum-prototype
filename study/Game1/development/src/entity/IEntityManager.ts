import { Unit } from './Entity';

export interface IEntityManager {
    initialize(): void;
    getEnemyUnits(): Unit[];
    getPlayerUnits(): Unit[];
    destroy(): void;
}
