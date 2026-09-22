import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { skillsForClass } from '../data/skills'
import { MONSTERS } from '../data/monsters'
import { WEAPON_LIST } from '../data/weapons'
import { CLASSES } from '../data/classes'
import { CAMP, MAP_BOUND, SAFE_ZONE } from '../game/constants'
import { profile, about, projects, skills as skillList } from '../data/content'
import { ComboMeter, WeaponRail } from './HudExtras'
import './hud.css'

const STATE_LABELS = {
  idle: 'Calm',
  patrol: 'Roaming',
  alert: 'Alerted',
  chase: 'Enraged',
  windup: 'Winding up',
  attack: 'Attacking',
  recover: 'Recovering',
  stagger: 'Staggered!',
  dead: 'Slain',
}

/* ------------------------------- briefing -------------------------------- */

export function Briefing({ onStart, online, roomCode, players = [], isHost }) {
  const inviteLink =
    online && roomCode
      ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
      : null

  const copyInvite = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
    } catch {
      /* clipboard may be blocked; the code is shown on screen anyway */
    }
  }

  return (
    <motion.div
      className="brief-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="brief panel"
        initial={{ scale: 0.95, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="brief__eyebrow">Quest Briefing · Verdant Expanse</div>
        <h1 className="brief__title">
          The Hunt of <span className="gradient-text">{profile.name}</span>
        </h1>
        <p className="brief__desc">
          Track and slay the beasts roaming the expanse. Chain your combos, roll through their
          attacks, and spend your arts wisely. Clear the quest to earn your Guild Card.
        </p>

        {online && roomCode && (
          <div className="brief__party">
            <div className="brief__party-top">
              <div>
                <div className="brief__party-label">Camp code · share to invite</div>
                <div className="brief__party-code">{roomCode}</div>
              </div>
              <button type="button" className="brief__party-copy" onClick={copyInvite}>
                Copy link
              </button>
            </div>
            <div className="brief__party-players">
              {players.map((player) => (
                <span key={player.id} className="brief__party-player">
                  {player.isHost && '★ '}
                  {player.name}
                </span>
              ))}
            </div>
            <div className="brief__party-note">
              {isHost
                ? 'You are the hunt leader — your game runs the monsters. Others can join any time.'
                : 'Following the hunt leader. Monsters are simulated on their machine.'}
            </div>
          </div>
        )}

        <div className="brief__objectives">
          {Object.entries(MONSTERS).map(([key, monster]) => {
            const required = key === 'jagras' ? 2 : 1
            return (
              <div key={key} className="brief__objective">
                <span>
                  {monster.name} <span style={{ color: '#fbbf24' }}>{monster.rank}</span>
                </span>
                <span>×{required}</span>
              </div>
            )
          })}
        </div>

        <div className="brief__weapons">
          {WEAPON_LIST.map((weapon) => (
            <div key={weapon.id} className="brief__weapon">
              <span className="brief__weapon-emoji">{weapon.emoji}</span>
              <div>
                <strong>{weapon.name}</strong>
                <div className="brief__weapon-blurb">{weapon.blurb}</div>
              </div>
              <kbd>{weapon.key}</kbd>
            </div>
          ))}
        </div>

        <div className="brief__controls">
          <span className="brief__control">
            <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move
          </span>
          <span className="brief__control"><kbd>Shift</kbd> Sprint</span>
          <span className="brief__control"><kbd>J</kbd> / Click — Attack combo</span>
          <span className="brief__control"><kbd>Space</kbd> Dodge roll</span>
          <span className="brief__control"><kbd>1</kbd>–<kbd>4</kbd> Switch weapon</span>
          <span className="brief__control"><kbd>Q</kbd><kbd>E</kbd><kbd>R</kbd><kbd>F</kbd><kbd>C</kbd> Arts</span>
          <span className="brief__control"><kbd>Tab</kbd> Lock on</span>
          <span className="brief__control"><kbd>[</kbd><kbd>]</kbd> / drag — Camera</span>
          <span className="brief__control"><kbd>R</kbd> Ultimate: Dragon Meteor</span>
          <span className="brief__control"><kbd>G</kbd> Guild Card</span>
        </div>

        <button type="button" className="brief__btn" onClick={onStart}>
          Depart on the hunt
        </button>
      </motion.div>
    </motion.div>
  )
}

/* -------------------------------- vitals --------------------------------- */

function Vitals({ snap }) {
  const hpPct = (snap.hp / snap.maxHp) * 100
  const stamPct = (snap.stamina / snap.maxStamina) * 100
  const xpPct = snap.maxLevel ? 100 : Math.min(100, (snap.xp / Math.max(1, snap.xpNeeded)) * 100)
  const low = hpPct < 30
  const klass = CLASSES[snap.classId] ?? CLASSES.vanguard

  return (
    <div className="vitals panel">
      <div className="vitals__head">
        <span className="vitals__class" style={{ color: klass.accent }}>
          {klass.emoji} {klass.name}
        </span>
        <span className="vitals__level">Lv {snap.level}</span>
      </div>

      <div className="vitals__row">
        <div className="vitals__meta">
          <span>Health</span>
          <span>
            {snap.hp} / {snap.maxHp}
          </span>
        </div>
        <div className="bar">
          <div
            className={`bar__fill ${low ? 'bar__fill--hp-low' : 'bar__fill--hp'}`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      <div className="vitals__row">
        <div className="vitals__meta">
          <span>Stamina</span>
          <span>{snap.stamina}</span>
        </div>
        <div className="bar">
          <div className="bar__fill bar__fill--stam" style={{ width: `${stamPct}%` }} />
        </div>
      </div>

      <div className="vitals__row">
        <div className="vitals__meta">
          <span>{snap.maxLevel ? 'Max level' : 'Experience'}</span>
          <span>{snap.maxLevel ? '—' : `${snap.xp}/${snap.xpNeeded}`}</span>
        </div>
        <div className="bar bar--thin">
          <div className="bar__fill bar__fill--xp" style={{ width: `${xpPct}%` }} />
        </div>
      </div>

      {snap.momentum > 0.001 && (
        <div className="vitals__momentum">
          ⚡ Momentum +{Math.round(snap.momentum * 100)}%
        </div>
      )}
      {snap.buffTimer > 0 && (
        <div className="vitals__buff">🔥 Demon Draught · {snap.buffTimer.toFixed(1)}s</div>
      )}
    </div>
  )
}

/** Collected resources, shown as a compact tally. */
function Satchel({ collected }) {
  const entries = [
    { id: 'healthPotion', emoji: '🧪' },
    { id: 'staminaTonic', emoji: '⚡' },
    { id: 'rageShard', emoji: '🔥' },
    { id: 'material', emoji: '💎' },
  ].filter((entry) => (collected?.[entry.id] ?? 0) > 0)

  if (entries.length === 0) return null

  return (
    <div className="satchel panel">
      {entries.map((entry) => (
        <span key={entry.id} className="satchel__item" title={entry.id}>
          {entry.emoji}
          <strong>{collected[entry.id]}</strong>
        </span>
      ))}
    </div>
  )
}

/** Countdown badge during respawn invulnerability. */
function InvulnBadge({ timer }) {
  return (
    <AnimatePresence>
      {timer > 0 && (
        <motion.div
          className="invuln"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.18 }}
        >
          🛡️ Invulnerable · {timer.toFixed(1)}s
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Badge shown while standing in the camp ward. */
function SafeZoneBadge({ active }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="safezone"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <span className="safezone__pip" />
          Safe zone — recovering
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------ skill bar -------------------------------- */

// Skills are per-class; `onUse` is called with the slot key (Q/E/R/F/C) so
// the resolver can look up whatever the CURRENT class binds to that slot,
// which stays correct even if you swap classes without reloading.
function SkillBar({ snap, onUse }) {
  const kit = skillsForClass(snap.classId)

  return (
    <div className="skillbar">
      {kit.map((skill) => {
        const cd = snap.cooldowns[skill.id] ?? 0
        const ready = cd <= 0
        return (
          <button
            key={skill.id}
            type="button"
            className={`skill ${ready ? 'skill--ready' : ''} ${
              skill.ultimate ? 'skill--ultimate' : ''
            }`}
            onClick={() => onUse(skill.key)}
            title={`${skill.name} — ${skill.blurb}`}
            disabled={!ready}
          >
            <span className="skill__emoji">{skill.emoji}</span>
            <span className="skill__key">{skill.key}</span>
            {!ready && <span className="skill__cd">{Math.ceil(cd)}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------- target bar -------------------------------- */

function TargetBar({ engaged }) {
  return (
    <AnimatePresence>
      {engaged && (
        <motion.div
          className="target panel"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          <div className="target__top">
            <div className="target__name">
              {engaged.name}
              <span className="target__rank">{engaged.rank}</span>
            </div>
            <div
              className={`target__state ${
                engaged.state === 'stagger' ? 'target__state--stagger' : ''
              }`}
            >
              {STATE_LABELS[engaged.state] ?? engaged.state}
            </div>
          </div>
          <div className="bar">
            <div
              className="bar__fill"
              style={{
                width: `${(engaged.hp / engaged.maxHp) * 100}%`,
                background: 'linear-gradient(90deg, #ef4444, #fb923c)',
              }}
            />
          </div>

          {/* Monster stamina — empties as it attacks, and when it runs dry the
              monster is winded and wide open. */}
          {engaged.maxStamina > 0 && (
            <div className="target__stam">
              <div className="bar bar--tiny">
                <div
                  className="bar__fill"
                  style={{
                    width: `${(engaged.stamina / engaged.maxStamina) * 100}%`,
                    background: engaged.winded
                      ? 'linear-gradient(90deg, #6b7280, #9ca3af)'
                      : 'linear-gradient(90deg, #38bdf8, #a5f3fc)',
                  }}
                />
              </div>
            </div>
          )}

          <div className="target__footer">
            <span>
              {engaged.winded && <span className="target__winded">WINDED — punish now</span>}
              {!engaged.winded && !engaged.canSee && (
                <span className="target__unaware">Hasn't seen you</span>
              )}
            </span>
            <span className="target__hp-text">
              {engaged.hp} / {engaged.maxHp}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------------------- quest tracker ------------------------------ */

function QuestTracker({ quest, questNumber, questTotal, chainComplete, onOpenCard }) {
  if (chainComplete || !quest) {
    return (
      <div className="quest panel">
        <div className="quest__sub">
          Quest {questTotal}/{questTotal}
        </div>
        <div className="quest__title">All Hunts Complete</div>
        <div className="quest__complete">🏆 Every quest cleared</div>
        <button type="button" className="quest__btn" onClick={onOpenCard}>
          Open Guild Card
        </button>
      </div>
    )
  }

  return (
    <div className="quest panel">
      <div className="quest__sub">
        Quest {questNumber}/{questTotal}
      </div>
      <div className="quest__title">{quest.title}</div>
      {quest.blurb && <div className="quest__blurb">{quest.blurb}</div>}

      {quest.objectives.map((objective) => {
        const done = objective.killed >= objective.required
        return (
          <div
            key={objective.species}
            className={`quest__obj ${done ? 'quest__obj--done' : ''}`}
          >
            <span>
              {done ? '✔ ' : '• '}
              {objective.name}
            </span>
            <span className="quest__count">
              {Math.min(objective.killed, objective.required)}/{objective.required}
            </span>
          </div>
        )
      })}

      {quest.complete && (
        <div className="quest__complete quest__complete--transient">
          📜 Quest complete — next hunt incoming…
        </div>
      )}
    </div>
  )
}

/* -------------------------------- minimap -------------------------------- */

function Minimap({ snap }) {
  // World coords (-MAP_BOUND..MAP_BOUND) → percentage inside the minimap box.
  const toPct = (value) => ((value + MAP_BOUND) / (MAP_BOUND * 2)) * 100

  return (
    <div className="minimap panel">
      <div className="minimap__inner">
        <span className="minimap__label">Expanse</span>

        {/* Safe zone footprint */}
        <span
          className="minimap__safe"
          style={{
            left: `${toPct(SAFE_ZONE.x)}%`,
            top: `${toPct(SAFE_ZONE.z)}%`,
            width: `${(SAFE_ZONE.radius / MAP_BOUND) * 100}%`,
            height: `${(SAFE_ZONE.radius / MAP_BOUND) * 100}%`,
          }}
        />

        <span
          className="minimap__dot minimap__dot--camp"
          style={{ left: `${toPct(CAMP.x)}%`, top: `${toPct(CAMP.z)}%` }}
          title="Camp"
        />

        {snap.monsters
          .filter((monster) => !monster.dead)
          .map((monster) => (
            <span
              key={monster.id}
              className={`minimap__dot minimap__dot--${monster.species} ${
                monster.aggro ? 'minimap__dot--aggro' : ''
              }`}
              style={{ left: `${toPct(monster.x)}%`, top: `${toPct(monster.z)}%` }}
            />
          ))}

        <span
          className="minimap__dot minimap__dot--player"
          style={{ left: `${toPct(snap.playerPos.x)}%`, top: `${toPct(snap.playerPos.z)}%` }}
        />
      </div>
    </div>
  )
}

/* ------------------------------ event log -------------------------------- */

function EventLog({ events }) {
  return (
    <div className="log">
      <AnimatePresence initial={false}>
        {events.map((event) => (
          <motion.div
            key={event.id}
            className="log__item"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            <span>{event.emoji}</span>
            <span>{event.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------ guild card ------------------------------- */

const TABS = [
  { id: 'about', label: 'Hunter' },
  { id: 'work', label: 'Expeditions' },
  { id: 'skills', label: 'Proficiency' },
  { id: 'contact', label: 'Contact' },
]

export function GuildCard({ open, rewards, onClose }) {
  const [tab, setTab] = useState('about')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="card-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          <motion.div
            className="card panel"
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card__head">
              <div>
                <div className="card__eyebrow">Guild Card</div>
                <div className="card__name">{profile.name}</div>
                <div className="card__role">{profile.role}</div>
              </div>
              <button type="button" className="card__close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="card__tabs">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`card__tab ${tab === entry.id ? 'card__tab--active' : ''}`}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="card__body">
              {tab === 'about' && (
                <>
                  {about.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 20)}>{paragraph}</p>
                  ))}
                  {rewards.length > 0 && (
                    <>
                      <div className="card__eyebrow" style={{ marginTop: 14 }}>
                        Carved Materials
                      </div>
                      <div className="card__rewards">
                        {rewards.map((reward, i) => (
                          <span key={`${reward}-${i}`} className="card__reward">
                            {reward}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {tab === 'work' && (
                <div className="card__list">
                  {projects.map((project) => (
                    <div key={project.title} className="card__item">
                      <strong>{project.title}</strong>
                      <div className="card__tagline">{project.tags.join(' · ')}</div>
                      <p style={{ marginTop: 4 }}>{project.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'skills' && (
                <div className="card__list">
                  {skillList.map((skill) => (
                    <div key={skill.name} className="card__skill">
                      <span>{skill.name}</span>
                      <span className="card__skill-bar">
                        <span
                          className="card__skill-fill"
                          style={{ width: `${skill.level}%` }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'contact' && (
                <>
                  <p>{profile.tagline}</p>
                  <p>
                    <strong style={{ color: 'var(--text)' }}>{profile.email}</strong>
                  </p>
                  <div className="card__socials">
                    {profile.socials.map((social) => (
                      <a
                        key={social.name}
                        className="card__social"
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {social.name}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------------------- touch controls ----------------------------- */

function TouchControls({ input, onSkill }) {
  const hold = (key, down) => () => {
    input.current[key] = down
  }

  return (
    <>
      <div className="touch-pad">
        <button
          type="button"
          className="tbtn tbtn--up"
          onPointerDown={hold('forward', true)}
          onPointerUp={hold('forward', false)}
          onPointerLeave={hold('forward', false)}
          aria-label="Move forward"
        >
          ↑
        </button>
        <button
          type="button"
          className="tbtn tbtn--left"
          onPointerDown={hold('left', true)}
          onPointerUp={hold('left', false)}
          onPointerLeave={hold('left', false)}
          aria-label="Move left"
        >
          ←
        </button>
        <button
          type="button"
          className="tbtn tbtn--down"
          onPointerDown={hold('back', true)}
          onPointerUp={hold('back', false)}
          onPointerLeave={hold('back', false)}
          aria-label="Move back"
        >
          ↓
        </button>
        <button
          type="button"
          className="tbtn tbtn--right"
          onPointerDown={hold('right', true)}
          onPointerUp={hold('right', false)}
          onPointerLeave={hold('right', false)}
          aria-label="Move right"
        >
          →
        </button>
      </div>

      <div className="touch-acts">
        <button
          type="button"
          className="tbtn tbtn--big"
          onClick={() => input.current.pressAttack()}
          aria-label="Attack"
        >
          ⚔️
        </button>
        <button
          type="button"
          className="tbtn tbtn--big"
          onClick={() => input.current.pressDodge()}
          aria-label="Dodge"
        >
          💨
        </button>
        <button
          type="button"
          className="tbtn tbtn--big"
          onClick={() => input.current.pressLockOn()}
          aria-label="Lock on"
        >
          🎯
        </button>
        <button
          type="button"
          className="tbtn tbtn--big"
          onClick={() => onSkill('potion')}
          aria-label="Use potion"
        >
          🧪
        </button>
      </div>
    </>
  )
}

/* --------------------------------- HUD ----------------------------------- */

/** Full control reference, toggled with H. */
export const CONTROL_ROWS = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move (camera-relative)' },
  { keys: ['Shift'], label: 'Sprint (drains stamina)' },
  { keys: ['Space'], label: 'Dodge roll — i-frames' },
  { keys: ['LMB', 'J'], label: 'Attack / continue combo' },
  { keys: ['RMB drag'], label: 'Orbit camera' },
  { keys: ['Wheel'], label: 'Zoom in / out' },
  { keys: ['T', 'MMB'], label: 'Lock on / cycle target' },
  { keys: ['Q'], label: 'Power Slash' },
  { keys: ['E'], label: 'Whirlwind' },
  { keys: ['R'], label: 'Dragon Meteor (ultimate)' },
  { keys: ['F'], label: 'Mega Potion' },
  { keys: ['C'], label: 'Demon Draught' },
  { keys: ['1', '2', '3', '4'], label: 'Switch weapon' },
  { keys: [',', '.'], label: 'Rotate camera by keyboard' },
  { keys: ['G'], label: 'Guild Card' },
  { keys: ['H'], label: 'Toggle this help' },
]

export function ControlsOverlay({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="controls-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="controls panel"
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="controls__head">
              <h3>Controls</h3>
              <button type="button" className="card__close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="controls__grid">
              {CONTROL_ROWS.map((row) => (
                <div key={row.label} className="controls__row">
                  <span className="controls__keys">
                    {row.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                  <span className="controls__label">{row.label}</span>
                </div>
              ))}
            </div>
            <div className="controls__tip">
              Tip: monsters need line of sight to spot you — break it behind a cliff and they'll
              search your last known position. Watch their blue stamina bar; when it empties they
              are <strong>winded</strong> and open to a full combo.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Hud({
  snap,
  input,
  timeOfDay,
  onCycleTime,
  onOpenCard,
  cardOpen,
  onUseSkill,
  onSelectWeapon,
  onOpenControls,
}) {
  const timeIcon = timeOfDay === 'day' ? '☀️' : timeOfDay === 'dusk' ? '🌇' : '🌙'

  return (
    <div className="hud-root">
      <div className="utils">
        <button
          type="button"
          className="util-btn"
          onClick={onCycleTime}
          title="Change time of day"
          aria-label="Change time of day"
        >
          {timeIcon}
        </button>
        <button
          type="button"
          className={`util-btn ${cardOpen ? 'util-btn--on' : ''}`}
          onClick={onOpenCard}
          title="Guild Card (G)"
          aria-label="Open guild card"
        >
          🪪
        </button>
        <button
          type="button"
          className="util-btn"
          onClick={onOpenControls}
          title="Controls (H)"
          aria-label="Show controls"
        >
          ❔
        </button>
      </div>

      <EventLog events={snap.events} />
      <TargetBar engaged={snap.engaged} />
      <SafeZoneBadge active={snap.inSafeZone} />
      <InvulnBadge timer={snap.invulnTimer} />
      <Satchel collected={snap.collected} />
      <QuestTracker
        quest={snap.quest}
        questNumber={snap.questNumber}
        questTotal={snap.questTotal}
        chainComplete={snap.chainComplete}
        onOpenCard={onOpenCard}
      />
      <Minimap snap={snap} />
      <Vitals snap={snap} />
      <WeaponRail current={snap.weapon} onSelect={onSelectWeapon} />
      <ComboMeter index={snap.comboIndex} length={snap.comboLength} active={snap.attacking} />
      <SkillBar snap={snap} onUse={onUseSkill} />
      <TouchControls input={input} onSkill={onUseSkill} />

      {snap.state === 'dead' && <div className="faint">Fainted</div>}
    </div>
  )
}
