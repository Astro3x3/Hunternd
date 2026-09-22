import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { WebSocketServer } from 'ws'
import { attachRelay, lanAddress } from './server/relay.js'

const RELAY_PATH = '/ws'

/**
 * Runs the multiplayer relay inside the Vite dev server.
 *
 * Why in-process rather than a second `node` process: it removes the whole
 * class of "did you start the other server?" problems — one command, one port,
 * and the relay can never be out of sync with the page you're loading. It also
 * means the invite link's origin always matches the relay's origin.
 *
 * The relay attaches to Vite's existing HTTP server under /ws, so it rides the
 * same port as the app (5173 by default).
 */
function relayPlugin() {
  return {
    name: 'hunt-relay',
    apply: 'serve',

    configureServer(server) {
      // noServer: we do the HTTP upgrade by hand so Vite's own HMR websocket
      // (which lives on a different path) keeps working untouched.
      const wss = new WebSocketServer({ noServer: true })
      const relay = attachRelay(wss)

      server.httpServer?.on('upgrade', (request, socket, head) => {
        let pathname
        try {
          pathname = new URL(request.url, 'http://localhost').pathname
        } catch {
          return
        }
        if (pathname !== RELAY_PATH) return // not ours — leave it for Vite HMR

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request)
        })
      })

      // Small health endpoint, handy for confirming the relay is alive.
      server.middlewares.use('/ws-health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(relay.stats()))
      })

      const { close } = server
      server.close = async () => {
        relay.dispose()
        wss.close()
        return close.call(server)
      }

      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address()
        const port = typeof address === 'object' && address ? address.port : 5173
        const lan = lanAddress()
        setTimeout(() => {
          console.log(`  ⚔  multiplayer relay embedded at ws://localhost:${port}${RELAY_PATH}`)
          if (lan) console.log(`     invite friends on your Wi-Fi via http://${lan}:${port}`)
          console.log('')
        }, 120)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), relayPlugin()],
  server: {
    // Expose on the LAN so people on the same Wi-Fi can open the invite link.
    host: true,
  },
})
