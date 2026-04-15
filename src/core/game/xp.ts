import type { UnitType } from './types';

export const XP_REWARD: Record<UnitType, number> = {
  KNIGHT: 1,
  GOBLIN: 1,
  ARCHER: 2,
  SNIPER: 5,
  MAGE: 3,
  GOLEM: 4,
};

export const XP_BASE_REQUIREMENT: Record<UnitType, number> = {
  KNIGHT: 1,
  GOBLIN: 1,
  ARCHER: 2,
  SNIPER: 5,
  MAGE: 3,
  GOLEM: 4,
};

export const xpRequiredForTier = (unitType: UnitType, tier: number): number => {
  const safeTier = Math.max(1, Math.floor(tier));
  return XP_BASE_REQUIREMENT[unitType] * Math.pow(2, safeTier - 1);
};

export const addXp = (currentXp: number, gainedXp: number, unitType: UnitType, tier: number): number => {
  const requiredXp = xpRequiredForTier(unitType, tier);
  const cappedXp = Math.min(currentXp, requiredXp);
  if (gainedXp <= 0 || cappedXp >= requiredXp) return cappedXp;
  return Math.min(cappedXp + gainedXp, requiredXp);
};

export const toRoman = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '';
  let num = Math.floor(value);
  const map: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  for (const [n, roman] of map) {
    while (num >= n) {
      result += roman;
      num -= n;
    }
  }
  return result;
};
