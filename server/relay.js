/**
 * Multiplayer relay for the hunt.
 *
 * Deliberately thin: it owns room membership and host election, and relays
 * gameplay messages between peers. The *host* client simulates monsters and
 * broadcasts their state, so there's no physics or AI in here. That keeps the
 * single-player code path unchanged and the server cheap to run.
 *
 * No accounts — a player is just a display name plus a socket.
 *
 * Exported as a factory so it can run standalone (server/index.js) or be
 * embedded in the Vite dev server (vite.config.js), which means there's only
 * ever one process to start in development.
 */
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { WebSocketServer } from 'ws'

// Room code alphabet avoids characters that are easy to misread aloud (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const MAX_PLAYERS_PER_ROOM = 8
const EMPTY_ROOM_TTL_MS = 60_000

/** Best-effort LAN address so people can invite others on the same network. */
export function lanAddress() {
  try {
    const interfaces = networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      for (const entry of interfaces[name] ?? []) {
        if (entry.family === 'IPv4' && !entry.internal) return entry.address
      }
    }
  } catch {
    /* not important enough to fail startup */
  }
  return null
}

/**
 * Wires relay behaviour onto an existing WebSocketServer.
 * Returns a `stats()` helper and a `dispose()` for clean shutdown.
 */
export function attachRelay(wss) {
  /** @type {Map<string, {code: string, players: Map<string, any>, hostId: string|null, emptySince: number|null}>} */
  const rooms = new Map()
  let nextPlayerId = 1

  function makeRoomCode() {
    let code
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join('')
    } while (rooms.has(code))
    return code
  }

  function getOrCreateRoom(code) {
    const key = String(code || '').toUpperCase()
    if (!key) return null
    let room = rooms.get(key)
    if (!room) {
      room = { code: key, players: new Map(), hostId: null, emptySince: null }
      rooms.set(key, room)
    }
    room.emptySince = null
    return room
  }

  function send(socket, payload) {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload))
  }

  function broadcast(room, payload, exceptId = null) {
    const message = JSON.stringify(payload)
    room.players.forEach((player) => {
      if (player.id !== exceptId && player.socket.readyState === 1) {
        player.socket.send(message)
      }
    })
  }

  function playerList(room) {
    return [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.id === room.hostId,
      weapon: player.weapon,
    }))
  }

  function sanitizeName(raw) {
    const name = String(raw ?? '').trim().slice(0, 16)
    return name || `Hunter ${Math.floor(Math.random() * 900 + 100)}`
  }

  /** Promotes the longest-connected remaining player when the host leaves. */
  function electHost(room) {
    const next = room.players.values().next().value
    room.hostId = next ? next.id : null
    if (next) send(next.socket, { t: 'host' })
    return room.hostId
  }

  function leaveRoom(player) {
    const room = player.room
    if (!room) return

    room.players.delete(player.id)
    player.room = null

    if (room.players.size === 0) {
      room.hostId = null
      room.emptySince = Date.now()
      return
    }

    if (room.hostId === player.id) electHost(room)
    broadcast(room, { t: 'left', id: player.id, hostId: room.hostId })
  }

  wss.on('connection', (socket) => {
    const player = {
      id: `p${nextPlayerId++}`,
      name: 'Hunter',
      room: null,
      weapon: 'greatsword',
      socket,
    }

    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        return // ignore malformed frames
      }

      switch (message.t) {
        case 'join': {
          if (player.room) leaveRoom(player)

          const code = message.room ? String(message.room).toUpperCase() : makeRoomCode()
          const room = getOrCreateRoom(code)
          if (!room) return

          if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            send(socket, {
              t: 'error',
              code: 'room-full',
              message: 'That camp is full (8 hunters max).',
            })
            return
          }

          player.name = sanitizeName(message.name)
          player.weapon = message.weapon ?? 'greatsword'
          player.room = room
          room.players.set(player.id, player)
          if (!room.hostId) room.hostId = player.id

          send(socket, {
            t: 'welcome',
            id: player.id,
            room: room.code,
            isHost: room.hostId === player.id,
            players: playerList(room),
          })

          broadcast(
            room,
            { t: 'joined', player: { id: player.id, name: player.name, weapon: player.weapon } },
            player.id,
          )
          break
        }

        case 'leave': {
          leaveRoom(player)
          break
        }

        // Player transform/animation state — relayed to everyone else as-is.
        case 'tf': {
          if (!player.room) return
          broadcast(
            player.room,
            {
              t: 'tf',
              id: player.id,
              x: message.x,
              z: message.z,
              f: message.f,
              s: message.s,
              w: message.w,
              c: message.c,
              st: message.st,
              hp: message.hp,
              mv: message.mv,
              sp: message.sp,
              bf: message.bf,
            },
            player.id,
          )
          if (message.w) player.weapon = message.w
          break
        }

        // Authoritative monster state — host only, so guests can't spoof it.
        case 'mon': {
          const room = player.room
          if (!room || room.hostId !== player.id) return
          broadcast(room, { t: 'mon', m: message.m, rewards: message.rewards, phase: message.phase }, player.id)
          break
        }

        // A guest landed a hit; forward to the host to apply authoritatively.
        case 'hit': {
          const room = player.room
          if (!room || !room.hostId || room.hostId === player.id) return
          const host = room.players.get(room.hostId)
          if (host) {
            send(host.socket, {
              t: 'hit',
              from: player.id,
              monsterId: message.monsterId,
              damage: message.damage,
              knock: message.knock,
              x: message.x,
              z: message.z,
              flavour: message.flavour,
              stagger: message.stagger,
            })
          }
          break
        }

        // Host telling one specific guest a monster just hit them.
        case 'hurt': {
          const room = player.room
          if (!room || room.hostId !== player.id) return
          const target = room.players.get(message.to)
          if (target) {
            send(target.socket, { t: 'hurt', damage: message.damage, x: message.x, z: message.z })
          }
          break
        }

        case 'fx': {
          if (!player.room) return
          broadcast(player.room, { t: 'fx', id: player.id, e: message.e }, player.id)
          break
        }

        case 'say': {
          if (!player.room) return
          broadcast(player.room, {
            t: 'say',
            id: player.id,
            name: player.name,
            text: String(message.text ?? '').slice(0, 140),
          })
          break
        }

        case 'ping': {
          send(socket, { t: 'pong', ts: message.ts })
          break
        }

        default:
          break
      }
    })

    socket.on('close', () => leaveRoom(player))
    socket.on('error', () => leaveRoom(player))
  })

  // Reap rooms empty for a while so codes can be reused.
  const reaper = setInterval(() => {
    const now = Date.now()
    rooms.forEach((room, code) => {
      if (room.players.size === 0 && room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
        rooms.delete(code)
      }
    })
  }, 30_000)
  reaper.unref?.() // don't hold the process open

  return {
    stats: () => ({
      ok: true,
      rooms: rooms.size,
      players: [...rooms.values()].reduce((sum, room) => sum + room.players.size, 0),
    }),
    dispose: () => {
      clearInterval(reaper)
      rooms.clear()
    },
  }
}

/**
 * Standalone relay on its own HTTP server.
 * Resolves once listening; rejects with code 'EADDRINUSE' if the port is taken.
 */
export function createRelay({ port = 8787 } = {}) {
  return new Promise((resolve, reject) => {
    const httpServer = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(relay.stats()))
        return
      }
      res.writeHead(404)
      res.end()
    })

    const wss = new WebSocketServer({ server: httpServer })
    const relay = attachRelay(wss)

    // `ws` re-emits listen errors on itself, so both need a handler or an
    // unhandled 'error' event takes down the process.
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    httpServer.on('error', fail)
    wss.on('error', fail)

    httpServer.listen(port, () => {
      if (settled) return
      settled = true
      resolve({
        port,
        stats: relay.stats,
        close: () =>
          new Promise((done) => {
            relay.dispose()
            wss.clients.forEach((socket) => {
              try {
                socket.close()
              } catch {
                /* ignore */
              }
            })
            httpServer.close(() => done())
            setTimeout(done, 1500)
          }),
      })
    })
  })
}
