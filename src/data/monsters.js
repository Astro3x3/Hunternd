// Monster roster. Drives AI tuning, the 3D model variant, and its palette.

export const MONSTERS = {
  jagras: {
    name: 'Grass Jagras',
    rank: '★',
    model: 'quad',
    palette: {
      body: '#7fae55',
      belly: '#d9d3a6',
      accent: '#4d7935',
      plate: '#5f8c3f',
      claw: '#efe6cf',
      eye: '#f5d24a',
    },
    scale: 1,
    maxHp: 240,
    moveSpeed: 3.4,
    chaseSpeed: 5.3,
    detectRange: 15,
    loseRange: 25,
    attackRange: 2.8,
    hitRadius: 1.2,
    damage: 14,
    windup: 0.45,
    active: 0.16,
    recover: 0.7,
    attackCooldown: 1.5,
    staggerThreshold: 65,
    staggerTime: 1.1,
    reward: 'Jagras Hide',
    // Attacking costs stamina. Regen while aggroed is deliberately *lower*
    // than the spend rate, so a monster that keeps pressuring you will
    // eventually gas out — that's the window you're meant to punish. Calm
    // monsters recover quickly, so disengaging resets the fight.
    stamina: { max: 100, regen: 4, calmRegen: 20, attackCost: 32, windedTime: 1.8 },
    drops: [
      { id: 'healthPotion', chance: 0.45 },
      { id: 'staminaTonic', chance: 0.3 },
      { id: 'material', chance: 1 },
    ],
  },

  raptor: {
    name: 'Shrike Raptor',
    rank: '★★',
    model: 'biped',
    palette: {
      body: '#8f6fc4',
      belly: '#e6daf3',
      accent: '#5b4287',
      plate: '#6f56a3',
      claw: '#fdf3d8',
      eye: '#ffe066',
    },
    scale: 1,
    maxHp: 320,
    moveSpeed: 4.2,
    chaseSpeed: 6.8,
    detectRange: 18,
    loseRange: 29,
    attackRange: 3.0,
    hitRadius: 1.25,
    damage: 19,
    windup: 0.32,
    active: 0.14,
    recover: 0.48,
    attackCooldown: 1.05,
    staggerThreshold: 75,
    staggerTime: 0.9,
    reward: 'Raptor Talon',
    // Fast attacker with a shallow pool — gasses out quickly if it commits.
    stamina: { max: 95, regen: 5, calmRegen: 22, attackCost: 24, windedTime: 1.5 },
    drops: [
      { id: 'healthPotion', chance: 0.5 },
      { id: 'staminaTonic', chance: 0.4 },
      { id: 'rageShard', chance: 0.2 },
      { id: 'material', chance: 1 },
    ],
  },

  drake: {
    name: 'Ember Rathwyrm',
    rank: '★★★',
    model: 'drake',
    palette: {
      body: '#b94a37',
      belly: '#e6c189',
      accent: '#79291d',
      plate: '#8f3626',
      claw: '#f3e4c4',
      eye: '#ffb347',
      membrane: '#d4654a',
    },
    scale: 1.45,
    maxHp: 700,
    moveSpeed: 3.2,
    chaseSpeed: 5.9,
    detectRange: 22,
    loseRange: 36,
    attackRange: 4.4,
    hitRadius: 2.0,
    damage: 32,
    windup: 0.62,
    active: 0.22,
    recover: 0.95,
    attackCooldown: 2.0,
    staggerThreshold: 140,
    staggerTime: 1.4,
    reward: 'Rathwyrm Plate',
    // Deep pool: the drake can pressure you for a long time, but a sustained
    // fight will eventually wind it — and that's your opening on the boss.
    stamina: { max: 220, regen: 6, calmRegen: 16, attackCost: 48, breathCost: 65, windedTime: 2.4 },
    drops: [
      { id: 'healthPotion', chance: 1 },
      { id: 'healthPotion', chance: 0.6 },
      { id: 'staminaTonic', chance: 0.7 },
      { id: 'rageShard', chance: 0.55 },
      { id: 'material', chance: 1 },
      { id: 'material', chance: 0.8 },
    ],
    // Fire breath: used at mid range instead of closing in.
    ranged: {
      minRange: 7,
      maxRange: 19,
      cooldown: 5.5,
      windup: 0.85,
      damage: 26,
      speed: 17,
      radius: 0.75,
      life: 1.8,
      shots: 3,
      spread: 0.18,
    },
  },
}

/**
 * Dens are placed per-biome and kept well clear of the camp safe zone at
 * (0, 30) so you always get a calm approach before the first fight.
 */
export const MONSTER_SPAWNS = [
  { id: 'jagras-1', species: 'jagras', den: [-6, 2], patrol: 9, biome: 'plains' },
  { id: 'jagras-2', species: 'jagras', den: [14, 4], patrol: 8, biome: 'plains' },
  { id: 'jagras-3', species: 'jagras', den: [-18, -14], patrol: 9, biome: 'forest' },
  { id: 'raptor-1', species: 'raptor', den: [-24, -22], patrol: 10, biome: 'forest' },
  { id: 'raptor-2', species: 'raptor', den: [24, -10], patrol: 10, biome: 'highlands' },
  { id: 'raptor-3', species: 'raptor', den: [27, 19], patrol: 9, biome: 'frost' },
  { id: 'jagras-4', species: 'jagras', den: [-27, 13], patrol: 8, biome: 'mire' },
  { id: 'drake-1', species: 'drake', den: [-2, -33], patrol: 11, biome: 'ashen' },
]
