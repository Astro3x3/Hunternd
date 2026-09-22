import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SAFE_ZONE } from '../game/constants'

/**
 * The camp ward: a visible dome that marks where monsters can't follow and
 * where you regenerate. It brightens while you're inside so the boundary is
 * legible mid-fight without reading the HUD.
 */
function SafeZone({ game }) {
  const dome = useRef(null)
  const ring = useRef(null)
  const innerRing = useRef(null)
  const glow = useRef(null)
  const pillars = useRef([])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const t = state.clock.elapsedTime
    const inside = game.player.inSafeZone

    // Ease the whole ward toward "active" when the hunter steps in.
    const target = inside ? 1 : 0.42
    if (dome.current) {
      const material = dome.current.material
      material.opacity = THREE.MathUtils.lerp(material.opacity, 0.07 * target + 0.02, delta * 5)
      dome.current.rotation.y = t * 0.06
    }

    if (ring.current) {
      const material = ring.current.material
      material.opacity = THREE.MathUtils.lerp(
        material.opacity,
        (0.45 + Math.sin(t * 2) * 0.1) * target,
        delta * 5,
      )
      ring.current.rotation.z = t * 0.12
    }

    if (innerRing.current) {
      innerRing.current.rotation.z = -t * 0.2
      const pulse = 1 + Math.sin(t * 1.6) * 0.012
      innerRing.current.scale.set(pulse, pulse, 1)
    }

    if (glow.current) {
      glow.current.intensity = THREE.MathUtils.lerp(glow.current.intensity, inside ? 2.4 : 1.2, delta * 4)
    }

    // Ward pillars bob gently out of phase.
    pillars.current.forEach((pillar, i) => {
      if (!pillar) return
      pillar.position.y = 1.4 + Math.sin(t * 1.4 + i) * 0.1
      pillar.rotation.y = t * 0.5 + i
    })
  })

  const pillarCount = 6

  return (
    <group position={[SAFE_ZONE.x, 0, SAFE_ZONE.z]}>
      {/* Boundary dome */}
      <mesh ref={dome} position={[0, 0, 0]}>
        <sphereGeometry args={[SAFE_ZONE.radius, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial
          color="#8fe0c0"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Ground rings marking the edge */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <ringGeometry args={[SAFE_ZONE.radius - 0.35, SAFE_ZONE.radius, 72]} />
        <meshBasicMaterial
          color="#8fe0c0"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={innerRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[SAFE_ZONE.radius - 1.4, SAFE_ZONE.radius - 1.2, 72]} />
        <meshBasicMaterial
          color="#6ee7a8"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Floating ward stones around the perimeter */}
      {Array.from({ length: pillarCount }, (_, i) => {
        const angle = (i / pillarCount) * Math.PI * 2
        const px = Math.cos(angle) * (SAFE_ZONE.radius - 0.8)
        const pz = Math.sin(angle) * (SAFE_ZONE.radius - 0.8)
        return (
          <group key={i} position={[px, 0, pz]}>
            {/* Base plinth */}
            <mesh position={[0, 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.28, 0.36, 1, 6]} />
              <meshStandardMaterial color="#8d8677" roughness={0.9} flatShading />
            </mesh>
            {/* Hovering rune crystal */}
            <mesh
              ref={(el) => {
                pillars.current[i] = el
              }}
              position={[0, 1.4, 0]}
              castShadow
            >
              <octahedronGeometry args={[0.3, 0]} />
              <meshStandardMaterial
                color="#8fe0c0"
                emissive="#3fbf88"
                emissiveIntensity={1.6}
                flatShading
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}

      <pointLight ref={glow} position={[0, 4, 0]} intensity={1.6} distance={SAFE_ZONE.radius * 2.4} color="#8fe0c0" />
    </group>
  )
}

export default SafeZone
