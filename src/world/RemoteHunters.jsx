import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Hunter from './Hunter'

const MAX_REMOTE = 7 // room cap is 8 including you
const STALE_MS = 6000 // hide a hunter we haven't heard from in this long
const vector = new THREE.Vector3()

/**
 * Renders the other hunters in the room.
 *
 * Network updates arrive ~15/s, so positions are interpolated toward their
 * latest target every frame. Each slot owns a synthetic `player` object shaped
 * like the local one, which lets us reuse the full Hunter model and all of its
 * animation logic without modification.
 */
function RemoteHunters({ remotePlayersRef, nameNodesRef, roster }) {
  const slots = useRef([])
  const { camera, size } = useThree()

  // Stable synthetic player objects, mutated in place each frame.
  const synthetic = useMemo(
    () =>
      Array.from({ length: MAX_REMOTE }, () => ({
        x: 0,
        z: 0,
        facing: 0,
        state: 'idle',
        stateTime: 0,
        weapon: 'greatsword',
        classId: 'vanguard',
        comboIndex: 0,
        moving: false,
        sprinting: false,
        buffTimer: 0,
        hp: 150,
        speed: 0,
        activeSkill: null,
        // Hunter reads stats.speedMult for its locomotion blend.
        stats: { speedMult: 1 },
      })),
    [],
  )

  // id -> display name, refreshed from the lobby roster.
  const names = useMemo(() => {
    const map = new Map()
    roster.forEach((player) => map.set(player.id, player.name))
    return map
  }, [roster])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const remotes = [...remotePlayersRef.current.values()]
    const nameNodes = nameNodesRef.current

    let index = 0

    remotes.forEach((remote) => {
      if (index >= MAX_REMOTE) return
      const stale = now - remote.lastSeen > STALE_MS
      const slot = slots.current[index]
      const model = synthetic[index]
      const nameNode = nameNodes?.[index]
      const slotIndex = index
      index += 1

      if (!slot) return

      if (stale) {
        slot.visible = false
        if (nameNode) nameNode.style.opacity = '0'
        return
      }

      slot.visible = true

      // Smooth toward the latest networked transform.
      const ease = 1 - Math.exp(-12 * delta)
      remote.x += (remote.targetX - remote.x) * ease
      remote.z += (remote.targetZ - remote.z) * ease

      let facingDiff = remote.targetFacing - remote.facing
      while (facingDiff > Math.PI) facingDiff -= Math.PI * 2
      while (facingDiff < -Math.PI) facingDiff += Math.PI * 2
      remote.facing += facingDiff * ease

      const prevX = slot.position.x
      const prevZ = slot.position.z
      slot.position.set(remote.x, 0, remote.z)
      slot.rotation.y = remote.facing

      // Feed the animation rig.
      model.x = remote.x
      model.z = remote.z
      model.facing = remote.facing
      model.state = remote.state ?? 'idle'
      model.stateTime = remote.stateTime ?? 0
      model.weapon = remote.weapon ?? 'greatsword'
      model.comboIndex = remote.comboIndex ?? 0
      model.moving = Boolean(remote.moving)
      model.sprinting = Boolean(remote.sprinting)
      model.buffTimer = remote.buffTimer ? 1 : 0
      model.hp = remote.hp ?? 150
      // Derive speed from actual travel so remote locomotion blends like local.
      model.speed = delta > 0 ? Math.hypot(remote.x - prevX, remote.z - prevZ) / delta : 0

      // Project a floating name tag to screen space.
      if (nameNode) {
        vector.set(remote.x, 2.1, remote.z).project(camera)
        if (vector.z > 1) {
          nameNode.style.opacity = '0'
        } else {
          const screenX = (vector.x * 0.5 + 0.5) * size.width
          const screenY = (-vector.y * 0.5 + 0.5) * size.height
          nameNode.textContent = names.get(remote.id) ?? 'Hunter'
          nameNode.style.opacity = '1'
          nameNode.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px)`
          nameNode.dataset.slot = String(slotIndex)
        }
      }
    })

    // Park unused slots.
    for (let i = index; i < MAX_REMOTE; i += 1) {
      if (slots.current[i]) slots.current[i].visible = false
      if (nameNodes?.[i]) nameNodes[i].style.opacity = '0'
    }
  })

  return (
    <group>
      {synthetic.map((model, i) => (
        <group
          key={i}
          ref={(el) => {
            slots.current[i] = el
          }}
          visible={false}
        >
          {/* No trail on remotes: it's a per-frame geometry rebuild each, and
              networked poses are too coarse for it to read well anyway. */}
          <Hunter player={model} showTrail={false} />
        </group>
      ))}
    </group>
  )
}

export default RemoteHunters
