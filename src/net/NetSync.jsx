import { useFrame } from '@react-three/fiber'
import { applyMonsterSnapshot, applyRemoteHit } from '../game/gameState'

/**
 * Bridges the simulation and the relay, once per frame:
 *  - broadcasts our hunter's transform (throttled inside the hook)
 *  - host: broadcasts monster/quest state and applies hits guests reported
 *  - guest: applies the host's monster snapshot and forwards its own hits
 *
 * Lives inside the Canvas so it shares the render loop, but renders nothing.
 */
function NetSync({ game, net }) {
  useFrame(() => {
    if (!game.online) return
    const now = performance.now()

    // Keep the simulation's authority flag in step with the relay.
    game.isHost = net.isHostRef.current

    net.sendTransform(game.player, now)

    if (game.isHost) {
      // Apply everything guests reported since the last frame.
      const pending = net.pendingHitsRef.current
      if (pending.length) {
        pending.forEach((hit) => applyRemoteHit(game, hit))
        pending.length = 0
      }
      net.sendMonsters(game, now)
    } else {
      const snapshot = net.monsterSnapshotRef.current
      if (snapshot) {
        applyMonsterSnapshot(game, snapshot)
        net.monsterSnapshotRef.current = null
      }

      // Ship our predicted hits to the host for authoritative resolution.
      const outgoing = game.outgoingHits
      if (outgoing.length) {
        outgoing.forEach((hit) => net.sendHit(hit))
        outgoing.length = 0
      }
    }
  })

  return null
}

export default NetSync
