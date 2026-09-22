import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MONSTERS } from '../data/monsters'
import { WEAPON_LIST } from '../data/weapons'
import { profile } from '../data/content'
import './lobby.css'

const NAME_KEY = 'hunt:name'

/**
 * Entry screen. No accounts — just a display name, then either hunt solo,
 * create a camp, or join one from a code/link.
 *
 * `initialRoom` comes from the ?room= query param so a shared link lands
 * straight on the join flow with the code already filled in.
 */
function Lobby({ initialRoom, onSolo, onConnect, status, error, onClearError }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(initialRoom ?? '')
  const [mode, setMode] = useState(initialRoom ? 'join' : 'menu')

  // Remember the last name used so repeat visits skip the typing.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY)
      if (saved) setName(saved)
    } catch {
      /* storage blocked — fine, just start empty */
    }
  }, [])

  const rememberName = (value) => {
    try {
      localStorage.setItem(NAME_KEY, value)
    } catch {
      /* ignore */
    }
  }

  const trimmedName = name.trim()
  const busy = status === 'connecting'

  const handleSolo = () => {
    rememberName(trimmedName || 'Hunter')
    onSolo(trimmedName || 'Hunter')
  }

  const handleCreate = () => {
    rememberName(trimmedName || 'Hunter')
    onConnect(trimmedName || 'Hunter', null)
  }

  const handleJoin = (event) => {
    event.preventDefault()
    const room = code.trim().toUpperCase()
    if (!room) return
    rememberName(trimmedName || 'Hunter')
    onConnect(trimmedName || 'Hunter', room)
  }

  return (
    <div className="lobby">
      <motion.div
        className="lobby__card"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="lobby__eyebrow">Monster Hunt · Verdant Expanse</div>
        <h1 className="lobby__title">
          {profile.name}'s <span className="gradient-text">Hunting Grounds</span>
        </h1>
        <p className="lobby__desc">
          Track and slay the beasts roaming the expanse. Hunt alone, or share a camp link and
          take them down together.
        </p>

        <label className="lobby__field">
          <span className="lobby__label">Hunter name</span>
          <input
            className="lobby__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            autoFocus
          />
        </label>

        {error && (
          <div className="lobby__error">
            {error}
            <button type="button" className="lobby__error-close" onClick={onClearError}>
              ✕
            </button>
          </div>
        )}

        {mode === 'menu' && (
          <div className="lobby__actions">
            <button type="button" className="lobby__btn lobby__btn--primary" onClick={handleCreate} disabled={busy}>
              {busy ? 'Connecting…' : '🏕️ Create a camp'}
              <small>Get a link to invite friends</small>
            </button>
            <button type="button" className="lobby__btn" onClick={() => setMode('join')} disabled={busy}>
              🔗 Join a camp
              <small>Enter a 5-character code</small>
            </button>
            <button type="button" className="lobby__btn lobby__btn--ghost" onClick={handleSolo} disabled={busy}>
              ⚔️ Hunt solo
              <small>No server needed</small>
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form className="lobby__join" onSubmit={handleJoin}>
            <label className="lobby__field">
              <span className="lobby__label">Camp code</span>
              <input
                className="lobby__input lobby__input--code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABC12"
                maxLength={5}
              />
            </label>
            <div className="lobby__join-actions">
              <button type="button" className="lobby__btn lobby__btn--ghost" onClick={() => setMode('menu')}>
                ← Back
              </button>
              <button
                type="submit"
                className="lobby__btn lobby__btn--primary"
                disabled={busy || code.trim().length === 0}
              >
                {busy ? 'Joining…' : 'Join hunt'}
              </button>
            </div>
          </form>
        )}

        <div className="lobby__columns">
          <div>
            <div className="lobby__section">Quarry</div>
            {Object.entries(MONSTERS).map(([key, monster]) => (
              <div key={key} className="lobby__row">
                <span>{monster.name}</span>
                <span className="lobby__rank">{monster.rank}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="lobby__section">Arsenal</div>
            {WEAPON_LIST.map((weapon) => (
              <div key={weapon.id} className="lobby__row">
                <span>
                  {weapon.emoji} {weapon.name}
                </span>
                <kbd>{weapon.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Lobby
