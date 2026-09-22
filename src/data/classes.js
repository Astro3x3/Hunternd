/**
 * Hunter classes. Each shifts the base stats, favours one weapon (bonus damage
 * with it), and brings a unique passive. Every class can still swap to any
 * weapon — the specialisation is a nudge, not a lock, so nobody feels walled
 * out of a playstyle.
 */
export const CLASSES = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    emoji: '🛡️',
    tagline: 'Immovable frontline',
    blurb:
      'Soaks punishment and answers with crushing overhead swings. The forgiving pick if you are learning a monster.',
    weapon: 'greatsword',
    accent: '#7fa6e8',
    armour: { plate: '#48597c', light: '#7288ae', trim: '#d8b24a', cloth: '#8a3b34' },
    stats: {
      maxHp: 190,
      maxStamina: 95,
      speedMult: 0.94,
      damageMult: 1.0,
      defenceMult: 0.74, // incoming damage multiplier — lower is tankier
      staminaRegen: 20,
    },
    passive: { name: 'Bulwark', detail: '26% less damage taken. Larger stagger contribution.' },
    staggerBonus: 1.2,
  },

  blademaster: {
    id: 'blademaster',
    name: 'Blademaster',
    emoji: '⚔️',
    tagline: 'Relentless flurry',
    blurb:
      'Fast, fragile, and built around keeping the pressure on. Every landed hit in a chain raises your damage.',
    weapon: 'dualblades',
    accent: '#f0a3c8',
    armour: { plate: '#5c3a52', light: '#8a5a7c', trim: '#f0c3d8', cloth: '#3c2438' },
    stats: {
      maxHp: 140,
      maxStamina: 120,
      speedMult: 1.12,
      damageMult: 1.0,
      defenceMult: 1.14,
      staminaRegen: 27,
    },
    passive: { name: 'Momentum', detail: 'Each consecutive hit adds 7% damage, up to +42%.' },
    momentum: { perHit: 0.07, max: 0.42, decay: 2.2 },
  },

  warden: {
    id: 'warden',
    name: 'Warden',
    emoji: '🏹',
    tagline: 'Patient marksman',
    blurb:
      'Fights from range and punishes openings. Rolls cost less, so repositioning is cheap.',
    weapon: 'bow',
    accent: '#8fe0b0',
    armour: { plate: '#3d5c4a', light: '#628a6f', trim: '#cfe8b0', cloth: '#2f4436' },
    stats: {
      maxHp: 155,
      maxStamina: 110,
      speedMult: 1.05,
      damageMult: 1.0,
      defenceMult: 1.0,
      staminaRegen: 30,
    },
    passive: { name: 'Windrunner', detail: '35% cheaper rolls. +25% projectile damage.' },
    rollDiscount: 0.35,
    rangedBonus: 0.25,
  },

  stormcaller: {
    id: 'stormcaller',
    name: 'Stormcaller',
    emoji: '⚡',
    tagline: 'Thunder in a hammer',
    blurb:
      'Slow, enormous hits that rattle monsters. Landing a heavy blow discharges lightning around you.',
    weapon: 'hammer',
    accent: '#ffd76a',
    armour: { plate: '#4a4468', light: '#6f679a', trim: '#ffd76a', cloth: '#2e2a44' },
    stats: {
      maxHp: 170,
      maxStamina: 100,
      speedMult: 0.9,
      damageMult: 1.08,
      defenceMult: 0.9,
      staminaRegen: 22,
    },
    passive: { name: 'Discharge', detail: 'Heavy hits chain 22 lightning damage to nearby monsters.' },
    discharge: { damage: 22, radius: 5.2 },
  },
}

export const CLASS_LIST = Object.values(CLASSES)
export const DEFAULT_CLASS = 'vanguard'
