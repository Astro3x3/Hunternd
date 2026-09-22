import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const ARROW_POOL = 20
const FIRE_POOL = 14
const METEOR_POOL = 3

/**
 * Pooled projectile meshes. Nothing here is driven by React state — each frame
 * we walk the live projectile list and assign transforms to pool slots, hiding
 * whatever is unused. Keeps allocation at zero during combat.
 */
function Projectiles({ game }) {
  const arrows = useRef([])
  const fires = useRef([])
  const meteors = useRef([])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    let arrowIndex = 0
    let fireIndex = 0
    let meteorIndex = 0

    game.projectiles.forEach((projectile) => {
      if (projectile.kind === 'arrow' && arrowIndex < ARROW_POOL) {
        const mesh = arrows.current[arrowIndex]
        arrowIndex += 1
        if (mesh) {
          mesh.visible = true
          mesh.position.set(projectile.x, projectile.y, projectile.z)
          // Parts are laid out along local +X; yawing by (facing - 90°) points
          // that axis along the direction of travel.
          mesh.rotation.set(0, projectile.facing - Math.PI / 2, 0)
        }
      } else if (projectile.kind === 'fireball' && fireIndex < FIRE_POOL) {
        const group = fires.current[fireIndex]
        fireIndex += 1
        if (group) {
          group.visible = true
          group.position.set(projectile.x, projectile.y, projectile.z)
          const flicker = 1 + Math.sin(t * 26 + projectile.x) * 0.16
          group.scale.setScalar(projectile.radius * 1.5 * flicker)
          group.rotation.y = t * 5
        }
      } else if (projectile.kind === 'meteor' && meteorIndex < METEOR_POOL) {
        const group = meteors.current[meteorIndex]
        meteorIndex += 1
        if (group) {
          group.visible = true
          group.position.set(projectile.x, projectile.y, projectile.z)
          group.rotation.x = t * 6
          group.rotation.z = t * 4
          group.scale.setScalar(1 + Math.sin(t * 18) * 0.08)
        }
      }
    })

    for (let i = arrowIndex; i < ARROW_POOL; i += 1) {
      if (arrows.current[i]) arrows.current[i].visible = false
    }
    for (let i = fireIndex; i < FIRE_POOL; i += 1) {
      if (fires.current[i]) fires.current[i].visible = false
    }
    for (let i = meteorIndex; i < METEOR_POOL; i += 1) {
      if (meteors.current[i]) meteors.current[i].visible = false
    }
  })

  return (
    <group>
      {/* Arrows */}
      {Array.from({ length: ARROW_POOL }, (_, i) => (
        <group
          key={`a${i}`}
          ref={(el) => {
            arrows.current[i] = el
          }}
          visible={false}
        >
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.85, 6]} />
            <meshStandardMaterial color="#c8a86a" />
          </mesh>
          <mesh position={[0.46, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.055, 0.18, 6]} />
            <meshStandardMaterial color="#d8e2f0" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[-0.38, 0, 0]} rotation={[Math.PI / 4, 0, 0]}>
            <boxGeometry args={[0.16, 0.12, 0.01]} />
            <meshStandardMaterial color="#d95f4a" />
          </mesh>
        </group>
      ))}

      {/* Fireballs: bright core, hot shell, trailing wisp */}
      {Array.from({ length: FIRE_POOL }, (_, i) => (
        <group
          key={`f${i}`}
          ref={(el) => {
            fires.current[i] = el
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[0.4, 12, 12]} />
            <meshBasicMaterial color="#fff1c4" toneMapped={false} />
          </mesh>
          <mesh scale={1.45}>
            <sphereGeometry args={[0.4, 12, 12]} />
            <meshBasicMaterial color="#ff8a2b" transparent opacity={0.6} toneMapped={false} />
          </mesh>
          <mesh scale={2.1}>
            <sphereGeometry args={[0.4, 10, 10]} />
            <meshBasicMaterial color="#ff4d1a" transparent opacity={0.25} toneMapped={false} />
          </mesh>
          <pointLight intensity={2.4} distance={5} color="#ff8a2b" />
        </group>
      ))}

      {/* Ultimate meteors */}
      {Array.from({ length: METEOR_POOL }, (_, i) => (
        <group
          key={`m${i}`}
          ref={(el) => {
            meteors.current[i] = el
          }}
          visible={false}
        >
          <mesh>
            <dodecahedronGeometry args={[0.95, 0]} />
            <meshStandardMaterial
              color="#4a2118"
              emissive="#ff5a1a"
              emissiveIntensity={1.4}
              flatShading
            />
          </mesh>
          <mesh scale={1.5}>
            <sphereGeometry args={[0.95, 14, 14]} />
            <meshBasicMaterial color="#ff7a2b" transparent opacity={0.4} toneMapped={false} />
          </mesh>
          {/* Flame trail streaking upward */}
          <mesh position={[0, 2.4, 0]} scale={[1.1, 3.4, 1.1]}>
            <coneGeometry args={[0.7, 1, 8]} />
            <meshBasicMaterial color="#ff9a3c" transparent opacity={0.42} toneMapped={false} />
          </mesh>
          <pointLight intensity={7} distance={16} color="#ff7a2b" />
        </group>
      ))}
    </group>
  )
}

export default Projectiles
