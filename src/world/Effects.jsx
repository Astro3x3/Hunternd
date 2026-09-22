import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Pooled visual effects. Each pool renders one effect archetype; every frame we
 * match live effects from game state onto free pool slots and drive their
 * transform/opacity from the effect's normalised lifetime.
 */

const POOLS = {
  slash: 10, // weapon swing arcs
  impact: 16, // hit sparks
  ring: 10, // shockwaves, staggers, roars, vortex, dust
  burst: 6, // explosions, slay bursts
  aura: 5, // heal / buff / level-up columns
  telegraph: 3, // meteor target marker
  bolt: 6, // lightning discharge
}

function setOpacity(object, value) {
  object.traverse((child) => {
    if (child.material) {
      child.material.transparent = true
      child.material.opacity = value
    }
  })
}

function Effects({ game }) {
  const slashes = useRef([])
  const impacts = useRef([])
  const rings = useRef([])
  const bursts = useRef([])
  const auras = useRef([])
  const telegraphs = useRef([])
  const bolts = useRef([])

  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    let slashIndex = 0
    let impactIndex = 0
    let ringIndex = 0
    let burstIndex = 0
    let auraIndex = 0
    let telegraphIndex = 0
    let boltIndex = 0

    game.effects.forEach((effect) => {
      const progress = Math.min(effect.t / effect.duration, 1)
      const fade = 1 - progress

      switch (effect.kind) {
        // ---- weapon swing arcs ----
        case 'arcThin':
        case 'arcWide':
        case 'arcHeavy':
        case 'spin':
        case 'powerSlash': {
          if (slashIndex >= POOLS.slash) break
          const group = slashes.current[slashIndex]
          slashIndex += 1
          if (!group) break

          const isSpin = effect.kind === 'spin'
          const heavy = effect.kind === 'arcHeavy' || effect.kind === 'powerSlash'
          const thin = effect.kind === 'arcThin'

          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          // Spin arcs whirl a full turn; directional arcs sweep across the front.
          group.rotation.set(
            0,
            isSpin ? effect.rotation + progress * Math.PI * 2 : effect.rotation + (progress - 0.5) * 1.5,
            0,
          )
          const grow = 0.55 + progress * 0.7
          group.scale.set(
            effect.scale * grow * (thin ? 0.7 : 1),
            effect.scale * grow * (heavy ? 1.5 : 1),
            effect.scale * grow * (thin ? 0.7 : 1),
          )
          const mesh = group.children[0]
          if (mesh?.material) {
            mesh.material.opacity = fade * (heavy ? 0.9 : 0.65)
            mesh.material.color.set(
              effect.kind === 'powerSlash' ? '#ffd76a' : heavy ? '#ffe9b0' : '#dff0ff',
            )
          }
          break
        }

        // ---- hit sparks ----
        case 'impact':
        case 'muzzle': {
          if (impactIndex >= POOLS.impact) break
          const group = impacts.current[impactIndex]
          impactIndex += 1
          if (!group) break
          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          const pop = 0.4 + progress * 1.5
          group.scale.setScalar(effect.scale * pop)
          group.rotation.y = effect.rotation + progress * 2
          setOpacity(group, fade * 0.95)
          break
        }

        case 'muzzleFire': {
          if (impactIndex >= POOLS.impact) break
          const group = impacts.current[impactIndex]
          impactIndex += 1
          if (!group) break
          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          group.scale.setScalar(effect.scale * (0.6 + progress * 2.2))
          setOpacity(group, fade)
          break
        }

        // ---- expanding rings ----
        case 'shock':
        case 'shockBig':
        case 'stagger':
        case 'roar':
        case 'vortex':
        case 'dust':
        case 'swap':
        case 'cast':
        case 'respawn':
        case 'wardHit':
        case 'winded':
        case 'pickupFlash':
        case 'hurt': {
          if (ringIndex >= POOLS.ring) break
          const group = rings.current[ringIndex]
          ringIndex += 1
          if (!group) break

          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)

          const isVortex = effect.kind === 'vortex'
          const big = effect.kind === 'shockBig' || effect.kind === 'roar'
          const spread = isVortex ? 1.2 + progress * 3.4 : (big ? 2.2 : 1.1) + progress * (big ? 5.5 : 3.2)
          group.scale.set(spread * effect.scale, isVortex ? 1 + progress * 2 : 1, spread * effect.scale)
          group.rotation.y = progress * (isVortex ? 9 : 2)

          const mesh = group.children[0]
          if (mesh?.material) {
            mesh.material.opacity = fade * (effect.kind === 'cast' ? 0.5 : 0.7)
            const palette = {
              roar: '#ffd0a0',
              stagger: '#ffe680',
              vortex: '#9fd8ff',
              dust: '#d8cfbc',
              swap: '#d8cfbc',
              cast: '#c9a6ff',
              respawn: '#8fd8ff',
              wardHit: '#8fe0c0',
              winded: '#cbd5e1',
              pickupFlash: '#a78bfa',
              hurt: '#ff6b6b',
            }
            mesh.material.color.set(palette[effect.kind] ?? '#ffe9b0')
          }
          break
        }

        // ---- lightning discharge (Stormcaller passive) ----
        case 'lightning': {
          if (boltIndex >= POOLS.bolt) break
          const group = bolts.current[boltIndex]
          boltIndex += 1
          if (!group) break

          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          group.scale.setScalar(effect.scale)
          // Jitter the bolt segments each frame for a crackling look.
          group.children.forEach((child, i) => {
            if (child.isMesh) {
              child.position.x = Math.sin(now * 90 + i * 2.7) * 0.16
              child.position.z = Math.cos(now * 78 + i * 3.1) * 0.16
              child.rotation.y = now * 12 + i
              if (child.material) child.material.opacity = fade * (i === 0 ? 1 : 0.7)
            } else if (child.isPointLight) {
              child.intensity = fade * 6
            }
          })
          break
        }

        // ---- explosions / death bursts ----
        case 'explosion':
        case 'slayBurst': {
          if (burstIndex >= POOLS.burst) break
          const group = bursts.current[burstIndex]
          burstIndex += 1
          if (!group) break

          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          // Fast expansion then fade, like a real blast.
          const expand = Math.pow(progress, 0.42)
          group.scale.setScalar(effect.scale * (0.4 + expand * 1.9))

          const core = group.children[0]
          const shell = group.children[1]
          const shockRing = group.children[2]
          const light = group.children[3]
          if (core?.material) core.material.opacity = Math.max(0, fade * 1.4 - 0.3)
          if (shell?.material) shell.material.opacity = fade * 0.55
          if (shockRing) {
            shockRing.scale.setScalar(1 + progress * 2.2)
            if (shockRing.material) shockRing.material.opacity = fade * 0.5
          }
          if (light) light.intensity = fade * (effect.kind === 'slayBurst' ? 5 : 9)

          if (effect.kind === 'slayBurst') {
            core?.material?.color.set('#ffe9b0')
            shell?.material?.color.set('#ffd76a')
          } else {
            core?.material?.color.set('#fff3cf')
            shell?.material?.color.set('#ff7a2b')
          }
          break
        }

        // ---- heal / buff / level-up / new-quest columns ----
        case 'heal':
        case 'buff':
        case 'levelUp':
        case 'newQuest': {
          if (auraIndex >= POOLS.aura) break
          const group = auras.current[auraIndex]
          auraIndex += 1
          if (!group) break

          const isLevelUp = effect.kind === 'levelUp'
          const isNewQuest = effect.kind === 'newQuest'
          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          group.rotation.y = progress * (isLevelUp || isNewQuest ? 12 : 7)
          // Level-up / new-quest flares wider and taller than a heal.
          const bigFlare = isLevelUp || isNewQuest
          group.scale.set(
            bigFlare ? 1 + progress * 0.7 : 1,
            1 + progress * (bigFlare ? 2.6 : 1.4),
            bigFlare ? 1 + progress * 0.7 : 1,
          )

          const colour = isLevelUp
            ? '#ffd76a'
            : isNewQuest
              ? '#7dd3fc'
              : effect.kind === 'heal'
                ? '#6ee7a8'
                : '#ff8a3c'
          group.children.forEach((child, i) => {
            if (child.material) {
              child.material.opacity = fade * (0.6 - i * 0.1) * (bigFlare ? 1.5 : 1)
              child.material.color.set(colour)
            }
            if (i > 0) {
              // Motes spiral upward at staggered rates.
              child.position.y = ((progress * (1 + i * 0.4)) % 1) * (bigFlare ? 3.6 : 2.4)
            }
          })
          break
        }

        // ---- meteor ground marker ----
        case 'meteorTelegraph': {
          if (telegraphIndex >= POOLS.telegraph) break
          const group = telegraphs.current[telegraphIndex]
          telegraphIndex += 1
          if (!group) break

          group.visible = true
          group.position.set(effect.x, effect.y, effect.z)
          group.scale.setScalar(effect.scale)
          group.rotation.z = progress * 4

          // Pulse faster as impact approaches.
          const pulse = 0.35 + Math.abs(Math.sin(progress * Math.PI * 7)) * 0.5
          group.children.forEach((child, i) => {
            if (child.material) child.material.opacity = pulse * (i === 0 ? 0.5 : 0.85)
          })
          break
        }

        default:
          break
      }
    })

    // Hide unused slots.
    for (let i = slashIndex; i < POOLS.slash; i += 1) if (slashes.current[i]) slashes.current[i].visible = false
    for (let i = impactIndex; i < POOLS.impact; i += 1) if (impacts.current[i]) impacts.current[i].visible = false
    for (let i = ringIndex; i < POOLS.ring; i += 1) if (rings.current[i]) rings.current[i].visible = false
    for (let i = burstIndex; i < POOLS.burst; i += 1) if (bursts.current[i]) bursts.current[i].visible = false
    for (let i = auraIndex; i < POOLS.aura; i += 1) if (auras.current[i]) auras.current[i].visible = false
    for (let i = telegraphIndex; i < POOLS.telegraph; i += 1)
      if (telegraphs.current[i]) telegraphs.current[i].visible = false
    for (let i = boltIndex; i < POOLS.bolt; i += 1)
      if (bolts.current[i]) bolts.current[i].visible = false
  })

  return (
    <group>
      {/* Swing arcs — a torus slice reads as a blade trail */}
      {Array.from({ length: POOLS.slash }, (_, i) => (
        <group key={`s${i}`} ref={(el) => { slashes.current[i] = el }} visible={false}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.5, 0.16, 6, 20, Math.PI * 1.1]} />
            <meshBasicMaterial color="#dff0ff" transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Hit sparks — crossed quads plus a spark burst */}
      {Array.from({ length: POOLS.impact }, (_, i) => (
        <group key={`i${i}`} ref={(el) => { impacts.current[i] = el }} visible={false}>
          <mesh>
            <sphereGeometry args={[0.22, 8, 8]} />
            <meshBasicMaterial color="#fff3cf" transparent toneMapped={false} />
          </mesh>
          {[0, 1, 2, 3].map((spark) => {
            const angle = (spark / 4) * Math.PI * 2
            return (
              <mesh
                key={spark}
                position={[Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0]}
                rotation={[0, 0, angle]}
              >
                <boxGeometry args={[0.36, 0.045, 0.045]} />
                <meshBasicMaterial color="#ffd98a" transparent toneMapped={false} />
              </mesh>
            )
          })}
        </group>
      ))}

      {/* Ground rings */}
      {Array.from({ length: POOLS.ring }, (_, i) => (
        <group key={`r${i}`} ref={(el) => { rings.current[i] = el }} visible={false}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.72, 1, 28]} />
            <meshBasicMaterial color="#ffe9b0" transparent opacity={0.6} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Explosions */}
      {Array.from({ length: POOLS.burst }, (_, i) => (
        <group key={`b${i}`} ref={(el) => { bursts.current[i] = el }} visible={false}>
          <mesh>
            <sphereGeometry args={[0.55, 14, 14]} />
            <meshBasicMaterial color="#fff3cf" transparent toneMapped={false} />
          </mesh>
          <mesh scale={1.5}>
            <sphereGeometry args={[0.55, 12, 12]} />
            <meshBasicMaterial color="#ff7a2b" transparent opacity={0.5} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
            <ringGeometry args={[0.8, 1.15, 28]} />
            <meshBasicMaterial color="#ffb45c" transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <pointLight intensity={0} distance={18} color="#ff8a2b" />
        </group>
      ))}

      {/* Heal / buff columns with rising motes */}
      {Array.from({ length: POOLS.aura }, (_, i) => (
        <group key={`u${i}`} ref={(el) => { auras.current[i] = el }} visible={false}>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.85, 0.6, 2.2, 18, 1, true]} />
            <meshBasicMaterial color="#6ee7a8" transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          {[0, 1, 2, 3, 4].map((mote) => {
            const angle = (mote / 5) * Math.PI * 2
            return (
              <mesh key={mote} position={[Math.cos(angle) * 0.7, 0, Math.sin(angle) * 0.7]}>
                <sphereGeometry args={[0.09, 8, 8]} />
                <meshBasicMaterial color="#6ee7a8" transparent toneMapped={false} />
              </mesh>
            )
          })}
        </group>
      ))}

      {/* Lightning bolts — stacked tapering shafts that jitter each frame */}
      {Array.from({ length: POOLS.bolt }, (_, i) => (
        <group key={`l${i}`} ref={(el) => { bolts.current[i] = el }} visible={false}>
          {[0, 1, 2, 3].map((seg) => (
            <mesh key={seg} position={[0, 0.7 + seg * 0.75, 0]}>
              <cylinderGeometry args={[0.07 - seg * 0.012, 0.11 - seg * 0.014, 0.8, 4]} />
              <meshBasicMaterial color="#fff6c4" transparent opacity={0.9} toneMapped={false} />
            </mesh>
          ))}
          <pointLight intensity={0} distance={8} color="#ffe066" />
        </group>
      ))}

      {/* Meteor impact marker */}
      {Array.from({ length: POOLS.telegraph }, (_, i) => (
        <group
          key={`t${i}`}
          ref={(el) => { telegraphs.current[i] = el }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <mesh>
            <circleGeometry args={[1, 32]} />
            <meshBasicMaterial color="#ff5a1a" transparent opacity={0.4} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.9, 1, 32]} />
            <meshBasicMaterial color="#ffb45c" transparent opacity={0.85} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.45, 0.52, 32]} />
            <meshBasicMaterial color="#ffd76a" transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default Effects
