import { useFrame } from '@react-three/fiber'
import { applyMonsterSnapshot, applyRemoteHit, applyRemoteHurt, syncRemotePlayers } from '../game/gameState'

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
      // Keep the AI's view of the room current so monsters can target
      // whoever's actually nearby, not just the host.
      syncRemotePlayers(game, net.remotePlayersRef.current)

      // Apply everything guests reported since the last frame.
      const pending = net.pendingHitsRef.current
      if (pending.length) {
        pending.forEach((hit) => applyRemoteHit(game, hit))
        pending.length = 0
      }
      net.sendMonsters(game, now)

      // Tell each guest about any damage a monster just landed on them.
      const outgoingHurts = game.outgoingHurts
      if (outgoingHurts.length) {
        outgoingHurts.forEach((hurt) => net.sendHurt(hurt))
        outgoingHurts.length = 0
      }
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

      // Apply any damage the host says a monster just landed on us.
      const incomingHurts = net.incomingHurtsRef.current
      if (incomingHurts.length) {
        incomingHurts.forEach((hurt) => applyRemoteHurt(game, hurt))
        incomingHurts.length = 0
      }
    }
  })

  return null
}

export default NetSync
