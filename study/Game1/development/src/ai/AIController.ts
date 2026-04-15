/**
 * Handles AI logic and decision making for enemy units.
 */
import { IAIController } from './IAIController';
import { Unit } from '../entity/Entity';

export class AIController implements IAIController {
  initialize(): void {
    console.log('AI controller initialized');
  }
  
  takeTurn(units: Unit[]): void {
    console.log(`AI taking turn with ${units.length} units`);
  }
}
