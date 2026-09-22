import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { AnimatePresence } from 'framer-motion'
import GameScene from './world/GameScene'
import useHunterInput from './game/useHunterInput'
import useMultiplayer from './net/useMultiplayer'
import { createGameState, readSnapshot } from './game/gameState'
import { getClassProgress, loadSave, saveClassProgress } from './game/save'
import { CAMERA } from './game/constants'
import { DEFAULT_CLASS } from './data/classes'
import { Briefing, ControlsOverlay, GuildCard, Hud } from './ui/Hud'
import { DamageLayer } from './ui/HudExtras'
import Lobby from './ui/Lobby'
import CharacterSelect from './ui/CharacterSelect'
import { NameTagLayer, PartyPanel } from './ui/PartyPanel'
import './Game.css'

const TIME_CYCLE = ['day', 'dusk', 'night']

function readRoomFromUrl() {
  try {
    const value = new URLSearchParams(window.location.search).get('room')
    return value ? value.toUpperCase().slice(0, 5) : null
  } catch {
    return null
  }
}

function Game() {
  const input = useHunterInput()
  const net = useMultiplayer()

  const initialRoom = useMemo(readRoomFromUrl, [])
  const [save, setSave] = useState(() => loadSave())

  // phase: 'lobby' -> 'select' -> 'briefing' -> 'hunt'
  const [phase, setPhase] = useState('lobby')
  const [online, setOnline] = useState(false)
  const [hunterName, setHunterName] = useState('')
  const [classId, setClassId] = useState(save.lastClass ?? DEFAULT_CLASS)

  // The simulation is rebuilt when the chosen class changes, since class and
  // level determine the starting stat block.
  const [game, setGame] = useState(() => {
    const progress = getClassProgress(save, save.lastClass ?? DEFAULT_CLASS)
    return createGameState({ classId: save.lastClass ?? DEFAULT_CLASS, ...progress })
  })

  const [cardOpen, setCardOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [timeOfDay, setTimeOfDay] = useState('day')
  const [snap, setSnap] = useState(() => readSnapshot(game))

  const questWasComplete = useRef(false)
  const damageNodesRef = useRef([])
  const nameNodesRef = useRef([])
  const gameRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => setSnap(readSnapshot(game)), 90)
    return () => clearInterval(interval)
  }, [game])

  useEffect(() => {
    game.isHost = net.isHost
  }, [game, net.isHost])

  // Auto-open the Guild Card once the whole three-quest chain is cleared —
  // individual quest completions just show a transient HUD banner and roll
  // straight into the next quest, so they shouldn't interrupt play.
  useEffect(() => {
    if (snap.chainComplete && !questWasComplete.current) {
      questWasComplete.current = true
      setTimeout(() => setCardOpen(true), 900)
    }
  }, [snap.chainComplete])

  // Persist level/XP whenever a level is earned.
  useEffect(() => {
    if (snap.pendingLevelUps > 0) {
      game.player.pendingLevelUps = 0
      saveClassProgress(classId, game.player.progress, hunterName)
      setSave(loadSave())
    }
  }, [snap.pendingLevelUps, game, classId, hunterName])

  const progressFor = useCallback((id) => getClassProgress(save, id), [save])

  /* ------------------------------ lobby flow ----------------------------- */

  const goToSelect = useCallback((name) => {
    setHunterName(name)
    setPhase('select')
  }, [])

  const startSolo = useCallback(
    (name) => {
      setOnline(false)
      goToSelect(name)
    },
    [goToSelect],
  )

  const startOnline = useCallback(
    async (name, room) => {
      try {
        const result = await net.connect(name, room)
        setOnline(true)
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('room', result.room)
          window.history.replaceState({}, '', url)
        } catch {
          /* non-fatal */
        }
        goToSelect(name)
      } catch {
        // useMultiplayer surfaced the reason; stay on the lobby.
      }
    },
    [net, goToSelect],
  )

  // Build a fresh simulation for the chosen class, then show the briefing.
  const confirmClass = useCallback(
    (chosen) => {
      const progress = getClassProgress(loadSave(), chosen)
      const fresh = createGameState({ classId: chosen, ...progress })
      fresh.online = online
      fresh.isHost = net.isHost
      setClassId(chosen)
      setGame(fresh)
      setSnap(readSnapshot(fresh))
      questWasComplete.current = false
      saveClassProgress(chosen, progress, hunterName)
      setSave(loadSave())
      setPhase('briefing')
    },
    [online, net.isHost, hunterName],
  )

  const leaveRoom = useCallback(() => {
    net.disconnect()
    game.online = false
    game.isHost = true
    setOnline(false)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState({}, '', url)
    } catch {
      /* non-fatal */
    }
    game.started = false
    setPhase('lobby')
  }, [game, net])

  const beginHunt = useCallback(() => {
    game.started = true
    setPhase('hunt')
  }, [game])

  /* ------------------------------ in-game ------------------------------- */

  const useSkill = useCallback((id) => input.current.pressSkill(id), [input])
  const selectWeapon = useCallback((id) => input.current.pressWeapon(id), [input])
  const cycleTime = useCallback(() => {
    setTimeOfDay((current) => TIME_CYCLE[(TIME_CYCLE.indexOf(current) + 1) % TIME_CYCLE.length])
  }, [])
  const toggleCard = useCallback(() => setCardOpen((open) => !open), [])

  // Pause only in solo — pausing a shared world would desync everyone else.
  useEffect(() => {
    game.paused = (cardOpen || controlsOpen) && !online
  }, [game, cardOpen, controlsOpen, online])

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
      if (event.repeat) return

      if (event.key === 'g' || event.key === 'G') {
        setCardOpen((open) => !open)
        setControlsOpen(false)
      } else if (event.key === 'h' || event.key === 'H' || event.key === '?') {
        setControlsOpen((open) => !open)
        setCardOpen(false)
      } else if (event.key === 'Escape') {
        setCardOpen(false)
        setControlsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /* ---------------------------- mouse controls --------------------------- */
  // Left = attack, right-drag = orbit camera, middle = lock on, wheel = zoom.
  // Keeping attack and camera on separate buttons is what makes both feel
  // reliable; sharing left-click made every swing feel like a mis-drag.
  const orbiting = useRef(false)
  const lastX = useRef(0)

  // True when the pointer is over UI chrome rather than the world.
  const overUi = (event) =>
    Boolean(
      event.target?.closest?.(
        '.hud-root, .party, .party-toggle, .card-overlay, .lobby, .select, .brief-overlay',
      ),
    )

  const onPointerDown = (event) => {
    if (phase !== 'hunt' || overUi(event)) return

    if (event.button === 0) {
      input.current.pressAttack()
    } else if (event.button === 2) {
      orbiting.current = true
      lastX.current = event.clientX
    } else if (event.button === 1) {
      event.preventDefault()
      input.current.pressLockOn()
    }
  }

  const onPointerMove = (event) => {
    if (!orbiting.current) return
    const deltaX = event.clientX - lastX.current
    lastX.current = event.clientX
    input.current.cameraAngle -= deltaX * CAMERA.dragSpeed
  }

  const endOrbit = () => {
    orbiting.current = false
  }

  // Right-drag would otherwise open the browser context menu mid-fight.
  const onContextMenu = (event) => {
    if (phase === 'hunt') event.preventDefault()
  }

  // Wheel-to-zoom needs a REAL (non-passive) listener: React's synthetic
  // onWheel prop is attached passively for scroll-perf reasons, and calling
  // preventDefault() inside a passive listener is a no-op that also logs a
  // console warning. Attaching it manually with { passive: false } lets us
  // actually stop the page from scrolling while zooming the camera.
  useEffect(() => {
    const el = gameRef.current
    if (!el) return

    const onWheel = (event) => {
      if (phase !== 'hunt' || overUi(event)) return
      event.preventDefault()
      input.current.zoomBy(event.deltaY > 0 ? CAMERA.zoomStep : -CAMERA.zoomStep)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  return (
    <div
      ref={gameRef}
      className="game"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endOrbit}
      onPointerLeave={endOrbit}
      onPointerCancel={endOrbit}
      onContextMenu={onContextMenu}
    >
      <Canvas shadows dpr={[1, 1.6]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <GameScene
            key={classId}
            game={game}
            input={input}
            timeOfDay={timeOfDay}
            damageNodesRef={damageNodesRef}
            net={online ? net : null}
            nameNodesRef={nameNodesRef}
            roster={net.players}
          />
        </Suspense>
      </Canvas>

      <DamageLayer nodesRef={damageNodesRef} />
      {online && <NameTagLayer nodesRef={nameNodesRef} />}

      {phase === 'hunt' && (
        <>
          <Hud
            snap={snap}
            input={input}
            timeOfDay={timeOfDay}
            onCycleTime={cycleTime}
            onOpenCard={toggleCard}
            cardOpen={cardOpen}
            onUseSkill={useSkill}
            onSelectWeapon={selectWeapon}
            onOpenControls={() => setControlsOpen(true)}
          />
          {online && net.roomCode && (
            <PartyPanel
              roomCode={net.roomCode}
              players={net.players}
              selfId={net.selfId.current}
              isHost={net.isHost}
              chat={net.chat}
              onSay={net.say}
              onLeave={leaveRoom}
            />
          )}
        </>
      )}

      <GuildCard open={cardOpen} rewards={snap.rewards} onClose={() => setCardOpen(false)} />
      <ControlsOverlay open={controlsOpen} onClose={() => setControlsOpen(false)} />

      <AnimatePresence>
        {phase === 'briefing' && (
          <Briefing
            onStart={beginHunt}
            online={online}
            roomCode={net.roomCode}
            players={net.players}
            isHost={net.isHost}
          />
        )}
      </AnimatePresence>

      {phase === 'select' && (
        <CharacterSelect
          progressFor={progressFor}
          initialClass={classId}
          onConfirm={confirmClass}
          onBack={() => setPhase('lobby')}
        />
      )}

      {phase === 'lobby' && (
        <Lobby
          initialRoom={initialRoom}
          status={net.status}
          error={net.error}
          onClearError={net.disconnect}
          onSolo={startSolo}
          onConnect={startOnline}
        />
      )}
    </div>
  )
}

export default Game
