import { DEFAULT_CLASS } from '../data/classes'
import { MAX_LEVEL } from './progression'

const KEY = 'hunt:save:v1'

/**
 * Tiny localStorage save: display name plus per-class level/XP.
 * Wrapped in try/catch throughout because storage can be blocked entirely
 * (private mode, embedded frames) and that must never break the game.
 */
export function loadSave() {
  const fallback = { name: '', lastClass: DEFAULT_CLASS, classes: {} }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 16) : '',
      lastClass: parsed.lastClass ?? DEFAULT_CLASS,
      classes: parsed.classes && typeof parsed.classes === 'object' ? parsed.classes : {},
    }
  } catch {
    return fallback
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}

/** Reads stored progress for one class, clamped to a sane range. */
export function getClassProgress(save, classId) {
  const entry = save.classes?.[classId]
  const level = Math.min(MAX_LEVEL, Math.max(1, Math.round(entry?.level ?? 1)))
  const xp = Math.max(0, Math.round(entry?.xp ?? 0))
  return { level, xp }
}

export function saveClassProgress(classId, progress, name) {
  const save = loadSave()
  save.lastClass = classId
  if (name) save.name = name.slice(0, 16)
  save.classes = {
    ...save.classes,
    [classId]: { level: progress.level, xp: progress.xp },
  }
  writeSave(save)
}
