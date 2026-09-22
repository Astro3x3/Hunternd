import { CLASSES, DEFAULT_CLASS } from '../data/classes'

export const MAX_LEVEL = 20

/** XP awarded per kill, scaled by how dangerous the quarry is. */
export const XP_REWARDS = { jagras: 45, raptor: 85, drake: 300 }

/** Total XP needed to advance *from* `level` to the next one. */
export function xpToNext(level) {
  if (level >= MAX_LEVEL) return Infinity
  return Math.round(75 * level ** 1.32)
}

/**
 * Derives live stats from a class plus its level.
 * Growth is deliberately gentle — levels should feel like a nudge, not a gate.
 */
export function deriveStats(classId, level) {
  const klass = CLASSES[classId] ?? CLASSES[DEFAULT_CLASS]
  const steps = Math.max(0, level - 1)

  return {
    classId: klass.id,
    level,
    maxHp: Math.round(klass.stats.maxHp + steps * 9),
    maxStamina: Math.round(klass.stats.maxStamina + steps * 2.5),
    staminaRegen: klass.stats.staminaRegen + steps * 0.35,
    speedMult: klass.stats.speedMult,
    // ~2.5% damage per level, so level 20 lands around +48%.
    damageMult: klass.stats.damageMult * (1 + steps * 0.025),
    defenceMult: klass.stats.defenceMult * (1 - Math.min(0.2, steps * 0.011)),
  }
}

/**
 * Applies XP, rolling over as many levels as the amount covers.
 * Returns the number of levels gained so the caller can fire feedback.
 */
export function grantXp(progress, amount) {
  if (progress.level >= MAX_LEVEL) {
    progress.xp = 0
    return 0
  }

  progress.xp += amount
  let gained = 0

  while (progress.level < MAX_LEVEL && progress.xp >= xpToNext(progress.level)) {
    progress.xp -= xpToNext(progress.level)
    progress.level += 1
    gained += 1
  }

  if (progress.level >= MAX_LEVEL) progress.xp = 0
  return gained
}
