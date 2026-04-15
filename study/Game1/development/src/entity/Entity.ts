/**
 * Represents a game entity (player, enemy, etc).
 * Handles core properties like position, health, and stats.
 */
/**
 * Represents the different types of units in the game.
 */
export enum UnitType {
  WARRIOR = 'Warrior',
  // Add more unit types as needed
}

/**
 * Interface for unit stats and properties
 */
export interface UnitStats {
  ac: number;        // Armor Class
  hp: number;        // Hit Points
  damage: string;    // Damage dice (e.g., '1d4')
  attack: number;    // Attack bonus
  range: number;     // Attack range (in grid spaces)
  color: string;     // Display color
  size: number;      // Display size (px)
}

/**
 * Unit class for all player and enemy units
 */
export class Unit {
  id: number;
  type: UnitType;
  isEnemy: boolean;
  hp: number;
  maxHp: number;
  ac: number;
  damage: string;
  attack: number;
  range: number;
  color: string;
  size: number;
  gridX: number;
  gridY: number;
  turnPlaced: number;
  inCombat: boolean;
  lastAttackTime: number;
  defeated: boolean;

  finalized: boolean = false;

  constructor(id: number, type: UnitType, stats: UnitStats, isEnemy: boolean, gridX: number, gridY: number, turnPlaced: number) {
    this.id = id;
    this.type = type;
    this.isEnemy = isEnemy;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.ac = stats.ac;
    this.damage = stats.damage;
    this.attack = stats.attack;
    this.range = stats.range;
    this.color = stats.color;
    this.size = stats.size;
    this.gridX = gridX;
    this.gridY = gridY;
    this.turnPlaced = turnPlaced;
    this.inCombat = false;
    this.lastAttackTime = 0;
    this.defeated = false;
  }

  /**
   * Factory method to create a new unit (player or enemy)
   */
  static createUnit(
    id: number,
    type: UnitType,
    isEnemy: boolean,
    gridX: number,
    gridY: number,
    turnPlaced: number
  ): Unit {
    // Define base stats for each unit type
    const baseStats: Record<UnitType, UnitStats> = {
      [UnitType.WARRIOR]: {
        ac: 15,
        hp: 5,
        damage: '1d4',
        attack: 0,
        range: 1,
        color: isEnemy ? '#3333ff' : '#ff3333',
        size: 20,
      },
      // Add more unit types as needed
    };
    return new Unit(id, type, baseStats[type], isEnemy, gridX, gridY, turnPlaced);
  }
}

