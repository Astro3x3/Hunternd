import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PICKUPS, PICKUP_LIFETIME } from '../data/pickups'

const POOL = 40

/**
 * Pooled drop models. Each slot holds one of every pickup shape and only shows
 * the variant matching whatever it's currently representing — that way slots
 * are interchangeable and nothing is created or destroyed during combat.
 */
function PickupModels({ groupRef }) {
  return (
    <group ref={groupRef}>
      {/* 0 — health potion: round flask */}
      <group>
        <mesh castShadow>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial
            color={PICKUPS.healthPotion.color}
            emissive={PICKUPS.healthPotion.glow}
            emissiveIntensity={0.9}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.14, 6]} />
          <meshStandardMaterial color="#d8cfa8" roughness={0.6} />
        </mesh>
      </group>

      {/* 1 — stamina tonic: tall vial */}
      <group>
        <mesh castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.34, 8]} />
          <meshStandardMaterial
            color={PICKUPS.staminaTonic.color}
            emissive={PICKUPS.staminaTonic.glow}
            emissiveIntensity={0.9}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.23, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 6]} />
          <meshStandardMaterial color="#d8cfa8" roughness={0.6} />
        </mesh>
      </group>

      {/* 2 — rage shard: jagged crystal */}
      <mesh castShadow>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial
          color={PICKUPS.rageShard.color}
          emissive={PICKUPS.rageShard.glow}
          emissiveIntensity={1.4}
          flatShading
          roughness={0.25}
        />
      </mesh>

      {/* 3 — material: faceted gem */}
      <mesh castShadow>
        <dodecahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial
          color={PICKUPS.material.color}
          emissive={PICKUPS.material.glow}
          emissiveIntensity={0.8}
          flatShading
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
    </group>
  )
}

const VARIANT_INDEX = { healthPotion: 0, staminaTonic: 1, rageShard: 2, material: 3 }

function Pickups({ game }) {
  const slots = useRef([])
  const models = useRef([])
  const halos = useRef([])
  const lights = useRef([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    let index = 0

    game.pickups.forEach((pickup) => {
      if (index >= POOL || pickup.collected) return
      const slot = slots.current[index]
      const modelGroup = models.current[index]
      const halo = halos.current[index]
      const light = lights.current[index]
      const slotIndex = index
      index += 1
      if (!slot) return

      slot.visible = true
      // Bob and spin so drops read as interactive, not scenery.
      const bob = Math.sin(t * 2.6 + pickup.bob) * 0.12
      slot.position.set(pickup.x, 0.5 + bob, pickup.z)
      slot.rotation.y = t * 1.3 + slotIndex

      // Fade out over the last few seconds of the lifetime.
      const remaining = PICKUP_LIFETIME - pickup.t
      const fade = remaining < 4 ? Math.max(0, remaining / 4) : 1
      // Blink faster as it's about to vanish.
      const blink = remaining < 4 ? 0.55 + Math.abs(Math.sin(t * 9)) * 0.45 : 1
      const visibility = fade * blink

      // Show only the matching variant in this slot.
      const wanted = VARIANT_INDEX[pickup.type] ?? 3
      if (modelGroup) {
        modelGroup.children.forEach((child, i) => {
          child.visible = i === wanted
        })
      }

      if (halo) {
        halo.rotation.z = t * 1.8
        const pulse = 1 + Math.sin(t * 3.4 + slotIndex) * 0.12
        halo.scale.setScalar(pulse)
        if (halo.material) {
          halo.material.opacity = 0.35 * visibility
          halo.material.color.set(pickup.def.color)
        }
      }
      if (light) {
        light.intensity = 1.5 * visibility
        light.color.set(pickup.def.glow)
      }
    })

    for (let i = index; i < POOL; i += 1) {
      if (slots.current[i]) slots.current[i].visible = false
    }
  })

  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            slots.current[i] = el
          }}
          visible={false}
        >
          <PickupModels
            groupRef={(el) => {
              models.current[i] = el
            }}
          />

          {/* Ground halo marking the drop */}
          <mesh
            ref={(el) => {
              halos.current[i] = el
            }}
            position={[0, -0.44, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.3, 0.44, 20]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.35} toneMapped={false} />
          </mesh>

          <pointLight
            ref={(el) => {
              lights.current[i] = el
            }}
            intensity={1.5}
            distance={3.2}
          />
        </group>
      ))}
    </group>
  )
}

export default Pickups
