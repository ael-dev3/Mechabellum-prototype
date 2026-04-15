import { IEntityManager } from './IEntityManager';
import { Unit } from './Entity';

export class EntityManager implements IEntityManager {
    private playerUnits: Unit[] = [];
    private enemyUnits: Unit[] = [];
    
    initialize(): void {
        console.log('EntityManager initialized');
    }
    
    getEnemyUnits(): Unit[] {
        return this.enemyUnits;
    }
    
    getPlayerUnits(): Unit[] {
        return this.playerUnits;
    }
    
    destroy(): void {
        console.log('EntityManager destroyed');
    }
} 