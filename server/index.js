/**
 * Standalone relay entry point.
 *
 * In development you normally don't need this — `npm run dev` embeds the relay
 * directly in the Vite dev server. Use this when hosting the relay separately
 * (a VPS, a container, a different machine on the LAN).
 */
import { createRelay, lanAddress } from './relay.js'

const PORT = Number(process.env.MP_PORT ?? 8787)

try {
  const relay = await createRelay({ port: PORT })
  const lan = lanAddress()

  console.log('')
  console.log(`  ⚔  Hunt relay ready on port ${relay.port}`)
  console.log(`     local    ws://localhost:${relay.port}`)
  if (lan) console.log(`     network  ws://${lan}:${relay.port}   (same-Wi-Fi invites)`)
  console.log(`     health   http://localhost:${relay.port}/health`)
  console.log('')

  // Close cleanly so the port is released immediately on restart.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      console.log(`\n[mp] ${signal} — shutting down relay.`)
      await relay.close()
      process.exit(0)
    })
  }
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error(
      [
        '',
        `  ✗ Port ${PORT} is already in use.`,
        '',
        '    A relay is probably already running. In development you do NOT',
        '    need this command — `npm run dev` runs the relay inside Vite.',
        '',
        '    To see what is listening:',
        `      Windows      netstat -ano | findstr :${PORT}`,
        `      macOS/Linux  lsof -i :${PORT}`,
        '',
        '    Or pick another port:',
        `      PowerShell   $env:MP_PORT=8788; npm run server`,
        `      macOS/Linux  MP_PORT=8788 npm run server`,
        '',
        '    If you change the port, point the client at it with VITE_MP_URL,',
        '    e.g. VITE_MP_URL=ws://localhost:8788',
        '',
      ].join('\n'),
    )
    process.exit(1)
  }

  console.error(`[mp] failed to start relay: ${error.message}`)
  process.exit(1)
}
