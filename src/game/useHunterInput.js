import { useEffect, useRef } from 'react'
import { CAMERA } from './constants'

/**
 * Control scheme
 * --------------
 *  Move          WASD / arrows
 *  Sprint        Shift (hold)
 *  Dodge roll    Space
 *  Attack        Left mouse / J
 *  Arts          Q  E  R  F  C
 *  Weapons       1  2  3  4
 *  Lock on       T  /  middle mouse
 *  Camera        Right-mouse drag, or , / .
 *  Zoom          Mouse wheel
 *
 * Design notes:
 *  - Left mouse is attack ONLY. Camera orbit moved to right-drag, because
 *    sharing left-click between "swing" and "drag the camera" made both feel
 *    unreliable.
 *  - Every one-shot action ignores auto-repeat (`event.repeat`), so holding a
 *    key fires once instead of machine-gunning.
 *  - One-shots are queued and drained via `consumeX()` so a press can't be
 *    processed by two frames, and can't be missed by a slow frame either.
 */

const MOVE_KEYS = {
  w: 'forward',
  W: 'forward',
  ArrowUp: 'forward',
  s: 'back',
  S: 'back',
  ArrowDown: 'back',
  a: 'left',
  A: 'left',
  ArrowLeft: 'left',
  d: 'right',
  D: 'right',
  ArrowRight: 'right',
}

// Skills are per-class now (see data/skills.js), so the key press just reports
// which SLOT was pressed — the resolver looks up the actual skill id for the
// player's current class from that slot at press time.
const SKILL_SLOT_KEYS = {
  q: 'Q',
  Q: 'Q',
  e: 'E',
  E: 'E',
  r: 'R',
  R: 'R',
  f: 'F',
  F: 'F',
  c: 'C',
  C: 'C',
}

const WEAPON_KEYS = {
  1: 'greatsword',
  2: 'dualblades',
  3: 'hammer',
  4: 'bow',
}

export default function useHunterInput() {
  const input = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,

    cameraAngle: 0,
    cameraZoom: 1,
    rotateLeft: false,
    rotateRight: false,

    // Queued one-shots. Arrays rather than booleans so a fast double-tap
    // during one frame still produces two actions.
    _attacks: 0,
    _dodges: 0,
    _skills: [],
    _weapons: [],
    _lockOns: 0,

    consumeAttack() {
      if (this._attacks <= 0) return false
      this._attacks -= 1
      return true
    },
    consumeDodge() {
      if (this._dodges <= 0) return false
      this._dodges -= 1
      return true
    },
    consumeSkill() {
      return this._skills.length ? this._skills.shift() : null
    },
    consumeWeapon() {
      return this._weapons.length ? this._weapons.shift() : null
    },
    consumeLockOn() {
      if (this._lockOns <= 0) return false
      this._lockOns -= 1
      return true
    },

    // Called by on-screen buttons and mouse handlers.
    pressAttack() {
      this._attacks = Math.min(this._attacks + 1, 3)
    },
    pressDodge() {
      this._dodges = Math.min(this._dodges + 1, 2)
    },
    pressSkill(id) {
      if (this._skills.length < 3) this._skills.push(id)
    },
    pressWeapon(id) {
      if (this._weapons.length < 2) this._weapons.push(id)
    },
    pressLockOn() {
      this._lockOns = Math.min(this._lockOns + 1, 2)
    },
    zoomBy(delta) {
      this.cameraZoom = Math.max(
        CAMERA.zoomMin,
        Math.min(CAMERA.zoomMax, this.cameraZoom + delta),
      )
    },
    releaseAll() {
      this.forward = false
      this.back = false
      this.left = false
      this.right = false
      this.sprint = false
      this.rotateLeft = false
      this.rotateRight = false
    },
  })

  useEffect(() => {
    const state = input.current

    const onKeyDown = (event) => {
      // Never hijack typing in chat / name fields.
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return

      const move = MOVE_KEYS[event.key]
      if (move) {
        state[move] = true
        // Arrow keys scroll the page otherwise.
        if (event.key.startsWith('Arrow')) event.preventDefault()
        return
      }

      // Held modifiers are fine to re-trigger; one-shots are not.
      if (event.key === 'Shift') {
        state.sprint = true
        return
      }
      if (event.key === ',') {
        state.rotateLeft = true
        return
      }
      if (event.key === '.') {
        state.rotateRight = true
        return
      }

      if (event.repeat) return // ignore auto-repeat for everything below

      if (event.key === ' ') {
        event.preventDefault() // stop page scroll
        state.pressDodge()
      } else if (event.key === 'j' || event.key === 'J') {
        state.pressAttack()
      } else if (event.key === 't' || event.key === 'T' || event.key === 'Tab') {
        event.preventDefault() // Tab would move browser focus
        state.pressLockOn()
      } else if (SKILL_SLOT_KEYS[event.key]) {
        state.pressSkill(SKILL_SLOT_KEYS[event.key])
      } else if (WEAPON_KEYS[event.key]) {
        state.pressWeapon(WEAPON_KEYS[event.key])
      }
    }

    const onKeyUp = (event) => {
      const move = MOVE_KEYS[event.key]
      if (move) {
        state[move] = false
        return
      }
      if (event.key === 'Shift') state.sprint = false
      else if (event.key === ',') state.rotateLeft = false
      else if (event.key === '.') state.rotateRight = false
    }

    // Releasing on blur/visibility change stops keys sticking down when you
    // alt-tab mid-sprint.
    const onBlur = () => state.releaseAll()
    const onVisibility = () => {
      if (document.hidden) state.releaseAll()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return input
}
