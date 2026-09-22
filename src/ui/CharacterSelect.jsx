import { useState } from 'react'
import { motion } from 'framer-motion'
import { CLASS_LIST } from '../data/classes'
import { WEAPONS } from '../data/weapons'
import { MAX_LEVEL, xpToNext } from '../game/progression'
import './characterSelect.css'

/**
 * Class picker. Shows each class's role, stat shape, signature weapon and
 * passive, plus whatever level you've already earned on it (progress is stored
 * per class, so switching never wipes anything).
 */
function CharacterSelect({ progressFor, initialClass, onConfirm, onBack }) {
  const [selected, setSelected] = useState(initialClass ?? CLASS_LIST[0].id)
  const klass = CLASS_LIST.find((entry) => entry.id === selected) ?? CLASS_LIST[0]
  const progress = progressFor(klass.id)
  const needed = xpToNext(progress.level)
  const atMax = progress.level >= MAX_LEVEL
  const xpPct = atMax ? 100 : Math.min(100, (progress.xp / needed) * 100)

  // Normalised bars so the stat shape of each class is readable at a glance.
  const bars = [
    { label: 'Health', value: klass.stats.maxHp / 200 },
    { label: 'Stamina', value: klass.stats.maxStamina / 130 },
    { label: 'Speed', value: (klass.stats.speedMult - 0.85) / 0.32 },
    { label: 'Toughness', value: (1.25 - klass.stats.defenceMult) / 0.6 },
  ]

  return (
    <div className="select">
      <motion.div
        className="select__panel"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="select__head">
          <div>
            <div className="select__eyebrow">Choose your hunter</div>
            <h2 className="select__title">Pick a class</h2>
          </div>
          <button type="button" className="select__back" onClick={onBack}>
            ← Back
          </button>
        </div>

        <div className="select__body">
          {/* ---- class list ---- */}
          <div className="select__list">
            {CLASS_LIST.map((entry) => {
              const entryProgress = progressFor(entry.id)
              const active = entry.id === selected
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`class-card ${active ? 'class-card--active' : ''}`}
                  onClick={() => setSelected(entry.id)}
                  style={active ? { borderColor: entry.accent } : undefined}
                >
                  <span className="class-card__emoji" style={{ background: `${entry.accent}22` }}>
                    {entry.emoji}
                  </span>
                  <span className="class-card__text">
                    <span className="class-card__name">{entry.name}</span>
                    <span className="class-card__tag">{entry.tagline}</span>
                  </span>
                  <span className="class-card__level">
                    Lv<strong>{entryProgress.level}</strong>
                  </span>
                </button>
              )
            })}
          </div>

          {/* ---- detail for the highlighted class ---- */}
          <div className="select__detail">
            <div className="detail__top">
              <span className="detail__emoji" style={{ background: `${klass.accent}22` }}>
                {klass.emoji}
              </span>
              <div>
                <div className="detail__name" style={{ color: klass.accent }}>
                  {klass.name}
                </div>
                <div className="detail__weapon">
                  {WEAPONS[klass.weapon].emoji} Starts with {WEAPONS[klass.weapon].name}
                </div>
              </div>
            </div>

            <p className="detail__blurb">{klass.blurb}</p>

            <div className="detail__levelrow">
              <span className="detail__level">Level {progress.level}</span>
              <span className="detail__xp">
                {atMax ? 'Max level' : `${progress.xp} / ${needed} XP`}
              </span>
            </div>
            <div className="detail__xpbar">
              <div
                className="detail__xpfill"
                style={{ width: `${xpPct}%`, background: klass.accent }}
              />
            </div>

            <div className="detail__stats">
              {bars.map((bar) => (
                <div key={bar.label} className="stat">
                  <span className="stat__label">{bar.label}</span>
                  <span className="stat__bar">
                    <span
                      className="stat__fill"
                      style={{
                        width: `${Math.max(6, Math.min(100, bar.value * 100))}%`,
                        background: klass.accent,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>

            <div className="detail__passive" style={{ borderColor: `${klass.accent}55` }}>
              <div className="detail__passive-name" style={{ color: klass.accent }}>
                Passive · {klass.passive.name}
              </div>
              <div className="detail__passive-text">{klass.passive.detail}</div>
            </div>

            <div className="detail__note">
              You can switch to any weapon mid-hunt with <kbd>1</kbd>–<kbd>4</kbd>. Class only
              changes your starting weapon and stat shape.
            </div>

            <button
              type="button"
              className="select__confirm"
              onClick={() => onConfirm(klass.id)}
              style={{ background: klass.accent }}
            >
              Hunt as {klass.name}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default CharacterSelect
