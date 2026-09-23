import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Resolves the relay URL.
 *
 * The relay is served from the same origin as the app at /ws — in dev it's
 * embedded in the Vite server, in production it sits behind the same host.
 * That keeps the invite link and the relay on one origin, so there's no port
 * to coordinate. Override with VITE_MP_URL if you host the relay separately.
 */
function resolveRelayUrl() {
  const override = import.meta.env?.VITE_MP_URL
  if (override) return override

  const { protocol, host } = window.location
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${host}/ws`
}

const TRANSFORM_HZ = 15
const MONSTER_HZ = 12

/**
 * Owns the websocket connection and all remote state.
 *
 * Remote data lives in refs (not React state) so the render loop can read it
 * every frame without causing re-renders. Only lobby-level facts — connection
 * status, the player roster, who's host — are mirrored into React state for UI.
 */
export default function useMultiplayer() {
  const socketRef = useRef(null)
  const selfIdRef = useRef(null)
  const isHostRef = useRef(true)

  // id -> latest received transform, plus interpolation targets.
  const remotePlayersRef = useRef(new Map())
  // Monster snapshot from the host (guests only).
  const monsterSnapshotRef = useRef(null)
  // Hits reported by guests, waiting for the host to apply them.
  const pendingHitsRef = useRef([])
  // Damage the host says landed on US specifically, waiting to be applied.
  const incomingHurtsRef = useRef([])
  // Effects broadcast by other players.
  const remoteEffectsRef = useRef([])

  const lastTransformSent = useRef(0)
  const lastMonstersSent = useRef(0)

  const [status, setStatus] = useState('offline') // offline | connecting | connected | error
  const [roomCode, setRoomCode] = useState(null)
  const [players, setPlayers] = useState([])
  const [isHost, setIsHost] = useState(true)
  const [error, setError] = useState(null)
  const [chat, setChat] = useState([])

  const cleanup = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      socket.onclose = null
      socket.onmessage = null
      socket.onerror = null
      socket.onopen = null
      try {
        socket.close()
      } catch {
        /* already closing */
      }
    }
    remotePlayersRef.current.clear()
    monsterSnapshotRef.current = null
    pendingHitsRef.current = []
    incomingHurtsRef.current = []
    remoteEffectsRef.current = []
  }, [])

  useEffect(() => cleanup, [cleanup])

  /** Connects and joins `room` (or asks the server to mint a new code). */
  const connect = useCallback(
    (name, room) =>
      new Promise((resolve, reject) => {
        cleanup()
        setStatus('connecting')
        setError(null)

        let socket
        try {
          socket = new WebSocket(resolveRelayUrl())
        } catch (openError) {
          setStatus('error')
          setError('Could not reach the relay server.')
          reject(openError)
          return
        }

        socketRef.current = socket
        let settled = false

        // If the relay never answers, surface a useful message instead of hanging.
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          setStatus('error')
          setError(
            'Could not reach the multiplayer relay. Restart the dev server (`npm run dev`) and reload this page — or hunt solo.',
          )
          cleanup()
          reject(new Error('relay-timeout'))
        }, 6000)

        socket.onopen = () => {
          socket.send(JSON.stringify({ t: 'join', name, room: room || undefined }))
        }

        socket.onerror = () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          setStatus('error')
          setError(
            'Multiplayer relay unreachable. Restart the dev server (`npm run dev`) and reload — or hunt solo.',
          )
          reject(new Error('relay-error'))
        }

        socket.onclose = () => {
          setStatus((current) => (current === 'error' ? current : 'offline'))
          remotePlayersRef.current.clear()
        }

        socket.onmessage = (event) => {
          let message
          try {
            message = JSON.parse(event.data)
          } catch {
            return
          }

          switch (message.t) {
            case 'welcome': {
              settled = true
              clearTimeout(timeout)
              selfIdRef.current = message.id
              isHostRef.current = message.isHost
              setIsHost(message.isHost)
              setRoomCode(message.room)
              setPlayers(message.players)
              setStatus('connected')
              resolve({ room: message.room, isHost: message.isHost, id: message.id })
              break
            }

            case 'joined': {
              setPlayers((current) => {
                if (current.some((p) => p.id === message.player.id)) return current
                return [...current, { ...message.player, isHost: false }]
              })
              setChat((c) => [
                ...c.slice(-19),
                { id: `sys${Date.now()}`, system: true, text: `${message.player.name} joined the hunt.` },
              ])
              break
            }

            case 'left': {
              remotePlayersRef.current.delete(message.id)
              setPlayers((current) => {
                const leaving = current.find((p) => p.id === message.id)
                if (leaving) {
                  setChat((c) => [
                    ...c.slice(-19),
                    { id: `sys${Date.now()}`, system: true, text: `${leaving.name} left the hunt.` },
                  ])
                }
                return current
                  .filter((p) => p.id !== message.id)
                  .map((p) => ({ ...p, isHost: p.id === message.hostId }))
              })
              break
            }

            case 'host': {
              // We've been promoted — start simulating monsters locally.
              isHostRef.current = true
              setIsHost(true)
              monsterSnapshotRef.current = null
              setChat((c) => [
                ...c.slice(-19),
                { id: `sys${Date.now()}`, system: true, text: 'You are now the hunt leader.' },
              ])
              break
            }

            case 'tf': {
              const existing = remotePlayersRef.current.get(message.id)
              if (existing) {
                existing.targetX = message.x
                existing.targetZ = message.z
                existing.targetFacing = message.f
                existing.state = message.s
                existing.weapon = message.w
                existing.comboIndex = message.c
                existing.stateTime = message.st
                existing.hp = message.hp
                existing.moving = message.mv
                existing.sprinting = message.sp
                existing.buffTimer = message.bf
                existing.lastSeen = performance.now()
              } else {
                remotePlayersRef.current.set(message.id, {
                  id: message.id,
                  x: message.x,
                  z: message.z,
                  facing: message.f,
                  targetX: message.x,
                  targetZ: message.z,
                  targetFacing: message.f,
                  state: message.s,
                  weapon: message.w,
                  comboIndex: message.c,
                  stateTime: message.st,
                  hp: message.hp,
                  moving: message.mv,
                  sprinting: message.sp,
                  buffTimer: message.bf,
                  lastSeen: performance.now(),
                })
              }
              break
            }

            case 'mon': {
              // Guests trust the host's monster state.
              if (!isHostRef.current) {
                monsterSnapshotRef.current = { monsters: message.m, rewards: message.rewards, phase: message.phase }
              }
              break
            }

            case 'hit': {
              // Host receives a guest's hit to apply authoritatively.
              if (isHostRef.current) pendingHitsRef.current.push(message)
              break
            }

            case 'hurt': {
              // A monster (simulated by the host) just hit us specifically.
              if (!isHostRef.current) incomingHurtsRef.current.push(message)
              break
            }

            case 'fx': {
              remoteEffectsRef.current.push(message.e)
              if (remoteEffectsRef.current.length > 24) remoteEffectsRef.current.shift()
              break
            }

            case 'say': {
              setChat((c) => [
                ...c.slice(-19),
                { id: `m${Date.now()}${message.id}`, name: message.name, text: message.text },
              ])
              break
            }

            case 'error': {
              settled = true
              clearTimeout(timeout)
              setStatus('error')
              setError(message.message ?? 'Could not join that room.')
              reject(new Error(message.code ?? 'join-failed'))
              break
            }

            default:
              break
          }
        }
      }),
    [cleanup],
  )

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    if (socket?.readyState === 1) socket.send(JSON.stringify({ t: 'leave' }))
    cleanup()
    setStatus('offline')
    setRoomCode(null)
    setPlayers([])
    setIsHost(true)
    setChat([])
  }, [cleanup])

  const rawSend = useCallback((payload) => {
    const socket = socketRef.current
    if (socket?.readyState === 1) socket.send(JSON.stringify(payload))
  }, [])

  /** Throttled broadcast of our own hunter's transform. */
  const sendTransform = useCallback(
    (player, now) => {
      if (now - lastTransformSent.current < 1000 / TRANSFORM_HZ) return
      lastTransformSent.current = now
      rawSend({
        t: 'tf',
        x: Number(player.x.toFixed(2)),
        z: Number(player.z.toFixed(2)),
        f: Number(player.facing.toFixed(2)),
        s: player.state,
        w: player.weapon,
        c: player.comboIndex,
        st: Number(player.stateTime.toFixed(2)),
        hp: Math.round(player.hp),
        mv: player.moving,
        sp: player.sprinting,
        bf: player.buffTimer > 0 ? 1 : 0,
      })
    },
    [rawSend],
  )

  /** Host-only: broadcast monster state + accumulated rewards. */
  const sendMonsters = useCallback(
    (game, now) => {
      if (!isHostRef.current) return
      if (now - lastMonstersSent.current < 1000 / MONSTER_HZ) return
      lastMonstersSent.current = now
      rawSend({
        t: 'mon',
        phase: game.phase,
        m: game.monsters.map((monster) => ({
          i: monster.id,
          sp: monster.species,
          x: Number(monster.x.toFixed(2)),
          z: Number(monster.z.toFixed(2)),
          f: Number(monster.facing.toFixed(2)),
          s: monster.state,
          st: Number(monster.stateTime.toFixed(2)),
          h: Math.round(monster.hp),
          d: monster.dead ? 1 : 0,
          dt: Number(monster.deadTimer.toFixed(2)),
          j: Number(monster.jawOpen.toFixed(2)),
          a: monster.aggro ? 1 : 0,
        })),
        rewards: game.rewards,
      })
    },
    [rawSend],
  )

  /** Guest-only: tell the host we landed a hit. */
  const sendHit = useCallback(
    (hit) => {
      if (isHostRef.current) return
      rawSend({ t: 'hit', ...hit })
    },
    [rawSend],
  )

  /** Host-only: tell one specific guest a monster just hit them. */
  const sendHurt = useCallback(
    (hurt) => {
      if (!isHostRef.current) return
      rawSend({ t: 'hurt', to: hurt.playerId, damage: hurt.damage, x: hurt.x, z: hurt.z })
    },
    [rawSend],
  )

  const sendEffect = useCallback(
    (effect) => {
      rawSend({ t: 'fx', e: effect })
    },
    [rawSend],
  )

  const say = useCallback(
    (text) => {
      if (!text.trim()) return
      rawSend({ t: 'say', text })
    },
    [rawSend],
  )

  return {
    // lobby state for UI
    status,
    roomCode,
    players,
    isHost,
    error,
    chat,
    selfId: selfIdRef,

    // lifecycle
    connect,
    disconnect,

    // per-frame refs for the render loop
    isHostRef,
    remotePlayersRef,
    monsterSnapshotRef,
    pendingHitsRef,
    incomingHurtsRef,
    remoteEffectsRef,

    // senders
    sendTransform,
    sendMonsters,
    sendHit,
    sendHurt,
    sendEffect,
    say,
  }
}
