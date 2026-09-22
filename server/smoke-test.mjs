/**
 * End-to-end check of the relay protocol with two simulated clients.
 * Run with the relay already listening: `node server/smoke-test.mjs`
 */
import WebSocket from 'ws'

const URL = process.env.MP_URL ?? 'ws://localhost:8787'
const log = []
const record = (line) => {
  log.push(line)
  console.log(line)
}

function client(label) {
  const socket = new WebSocket(URL)
  const received = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw)
    received.push(message)
    record(`${label} <- ${message.t}${message.t === 'welcome' ? ` room=${message.room} host=${message.isHost}` : ''}`)
  })
  return {
    socket,
    received,
    send: (payload) => socket.send(JSON.stringify(payload)),
    open: () => new Promise((resolve) => socket.on('open', resolve)),
    waitFor: (type, timeout = 3000) =>
      new Promise((resolve, reject) => {
        const existing = received.find((m) => m.t === type)
        if (existing) return resolve(existing)
        const timer = setTimeout(() => reject(new Error(`${label}: timeout waiting for '${type}'`)), timeout)
        const onMessage = (raw) => {
          const message = JSON.parse(raw)
          if (message.t === type) {
            clearTimeout(timer)
            socket.off('message', onMessage)
            resolve(message)
          }
        }
        socket.on('message', onMessage)
      }),
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let failures = 0
  const check = (label, condition) => {
    record(`${condition ? 'PASS' : 'FAIL'} — ${label}`)
    if (!condition) failures += 1
  }

  // --- host creates a room ---
  const host = client('host')
  await host.open()
  host.send({ t: 'join', name: 'Alice' })
  const hostWelcome = await host.waitFor('welcome')
  check('host receives welcome', Boolean(hostWelcome.room))
  check('host is flagged as host', hostWelcome.isHost === true)
  check('room code is 5 chars', hostWelcome.room?.length === 5)

  const room = hostWelcome.room

  // --- guest joins with the code ---
  const guest = client('guest')
  await guest.open()
  guest.send({ t: 'join', name: 'Bob', room })
  const guestWelcome = await guest.waitFor('welcome')
  check('guest joins same room', guestWelcome.room === room)
  check('guest is NOT host', guestWelcome.isHost === false)
  check('guest sees both players', guestWelcome.players.length === 2)

  const joined = await host.waitFor('joined')
  check('host notified of guest joining', joined.player?.name === 'Bob')

  // --- transform relay ---
  guest.send({ t: 'tf', x: 4, z: -2, f: 1.1, s: 'move', w: 'bow', c: 0, st: 0, hp: 150, mv: true })
  const tf = await host.waitFor('tf')
  check('transform relayed to host', tf.x === 4 && tf.w === 'bow')
  check('transform carries sender id', tf.id === guestWelcome.id)

  // --- host monster broadcast ---
  host.send({ t: 'mon', m: [{ i: 'jagras-1', x: 1, z: 2, h: 99 }], q: { o: [0, 0, 0], c: 0, r: [] } })
  const mon = await guest.waitFor('mon')
  check('monster snapshot reaches guest', mon.m?.[0]?.i === 'jagras-1' && mon.m[0].h === 99)

  // --- guests must not be able to broadcast monster state ---
  guest.send({ t: 'mon', m: [{ i: 'spoof', x: 0, z: 0, h: 1 }] })
  await sleep(250)
  const spoofed = host.received.filter((m) => m.t === 'mon')
  check('guest monster broadcast is rejected', spoofed.length === 0)

  // --- guest hit forwarded to host only ---
  guest.send({ t: 'hit', monsterId: 'jagras-1', damage: 30, knock: 1, x: 0, z: 0, flavour: 'normal' })
  const hit = await host.waitFor('hit')
  check('guest hit forwarded to host', hit.monsterId === 'jagras-1' && hit.damage === 30)

  // --- chat ---
  host.send({ t: 'say', text: 'over here' })
  const say = await guest.waitFor('say')
  check('chat relayed', say.text === 'over here' && say.name === 'Alice')

  // --- host election on disconnect ---
  host.socket.close()
  const left = await guest.waitFor('left')
  check('guest told host left', left.id === hostWelcome.id)
  check('host handed to remaining player', left.hostId === guestWelcome.id)
  const promoted = await guest.waitFor('host')
  check('guest promoted to host', Boolean(promoted))

  guest.socket.close()
  await sleep(200)

  record('')
  record(failures === 0 ? `ALL CHECKS PASSED` : `${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  record(`ERROR ${error.message}`)
  process.exit(1)
})
