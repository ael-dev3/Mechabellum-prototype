import type { BuildingState, GridState, Team, UnitState } from './types';
import {
  getUnitBlueprint,
  getUnitCenter,
  getUnitFootprint,
  getUnitFootprintCells,
  getUnitMoveCooldownMs,
  getUnitStats,
} from './unitCatalog';
import { getBuildingAttackStats, getBuildingCenter, getBuildingFootprint, getBuildingStats } from './buildingCatalog';
import { addXp, XP_REWARD } from './xp';

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const BUILDING_HITBOX_PADDING = 0.35;

const keyOf = (x: number, y: number): string => `${x},${y}`;

const zoneOf = (grid: GridState, unit: UnitState): 'PLAYER' | 'NEUTRAL' | 'ENEMY' => grid.cells[unit.y][unit.x].zone;

const findNeutralCenterY = (grid: GridState): number | null => {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < grid.rows; y++) {
    if (grid.cells[y][0]?.zone !== 'NEUTRAL') continue;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
  return Math.floor((minY + maxY) / 2);
};

interface AttackIntent {
  attackerId: number;
  attackerKind: 'UNIT' | 'BUILDING';
  defenderId: number;
  defenderKind: 'UNIT' | 'BUILDING';
  damage: number;
}

interface MoveIntent {
  unitId: number;
  toX: number;
  toY: number;
}

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const getBuildingEngagementPoint = (
  unitCenter: { x: number; y: number },
  building: BuildingState
): { x: number; y: number } => {
  const footprint = getBuildingFootprint(building.type);
  const minX = building.x + 0.5 - BUILDING_HITBOX_PADDING;
  const maxX = building.x + footprint.width - 0.5 + BUILDING_HITBOX_PADDING;
  const minY = building.y + 0.5 - BUILDING_HITBOX_PADDING;
  const maxY = building.y + footprint.height - 0.5 + BUILDING_HITBOX_PADDING;
  return {
    x: clamp(unitCenter.x, minX, maxX),
    y: clamp(unitCenter.y, minY, maxY),
  };
};

type TargetCandidate =
  | { kind: 'UNIT'; id: number; center: { x: number; y: number }; unit: UnitState }
  | { kind: 'BUILDING'; id: number; center: { x: number; y: number }; building: BuildingState };

const pickNearestTarget = (
  unit: UnitState,
  enemies: readonly UnitState[],
  enemyBuildings: readonly BuildingState[]
): TargetCandidate | null => {
  const unitCenter = getUnitCenter(unit);
  const candidates: TargetCandidate[] = [];
  const ignoreAggroRange = enemies.length === 0;

  for (const enemy of enemies) {
    candidates.push({ kind: 'UNIT', id: enemy.id, center: getUnitCenter(enemy), unit: enemy });
  }

  for (const building of enemyBuildings) {
    const stats = getBuildingStats(building.type, building.tier);
    const center = getBuildingEngagementPoint(unitCenter, building);
    const dist = manhattan(unitCenter, center);
    if (!ignoreAggroRange && dist > stats.aggroRange) continue;
    candidates.push({ kind: 'BUILDING', id: building.id, center, building });
  }

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDist = manhattan(unitCenter, best.center);
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const dist = manhattan(unitCenter, candidate.center);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
      continue;
    }
    if (dist === bestDist) {
      if (candidate.kind !== best.kind) {
        if (candidate.kind === 'UNIT') {
          best = candidate;
        }
      } else if (candidate.id < best.id) {
        best = candidate;
      }
    }
  }

  return best;
};

const canOccupyAnchor = (
  grid: GridState,
  unit: UnitState,
  anchor: { x: number; y: number },
  occupiedByKey: ReadonlyMap<string, string>
): boolean => {
  const footprint = getUnitFootprint(unit.type);
  const selfKey = `unit:${unit.id}`;
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) return false;
      const occupant = occupiedByKey.get(keyOf(x, y));
      if (occupant !== undefined && occupant !== selfKey) return false;
    }
  }
  return true;
};

const getMoveStepToward = (
  grid: GridState,
  unit: UnitState,
  target: { x: number; y: number },
  occupiedByKey: ReadonlyMap<string, string>,
  tieBreaker: 'VERTICAL' | 'HORIZONTAL',
  orbitDirection: 1 | -1
): { x: number; y: number } | null => {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const verticalFirst = absDy > absDx || (absDy === absDx && tieBreaker === 'VERTICAL');

  const candidates: Array<{ x: number; y: number }> = [];
  if (verticalFirst && dy !== 0) candidates.push({ x: unit.x, y: unit.y + Math.sign(dy) });
  if (dx !== 0) candidates.push({ x: unit.x + Math.sign(dx), y: unit.y });
  if (!verticalFirst && dy !== 0) candidates.push({ x: unit.x, y: unit.y + Math.sign(dy) });

  for (const c of candidates) {
    if (!canOccupyAnchor(grid, unit, c, occupiedByKey)) continue;
    return c;
  }

  const lateralCandidates: Array<{ x: number; y: number }> = [];
  if (absDx >= absDy) {
    lateralCandidates.push({ x: unit.x, y: unit.y + orbitDirection });
    lateralCandidates.push({ x: unit.x, y: unit.y - orbitDirection });
  } else {
    lateralCandidates.push({ x: unit.x + orbitDirection, y: unit.y });
    lateralCandidates.push({ x: unit.x - orbitDirection, y: unit.y });
  }

  for (const c of lateralCandidates) {
    if (!canOccupyAnchor(grid, unit, c, occupiedByKey)) continue;
    return c;
  }

  return null;
};

export const stepBattle = (params: {
  grid: GridState;
  units: readonly UnitState[];
  buildings: readonly BuildingState[];
  deltaMs: number;
}): {
  units: UnitState[];
  buildings: BuildingState[];
  xpGains: Map<number, number>;
  knightKnightHits: number;
  knightArcherHits: number;
  knightMageHits: number;
} => {
  const alive = params.units.filter(u => u.hp > 0).map(u => ({
    ...u,
    attackCooldownMs: Math.max(0, u.attackCooldownMs - params.deltaMs),
    moveCooldownMs: Math.max(0, u.moveCooldownMs - params.deltaMs),
    inactiveMsRemaining: Math.max(0, u.inactiveMsRemaining - params.deltaMs),
  }));

  const aliveBuildings = params.buildings.filter(b => b.hp > 0).map(b => ({
    ...b,
    attackCooldownMs: Math.max(0, b.attackCooldownMs - params.deltaMs),
  }));

  const playerUnits = alive.filter(u => u.team === 'PLAYER');
  const enemyUnits = alive.filter(u => u.team === 'ENEMY');
  const playerBuildings = aliveBuildings.filter(b => b.team === 'PLAYER');
  const enemyBuildings = aliveBuildings.filter(b => b.team === 'ENEMY');

  const occupiedByKey = new Map<string, string>();
  for (const unit of alive) {
    const footprint = getUnitFootprint(unit.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupiedByKey.set(keyOf(unit.x + dx, unit.y + dy), `unit:${unit.id}`);
      }
    }
  }
  for (const building of aliveBuildings) {
    const footprint = getBuildingFootprint(building.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupiedByKey.set(keyOf(building.x + dx, building.y + dy), `building:${building.id}`);
      }
    }
  }
  const neutralCenterY = findNeutralCenterY(params.grid);

  const zoneCounts: Record<Team, Record<'PLAYER' | 'NEUTRAL' | 'ENEMY', number>> = {
    PLAYER: { PLAYER: 0, NEUTRAL: 0, ENEMY: 0 },
    ENEMY: { PLAYER: 0, NEUTRAL: 0, ENEMY: 0 },
  };
  for (const unit of alive) {
    const zone = zoneOf(params.grid, unit);
    zoneCounts[unit.team][zone] += 1;
  }

  const attacks: AttackIntent[] = [];
  const moves: MoveIntent[] = [];
  const buildingsThatAttacked = new Set<number>();

  const considerUnit = (unit: UnitState, enemies: readonly UnitState[], enemyBuildings: readonly BuildingState[]): void => {
    if (unit.inactiveMsRemaining > 0) return;
    const target = pickNearestTarget(unit, enemies, enemyBuildings);
    if (!target) return;

    const blueprint = getUnitBlueprint(unit.type);
    const unitCenter = getUnitCenter(unit);
    const targetCenter = target.center;
    const dist =
      blueprint.attackDistance === 'CHEBYSHEV' ? chebyshev(unitCenter, targetCenter) : manhattan(unitCenter, targetCenter);
    const inRange = dist <= blueprint.attackRange;
    const canAttack = inRange && unit.attackCooldownMs === 0;

    if (canAttack) {
      if (target.kind === 'BUILDING') {
        attacks.push({
          attackerId: unit.id,
          attackerKind: 'UNIT',
          defenderId: target.id,
          defenderKind: 'BUILDING',
          damage: getUnitStats(unit.type, unit.tier).attackDamage,
        });
      } else {
        const aoeRadius = blueprint.aoeRadius ?? 0;
        if (aoeRadius > 0) {
          for (const enemy of enemies) {
            if (chebyshev(getUnitCenter(enemy), targetCenter) > aoeRadius) continue;
            attacks.push({
              attackerId: unit.id,
              attackerKind: 'UNIT',
              defenderId: enemy.id,
              defenderKind: 'UNIT',
              damage: getUnitStats(unit.type, unit.tier).attackDamage,
            });
          }
        } else {
          attacks.push({
            attackerId: unit.id,
            attackerKind: 'UNIT',
            defenderId: target.id,
            defenderKind: 'UNIT',
            damage: getUnitStats(unit.type, unit.tier).attackDamage,
          });
        }
      }
      return;
    }

    // Stay put while waiting on cooldown to avoid jittery ping-pong movement.
    if (inRange) return;
    if (unit.moveCooldownMs > 0) return;

    const currentZone = zoneOf(params.grid, unit);
    const enemyZoneCounts = zoneCounts[unit.team === 'PLAYER' ? 'ENEMY' : 'PLAYER'];
    const shouldStageToNeutral =
      neutralCenterY !== null &&
      currentZone !== 'NEUTRAL' &&
      enemyZoneCounts.NEUTRAL === 0 &&
      enemyZoneCounts[currentZone] === 0;

    const moveTarget = shouldStageToNeutral ? { x: unit.x, y: neutralCenterY } : targetCenter;
    const tieBreaker = unit.id < target.id ? 'VERTICAL' : 'HORIZONTAL';
    const orbitDirection: 1 | -1 = (unit.id + target.id) % 2 === 0 ? 1 : -1;
    const step = getMoveStepToward(params.grid, unit, moveTarget, occupiedByKey, tieBreaker, orbitDirection);
    if (!step) return;
    moves.push({ unitId: unit.id, toX: step.x, toY: step.y });
  };

  const considerBuilding = (building: BuildingState, enemies: readonly UnitState[]): void => {
    const attackStats = getBuildingAttackStats(building.type, building.tier ?? 1);
    if (!attackStats) return;
    if (building.attackCooldownMs > 0) return;
    const buildingCenter = getBuildingCenter(building);
    let bestTarget: UnitState | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const enemyCenter = getUnitCenter(enemy);
      const dist =
        attackStats.attackDistance === 'CHEBYSHEV'
          ? chebyshev(buildingCenter, enemyCenter)
          : manhattan(buildingCenter, enemyCenter);
      if (dist > attackStats.attackRange) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = enemy;
      } else if (dist === bestDist && bestTarget && enemy.id < bestTarget.id) {
        bestTarget = enemy;
      }
    }
    if (!bestTarget) return;
    attacks.push({
      attackerId: building.id,
      attackerKind: 'BUILDING',
      defenderId: bestTarget.id,
      defenderKind: 'UNIT',
      damage: attackStats.attackDamage,
    });
    buildingsThatAttacked.add(building.id);
  };

  for (const unit of alive) {
    const enemies = unit.team === 'PLAYER' ? enemyUnits : playerUnits;
    const buildings = unit.team === 'PLAYER' ? enemyBuildings : playerBuildings;
    considerUnit(unit, enemies, buildings);
  }

  for (const building of aliveBuildings) {
    const enemies = building.team === 'PLAYER' ? enemyUnits : playerUnits;
    considerBuilding(building, enemies);
  }

  const unitsById = new Map<number, UnitState>(alive.map(u => [u.id, u]));
  let knightKnightHits = 0;
  let knightArcherHits = 0;
  let knightMageHits = 0;
  for (const attack of attacks) {
    if (attack.defenderKind !== 'UNIT') continue;
    const attacker = unitsById.get(attack.attackerId);
    const defender = unitsById.get(attack.defenderId);
    if (attacker?.type !== 'KNIGHT' || !defender) continue;
    if (defender.type === 'KNIGHT') knightKnightHits += 1;
    if (defender.type === 'ARCHER') knightArcherHits += 1;
    if (defender.type === 'MAGE') knightMageHits += 1;
  }

  const damageByDefender = new Map<number, number>();
  const attacksByDefender = new Map<number, AttackIntent[]>();
  const damageByBuilding = new Map<number, number>();
  for (const a of attacks) {
    if (a.defenderKind === 'BUILDING') {
      damageByBuilding.set(a.defenderId, (damageByBuilding.get(a.defenderId) ?? 0) + a.damage);
      continue;
    }
    damageByDefender.set(a.defenderId, (damageByDefender.get(a.defenderId) ?? 0) + a.damage);
    if (a.attackerKind === 'UNIT') {
      const list = attacksByDefender.get(a.defenderId);
      if (list) {
        list.push(a);
      } else {
        attacksByDefender.set(a.defenderId, [a]);
      }
    }
  }

  const attackedByAttacker = new Set(attacks.filter(a => a.attackerKind === 'UNIT').map(a => a.attackerId));
  const xpGains = new Map<number, number>();

  for (const [defenderId, defenderAttacks] of attacksByDefender) {
    const defender = alive.find(u => u.id === defenderId);
    if (!defender) continue;
    let remainingHp = defender.hp;
    let killerId: number | null = null;
    for (const attack of defenderAttacks) {
      remainingHp -= attack.damage;
      if (remainingHp <= 0) {
        killerId = attack.attackerId;
        break;
      }
    }
    if (killerId === null) continue;
    const gain = XP_REWARD[defender.type];
    xpGains.set(killerId, (xpGains.get(killerId) ?? 0) + gain);
  }

  const afterBuildingAttacks = aliveBuildings
    .map(b => {
      const damage = damageByBuilding.get(b.id) ?? 0;
      const hp = Math.max(0, b.hp - damage);
      const attackStats = getBuildingAttackStats(b.type, b.tier ?? 1);
      const attackCooldownMs =
        buildingsThatAttacked.has(b.id) && attackStats ? attackStats.attackCooldownMs : b.attackCooldownMs;
      return { ...b, hp, attackCooldownMs };
    })
    .filter(b => b.hp > 0);

  const afterAttacks = alive
    .map(u => {
      const totalDamage = damageByDefender.get(u.id) ?? 0;
      const hp = Math.max(0, u.hp - totalDamage);
      const attackCooldownMs = attackedByAttacker.has(u.id) ? getUnitBlueprint(u.type).attackCooldownMs : u.attackCooldownMs;
      const gainedXp = xpGains.get(u.id) ?? 0;
      const xp = addXp(u.xp, gainedXp, u.type, u.tier);
      return { ...u, hp, attackCooldownMs, xp };
    })
    .filter(u => u.hp > 0);

  const occupiedAfterAttacks = new Map<string, string>();
  for (const unit of afterAttacks) {
    const footprint = getUnitFootprint(unit.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupiedAfterAttacks.set(keyOf(unit.x + dx, unit.y + dy), `unit:${unit.id}`);
      }
    }
  }
  for (const building of afterBuildingAttacks) {
    const footprint = getBuildingFootprint(building.type);
    for (let dy = 0; dy < footprint.height; dy++) {
      for (let dx = 0; dx < footprint.width; dx++) {
        occupiedAfterAttacks.set(keyOf(building.x + dx, building.y + dy), `building:${building.id}`);
      }
    }
  }
  const aliveIdsAfterAttacks = new Set<number>(afterAttacks.map(u => u.id));
  const afterAttacksById = new Map<number, UnitState>(afterAttacks.map(u => [u.id, u]));

  const winners = new Map<number, MoveIntent>();
  const takenTargets = new Set<string>();
  for (const move of moves) {
    if (!aliveIdsAfterAttacks.has(move.unitId)) continue;
    const mover = afterAttacksById.get(move.unitId);
    if (!mover) continue;
    if (!canOccupyAnchor(params.grid, mover, { x: move.toX, y: move.toY }, occupiedAfterAttacks)) continue;
    const targetCells = getUnitFootprintCells(mover.type, { x: move.toX, y: move.toY });
    if (targetCells.some(cell => takenTargets.has(keyOf(cell.x, cell.y)))) continue;
    for (const cell of targetCells) {
      takenTargets.add(keyOf(cell.x, cell.y));
    }
    winners.set(move.unitId, move);
  }

  const movedUnits = afterAttacks.map(u => {
    const winner = winners.get(u.id);
    if (!winner) return u;
    return {
      ...u,
      x: winner.toX,
      y: winner.toY,
      moveCooldownMs: getUnitMoveCooldownMs(u.type),
    };
  });

  return { units: movedUnits, buildings: afterBuildingAttacks, xpGains, knightKnightHits, knightArcherHits, knightMageHits };
};

export const countAliveByTeam = (units: readonly UnitState[], team: Team): number =>
  units.reduce((count, u) => (u.team === team && u.hp > 0 ? count + 1 : count), 0);
