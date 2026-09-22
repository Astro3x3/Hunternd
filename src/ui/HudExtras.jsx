import { WEAPON_LIST } from '../data/weapons'

export const DAMAGE_NODE_COUNT = 24

/** Weapon selector rail. Highlights the drawn weapon and shows its hotkey. */
export function WeaponRail({ current, onSelect }) {
  return (
    <div className="weapons">
      {WEAPON_LIST.map((weapon) => (
        <button
          key={weapon.id}
          type="button"
          className={`weapon ${current === weapon.id ? 'weapon--active' : ''}`}
          onClick={() => onSelect(weapon.id)}
          title={`${weapon.name} — ${weapon.blurb}`}
        >
          <span className="weapon__emoji">{weapon.emoji}</span>
          <span className="weapon__key">{weapon.key}</span>
        </button>
      ))}
    </div>
  )
}

/** Pips showing how far into the current weapon's combo chain you are. */
export function ComboMeter({ index, length, active }) {
  if (!active) return null
  return (
    <div className="combo">
      {Array.from({ length }, (_, i) => (
        <span key={i} className={`combo__pip ${i <= index ? 'combo__pip--lit' : ''}`} />
      ))}
      <span className="combo__label">HIT {index + 1}</span>
    </div>
  )
}

/**
 * Pooled DOM nodes for floating damage numbers. DamageNumbers.jsx writes
 * transforms straight onto these, bypassing React for smooth 60fps motion.
 */
export function DamageLayer({ nodesRef }) {
  return (
    <div className="damage-layer">
      {Array.from({ length: DAMAGE_NODE_COUNT }, (_, i) => (
        <span
          key={i}
          className="damage-number"
          ref={(el) => {
            if (!nodesRef.current) nodesRef.current = []
            nodesRef.current[i] = el
          }}
          style={{ opacity: 0 }}
        />
      ))}
    </div>
  )
}
