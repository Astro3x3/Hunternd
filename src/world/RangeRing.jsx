import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WEAPONS } from '../data/weapons'
import { SKILLS_BY_ID } from '../data/skills'

const SEGMENTS = 48

/**
 * Ground ring showing exactly how far the current weapon/skill reaches,
 * centred on the hunter. Answers "am I close enough to hit it" at a glance
 * instead of by feel.
 *
 * Behaviour:
 *  - Shows the melee weapon's max combo reach while idle/moving near a monster.
 *  - Swaps to the active skill's reach while a skill is winding up (so you can
 *    judge an ultimate's radius before it lands).
 *  - Hidden for ranged weapons at rest (a ground melee ring would be
 *    misleading for a bow) but shown briefly on the drawn arrow's max range.
 *  - Fades out entirely when no monster is close enough for the ring to matter,
 *    so it doesn't clutter the screen while just exploring.
 */
function RangeRing({ game }) {
  const ringRef = useRef(null)
  const fillRef = useRef(null)
  const strength = useRef(0)
  const lastArc = useRef(-1)

  // Swapped in place whenever the wedge angle changes (state transitions
  // only, not every frame) so the fill's sweep exactly matches the weapon or
  // skill's real arc instead of a fixed guess.
  const fillGeometry = useMemo(() => new THREE.CircleGeometry(1, SEGMENTS, 0, 0.01), [])

  useFrame((state, rawDelta) => {
    const ring = ringRef.current
    const fill = fillRef.current
    if (!ring || !fill) return

    const delta = Math.min(rawDelta, 0.05)
    const player = game.player
    const weapon = WEAPONS[player.weapon] ?? WEAPONS.greatsword

    // Pick whichever reach is relevant to what's currently happening.
    let reach = null
    let arc = null
    let color = '#8fe0ff'

    if (player.state === 'skill' && player.activeSkill) {
      const skill = SKILLS_BY_ID[player.activeSkill]
      if (skill && skill.kind !== 'heal' && skill.kind !== 'buff') {
        reach = skill.reach
        arc = skill.kind === 'radial' || skill.kind === 'meteor' ? Math.PI * 2 : skill.arc
        color = skill.ultimate ? '#ff9a3c' : '#c9a6ff'
      }
    } else if (weapon.kind === 'melee') {
      // Longest step in the combo — the "can I reach it at all" answer.
      reach = weapon.combo.reduce((max, step) => Math.max(max, step.reach), 0)
      arc = weapon.combo[0]?.arc ?? Math.PI
      color = '#8fe0ff'
    } else if (weapon.kind === 'ranged' && player.state === 'attack') {
      // Show the bow's practical range only while actually drawing/firing.
      reach = 14
      arc = 0.5
      color = '#8fe0b0'
    }

    // Only bother showing it when a monster is close enough for the ring to
    // be useful information, otherwise it's just noise while exploring.
    let nearest = Infinity
    if (reach !== null) {
      game.monsters.forEach((monster) => {
        if (monster.dead) return
        const dist = Math.hypot(monster.x - player.x, monster.z - player.z) - monster.def.hitRadius
        if (dist < nearest) nearest = dist
      })
    }
    const relevant = reach !== null && nearest < reach + 3.5

    const target = relevant ? 1 : 0
    strength.current += (target - strength.current) * (1 - Math.exp(-10 * delta))

    if (strength.current < 0.01 || reach === null) {
      ring.visible = false
      fill.visible = false
      return
    }

    ring.visible = true
    fill.visible = true
    ring.position.set(player.x, 0.04, player.z)
    fill.position.set(player.x, 0.035, player.z)

    // In range right now = brighter; safe distance = dim outline only.
    const inRange = nearest <= reach
    const pulse = inRange ? 1 + Math.sin(state.clock.elapsedTime * 5) * 0.06 : 1
    ring.scale.setScalar(reach * pulse)
    fill.scale.setScalar(reach * pulse)

    ring.material.opacity = strength.current * (inRange ? 0.85 : 0.4)
    ring.material.color.set(color)
    fill.material.opacity = strength.current * (inRange ? 0.14 : 0.05)
    fill.material.color.set(color)

    // The wedge geometry sweeps `arc` radians starting at local +X (see
    // thetaStart below is 0). To centre that sweep on the hunter's facing
    // direction (which is measured from +Z per this project's atan2(x, z)
    // convention), rotate by (facing - arc/2), converted into the plane's
    // -Y-rotation frame after the -90° X tilt.
    const isFullCircle = arc >= Math.PI * 1.9
    const sweep = isFullCircle ? Math.PI * 2 : arc
    if (Math.abs(sweep - lastArc.current) > 0.01) {
      lastArc.current = sweep
      fillGeometry.dispose()
      const fresh = new THREE.CircleGeometry(1, SEGMENTS, 0, sweep)
      fill.geometry = fresh
    }
    fill.rotation.y = isFullCircle ? 0 : -(player.facing - Math.PI / 2 - arc / 2)
    ring.rotation.z = state.clock.elapsedTime * 0.15
  })

  return (
    <group>
      {/* Thin outline ring at the exact reach distance */}
      <mesh ref={ringRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.985, 1, 64]} />
        <meshBasicMaterial
          color="#8fe0ff"
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Soft wedge/disc fill so the covered arc reads as a "hit zone".
          Geometry is swapped at runtime to match the active reach's real arc. */}
      <mesh ref={fillRef} visible={false} geometry={fillGeometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial
          color="#8fe0ff"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export default RangeRing
