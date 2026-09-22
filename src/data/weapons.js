// Four weapon classes, each with its own combo rhythm, reach and feel.
// `vfx` names the slash effect spawned on each active frame.

export const WEAPONS = {
  greatsword: {
    id: 'greatsword',
    name: 'Great Sword',
    emoji: '🗡️',
    key: '1',
    kind: 'melee',
    blurb: 'Slow, devastating overhead cleaves.',
    speedMult: 0.86,
    staggerMult: 1.35,
    combo: [
      { windup: 0.26, active: 0.13, recover: 0.3, damage: 30, reach: 3.0, arc: 1.7, knock: 1.1, vfx: 'arcWide', lunge: 2.4 },
      { windup: 0.22, active: 0.13, recover: 0.32, damage: 36, reach: 3.2, arc: 1.9, knock: 1.3, vfx: 'arcWide', lunge: 2.6 },
      { windup: 0.4, active: 0.18, recover: 0.52, damage: 62, reach: 3.6, arc: 2.3, knock: 2.2, vfx: 'arcHeavy', lunge: 3.4 },
    ],
  },

  dualblades: {
    id: 'dualblades',
    name: 'Dual Blades',
    emoji: '⚔️',
    key: '2',
    kind: 'melee',
    blurb: 'Fast flurries. Great uptime, low per-hit damage.',
    speedMult: 1.12,
    staggerMult: 0.8,
    combo: [
      { windup: 0.1, active: 0.09, recover: 0.12, damage: 14, reach: 2.2, arc: 1.7, knock: 0.3, vfx: 'arcThin', lunge: 2.2 },
      { windup: 0.08, active: 0.09, recover: 0.12, damage: 15, reach: 2.2, arc: 1.7, knock: 0.3, vfx: 'arcThin', lunge: 2.2 },
      { windup: 0.08, active: 0.09, recover: 0.14, damage: 16, reach: 2.3, arc: 1.8, knock: 0.4, vfx: 'arcThin', lunge: 2.4 },
      { windup: 0.1, active: 0.1, recover: 0.16, damage: 18, reach: 2.4, arc: 1.9, knock: 0.5, vfx: 'arcThin', lunge: 2.6 },
      { windup: 0.14, active: 0.22, recover: 0.34, damage: 34, reach: 2.6, arc: 2.6, knock: 1.2, vfx: 'spin', lunge: 1.4 },
    ],
  },

  hammer: {
    id: 'hammer',
    name: 'War Hammer',
    emoji: '🔨',
    key: '3',
    kind: 'melee',
    blurb: 'Enormous impact damage and heavy stagger.',
    speedMult: 0.8,
    staggerMult: 1.9,
    combo: [
      { windup: 0.34, active: 0.14, recover: 0.38, damage: 38, reach: 2.7, arc: 1.3, knock: 1.6, vfx: 'shock', lunge: 2.0 },
      { windup: 0.52, active: 0.18, recover: 0.6, damage: 78, reach: 3.0, arc: 1.6, knock: 3.0, vfx: 'shockBig', lunge: 2.6 },
    ],
  },

  bow: {
    id: 'bow',
    name: 'Hunting Bow',
    emoji: '🏹',
    key: '4',
    kind: 'ranged',
    blurb: 'Fires arrows from a safe distance.',
    speedMult: 1.05,
    staggerMult: 0.7,
    projectile: { speed: 34, damage: 26, radius: 0.3, life: 1.5, kind: 'arrow' },
    combo: [
      { windup: 0.22, active: 0.05, recover: 0.26, damage: 0, reach: 0, arc: 0, knock: 0, vfx: 'none', lunge: 0, fires: true },
      { windup: 0.18, active: 0.05, recover: 0.24, damage: 0, reach: 0, arc: 0, knock: 0, vfx: 'none', lunge: 0, fires: true },
      { windup: 0.3, active: 0.05, recover: 0.42, damage: 0, reach: 0, arc: 0, knock: 0, vfx: 'none', lunge: 0, fires: true, power: 2 },
    ],
  },
}

export const WEAPON_LIST = Object.values(WEAPONS)
