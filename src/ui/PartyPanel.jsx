import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WEAPONS } from '../data/weapons'
import './party.css'

export const NAME_TAG_COUNT = 7

/** Floating name tags above remote hunters, positioned by RemoteHunters. */
export function NameTagLayer({ nodesRef }) {
  return (
    <div className="nametags">
      {Array.from({ length: NAME_TAG_COUNT }, (_, i) => (
        <span
          key={i}
          className="nametag"
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

/**
 * Party roster + invite link. Collapsed to a button until opened so it doesn't
 * crowd the combat HUD.
 */
export function PartyPanel({ roomCode, players, selfId, isHost, onSay, chat, onLeave }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState('')

  const inviteLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked without HTTPS/permission — select-all fallback.
      const input = document.getElementById('invite-link-input')
      if (input) {
        input.focus()
        input.select()
      }
    }
  }

  const submitChat = (event) => {
    event.preventDefault()
    if (!draft.trim()) return
    onSay(draft)
    setDraft('')
  }

  return (
    <>
      <button
        type="button"
        className={`party-toggle ${open ? 'party-toggle--on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Party"
      >
        👥
        <span className="party-toggle__count">{players.length}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            className="party"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="party__head">
              <div>
                <div className="party__label">Camp code</div>
                <div className="party__code">{roomCode}</div>
              </div>
              <button type="button" className="party__leave" onClick={onLeave} title="Leave camp">
                Leave
              </button>
            </div>

            <div className="party__invite">
              <input id="invite-link-input" className="party__link" value={inviteLink} readOnly />
              <button type="button" className="party__copy" onClick={copyLink}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>

            <div className="party__label">Hunters ({players.length}/8)</div>
            <ul className="party__list">
              {players.map((player) => (
                <li key={player.id} className="party__player">
                  <span className="party__dot" data-self={player.id === selfId} />
                  <span className="party__name">
                    {player.name}
                    {player.id === selfId && <span className="party__you"> (you)</span>}
                  </span>
                  {player.isHost && <span className="party__host" title="Hunt leader">★</span>}
                  <span className="party__weapon">
                    {WEAPONS[player.weapon]?.emoji ?? '🗡️'}
                  </span>
                </li>
              ))}
            </ul>

            {isHost && (
              <div className="party__note">
                You're the hunt leader — your game simulates the monsters.
              </div>
            )}

            <div className="party__label">Camp chat</div>
            <div className="party__chat">
              {chat.length === 0 && <div className="party__chat-empty">No messages yet.</div>}
              {chat.map((message) => (
                <div
                  key={message.id}
                  className={`party__message ${message.system ? 'party__message--system' : ''}`}
                >
                  {message.system ? (
                    message.text
                  ) : (
                    <>
                      <strong>{message.name}:</strong> {message.text}
                    </>
                  )}
                </div>
              ))}
            </div>

            <form className="party__compose" onSubmit={submitChat}>
              <input
                className="party__input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Say something…"
                maxLength={140}
              />
              <button type="submit" className="party__send">
                ➤
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
