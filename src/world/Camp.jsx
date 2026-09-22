import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CAMP } from '../game/constants'

// Base camp: tent, campfire, supply crates and the quest board. Doubles as the
// safe respawn point and where the portfolio (Guild Card) lives.
function Camp() {
  const fire = useRef(null)
  const light = useRef(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const flicker = 0.75 + Math.sin(t * 9) * 0.12 + Math.sin(t * 21) * 0.06
    if (fire.current) fire.current.scale.set(flicker, 1 + flicker * 0.3, flicker)
    if (light.current) light.current.intensity = 2.2 * flicker
  })

  return (
    <group position={[CAMP.x, 0, CAMP.z]}>
      {/* Stone platform */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7, 32]} />
        <meshStandardMaterial color="#b0a58c" />
      </mesh>

      {/* Tent */}
      <group position={[-3.2, 0, -1.2]}>
        <mesh position={[0, 1.1, 0]} rotation={[0, Math.PI / 5, 0]} castShadow>
          <coneGeometry args={[1.9, 2.2, 5]} />
          <meshStandardMaterial color="#c2683f" flatShading />
        </mesh>
        <mesh position={[0, 0.5, 1.2]} castShadow>
          <boxGeometry args={[0.8, 1.0, 0.1]} />
          <meshStandardMaterial color="#5a3a26" />
        </mesh>
      </group>

      {/* Campfire */}
      <group position={[0, 0, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const angle = (i / 6) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 0.72, 0.1, Math.sin(angle) * 0.72]}
              castShadow
            >
              <dodecahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color="#8e8878" flatShading />
            </mesh>
          )
        })}
        <mesh position={[0, 0.16, 0]} rotation={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.9, 0.14, 0.18]} />
          <meshStandardMaterial color="#5a3a26" />
        </mesh>
        <mesh position={[0, 0.16, 0]} rotation={[0, -0.6, 0]} castShadow>
          <boxGeometry args={[0.9, 0.14, 0.18]} />
          <meshStandardMaterial color="#4a2f20" />
        </mesh>
        <mesh ref={fire} position={[0, 0.5, 0]}>
          <coneGeometry args={[0.32, 0.8, 7]} />
          <meshStandardMaterial color="#ff8a2b" emissive="#ff6a00" emissiveIntensity={2} />
        </mesh>
        <pointLight ref={light} position={[0, 1, 0]} distance={11} color="#ff9a3c" />
      </group>

      {/* Quest board — the portfolio landmark */}
      <group position={[2.8, 0, -0.6]} rotation={[0, -0.5, 0]}>
        <mesh position={[-0.6, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 1.2, 6]} />
          <meshStandardMaterial color="#6b4a30" />
        </mesh>
        <mesh position={[0.6, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 1.2, 6]} />
          <meshStandardMaterial color="#6b4a30" />
        </mesh>
        <mesh position={[0, 1.35, 0]} castShadow>
          <boxGeometry args={[1.8, 1.3, 0.1]} />
          <meshStandardMaterial color="#e3cfa4" />
        </mesh>
        <mesh position={[0, 1.6, 0.06]}>
          <boxGeometry args={[1.3, 0.14, 0.02]} />
          <meshStandardMaterial color="#c084fc" />
        </mesh>
        <mesh position={[-0.2, 1.35, 0.06]}>
          <boxGeometry args={[0.85, 0.1, 0.02]} />
          <meshStandardMaterial color="#7c9cff" />
        </mesh>
        <mesh position={[-0.35, 1.12, 0.06]}>
          <boxGeometry args={[0.55, 0.1, 0.02]} />
          <meshStandardMaterial color="#9a95ab" />
        </mesh>
      </group>

      {/* Supply crates */}
      <mesh position={[3.4, 0.35, 2.2]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial color="#a9762f" />
      </mesh>
      <mesh position={[4.1, 0.28, 1.6]} rotation={[0, -0.2, 0]} castShadow>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial color="#8f6224" />
      </mesh>

      {/* Banner marking the camp from a distance */}
      <mesh position={[-1.2, 1.6, 2.6]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 3.2, 6]} />
        <meshStandardMaterial color="#5a3a26" />
      </mesh>
      <mesh position={[-0.65, 2.6, 2.6]} castShadow>
        <boxGeometry args={[1.0, 0.7, 0.04]} />
        <meshStandardMaterial color="#4a5a7a" />
      </mesh>
    </group>
  )
}

export default Camp
