/**
 * Resolves combat between units, including attack rolls and damage calculation.
 */
import { ICombatResolver } from './ICombatResolver';

export class CombatResolver implements ICombatResolver {
    initialize(): void {
        console.log('Combat resolver initialized');
    }

    /**
     * Resolves combat between two units.
     * Returns an object with the outcome (hit/miss, damage, etc.)
     */
    resolveCombat(attacker: any, defender: any): { hit: boolean, damage: number, attackRoll: number, defenderAC: number } {
        // Roll d20 for attack
        const attackRoll = this.rollDice(20) + (attacker.type.attack || 0);
        const defenderAC = defender.type.ac || 10;
        let hit = attackRoll >= defenderAC;
        let damage = 0;
        if (hit) {
            damage = this.rollDamageDice(attacker.type.damage || '1d4');
            defender.hp -= damage;
            if (defender.hp < 0) defender.hp = 0;
        }
        return { hit, damage, attackRoll, defenderAC };
    }

    /**
     * Roll a dice with given sides (e.g., d20)
     */
    rollDice(sides: number): number {
        return Math.floor(Math.random() * sides) + 1;
    }

    /**
     * Roll damage dice in NdM format (e.g., 1d4)
     */
    rollDamageDice(diceNotation: string): number {
        const match = diceNotation.match(/(\d+)d(\d+)/);
        if (!match) return 1;
        const num = parseInt(match[1], 10);
        const sides = parseInt(match[2], 10);
        let total = 0;
        for (let i = 0; i < num; i++) {
            total += this.rollDice(sides);
        }
        return total;
    }
}
