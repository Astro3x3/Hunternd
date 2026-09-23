// Monster roster. Drives AI tuning, the 3D model variant, and its palette.

export const MONSTERS = {
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

  // Final-hunt kaiju. Only ever spawned dynamically once the drake falls (see
  // `triggerKaijuPhase` in gameState.js) — it has no entry in MONSTER_SPAWNS
  // because it doesn't belong to the regular biome roster.
  godzilla: {
    name: 'Godzilla',
    rank: '★★★★★',
    model: 'godzilla',
    palette: {
      body: '#3d4a44',
      belly: '#8fa89a',
      accent: '#232c27',
      plate: '#1c2420',
      claw: '#e8e4d8',
      eye: '#7fffb0',
    },
    // NOTE: `scale` no longer sizes the visual model — GodzillaModel auto-fits
    // the GLB to a fixed 13m target height (see GODZILLA_TARGET_HEIGHT in
    // MonsterModel.jsx), since this file's raw mesh units don't match the
    // wyvern's. `scale` here still feeds the slay-burst VFX size below.
    scale: 5.5,
    // A huge pool on purpose — this is the final boss and should feel like a
    // war of attrition, not something you burst down in one combo string.
    maxHp: 9000,
    moveSpeed: 3.2,
    chaseSpeed: 5.6,
    // detect/loseRange capped well under the map's ~40-unit half-extent
    // rather than scaled 5x with everything else, or it'd aggro from
    // literally anywhere on the map and never lose you.
    detectRange: 36,
    loseRange: 55,
    attackRange: 18,
    hitRadius: 8,
    damage: 58,
    windup: 0.7,
    active: 0.3,
    recover: 1.05,
    attackCooldown: 1.9,
    staggerThreshold: 480,
    staggerTime: 1.6,
    reward: 'Kaiju Dorsal Plate',
    // Massive pool — this fight is a war of attrition, not a burst check.
    stamina: { max: 420, regen: 8, calmRegen: 18, attackCost: 55, breathCost: 90, windedTime: 3 },
    drops: [
      { id: 'healthPotion', chance: 1 },
      { id: 'healthPotion', chance: 1 },
      { id: 'staminaTonic', chance: 0.8 },
      { id: 'rageShard', chance: 0.9 },
      { id: 'material', chance: 1 },
      { id: 'material', chance: 1 },
    ],
    // Atomic breath: same projectile pattern as the drake's fire breath,
    // just longer range, harder-hitting, and pricier in stamina.
    ranged: {
      minRange: 9,
      maxRange: 26,
      cooldown: 6.5,
      windup: 1.1,
      damage: 46,
      speed: 20,
      radius: 1.1,
      life: 2.1,
      shots: 4,
      spread: 0.14,
    },
  },
}

/**
 * The only thing roaming the map now: the dragon. Killing it is what tears
 * down this whole terrain and drops you into the Godzilla fight (see
 * `triggerKaijuPhase` in gameState.js).
 */
export const MONSTER_SPAWNS = [{ id: 'drake-1', species: 'drake', den: [-2, -33], patrol: 11, biome: 'ashen' }]
