import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain'
import Camp from './Camp'
import SafeZone from './SafeZone'
import Hunter from './Hunter'
import MonsterModel, { preloadGodzilla } from './MonsterModel'
import Projectiles from './Projectiles'
import Effects from './Effects'
import DamageNumbers from './DamageNumbers'
import RemoteHunters from './RemoteHunters'
import Pickups from './Pickups'
import RangeRing from './RangeRing'
import NetSync from '../net/NetSync'
import { CAMERA } from '../game/constants'
import { updateGame } from '../game/gameState'

/** Flickering bubble shown during respawn invulnerability. */
function InvulnShield({ game }) {
  const ref = useRef(null)

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const remaining = game.player.invulnTimer
    const active = remaining > 0 && game.player.state !== 'dead'
    mesh.visible = active
    if (!active) return

    const t = clock.elapsedTime
    mesh.rotation.y = t * 0.9
    mesh.rotation.x = Math.sin(t * 0.6) * 0.12
    // Pulse, then flicker urgently in the final second so the end is readable.
    const urgency = remaining < 1 ? 0.35 + Math.abs(Math.sin(t * 22)) * 0.65 : 1
    mesh.material.opacity = (0.16 + Math.sin(t * 4) * 0.06) * urgency
    const breathe = 1 + Math.sin(t * 3.2) * 0.05
    mesh.scale.setScalar(breathe)
  })

  return (
    <mesh ref={ref} visible={false} position={[0, 1.0, 0]}>
      <sphereGeometry args={[1.15, 20, 16]} />
      <meshBasicMaterial
        color="#8fd8ff"
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

// Rotating reticle under the locked-on monster. Manual lock gets a solid,
// brighter ring; the transient auto-lock (engaged mid-swing) gets a dimmer
// one so the two read as distinct without needing separate HUD text.
function LockRing({ game, runtime }) {
  const ref = useRef(null)
  useFrame((state) => {
    if (!ref.current) return
    const manual = game.lockedOnId === runtime.id
    const auto = !game.lockedOnId && game.autoLockId === runtime.id
    ref.current.visible = (manual || auto) && !runtime.dead
    ref.current.rotation.z = state.clock.elapsedTime * (manual ? 1.4 : 0.6)
    const material = ref.current.material
    material.opacity = manual ? 0.9 : 0.45
    material.color.set(manual ? '#ff6b4a' : '#ffb45c')
  })
  return (
    <mesh ref={ref} visible={false} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[runtime.def.hitRadius + 0.45, runtime.def.hitRadius + 0.68, 6]} />
      <meshBasicMaterial color="#ff6b4a" transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  )
}

// Billboarded health bar above an engaged monster.
function MonsterHealthBar({ runtime }) {
  const group = useRef(null)
  const fill = useRef(null)
  const { camera } = useThree()

  useFrame(() => {
    if (!group.current) return
    const show = runtime.aggro && !runtime.dead
    group.current.visible = show
    if (!show) return
    group.current.quaternion.copy(camera.quaternion)
    if (fill.current) {
      const ratio = Math.max(0, runtime.hp / runtime.def.maxHp)
      fill.current.scale.x = Math.max(0.001, ratio)
      fill.current.position.x = -(1 - ratio) * 0.6
    }
  })

  const height =
    runtime.def.model === 'godzilla'
      ? 15
      : runtime.def.model === 'drake'
        ? 5.2
        : runtime.def.model === 'biped'
          ? 3.2
          : 2.8

  return (
    <group ref={group} position={[0, height, 0]}>
      <mesh>
        <planeGeometry args={[1.26, 0.17]} />
        <meshBasicMaterial color="#12141c" transparent opacity={0.78} />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.01]}>
        <planeGeometry args={[1.2, 0.11]} />
        <meshBasicMaterial color="#ff5a4a" toneMapped={false} />
      </mesh>
    </group>
  )
}

function MonsterEntity({ runtime, game }) {
  const group = useRef(null)

  useFrame(() => {
    if (!group.current) return
    group.current.position.set(runtime.x, 0, runtime.z)
    group.current.rotation.y = runtime.facing
    group.current.visible = !(runtime.dead && runtime.deadTimer > 3.4)
  })

  return (
    <group ref={group}>
      <MonsterModel runtime={runtime} />
      <MonsterHealthBar runtime={runtime} />
      <LockRing game={game} runtime={runtime} />
    </group>
  )
}

/**
 * Drives the simulation: ticks game state from input each frame, then pushes
 * results onto the scene graph and camera.
 */
function GameScene({ game, input, timeOfDay, damageNodesRef, net, nameNodesRef, roster }) {
  const hunterRef = useRef(null)
  const { camera } = useThree()

  const camState = useRef({
    pos: new THREE.Vector3(0, CAMERA.height, CAMERA.distance),
    look: new THREE.Vector3(0, 1, 0),
    // Scratch vectors reused every frame instead of allocating new THREE.Vector3
    // instances in the hot camera-follow path (60 allocations/sec avoided).
    scratchDesired: new THREE.Vector3(),
    scratchLook: new THREE.Vector3(),
  })

  const lighting = useMemo(() => {
    if (timeOfDay === 'dusk') {
      return {
        sun: [-30, 12, -10],
        sunColor: '#ffa860',
        sunIntensity: 1.05,
        ambient: 0.5,
        ambientColor: '#ffd2ac',
        hemi: ['#ffb98a', '#5a4030', 0.45],
        fog: '#e8a878',
        fogDensity: 0.011,
        turbidity: 9,
        rayleigh: 3.2,
      }
    }
    if (timeOfDay === 'night') {
      return {
        sun: [-20, 26, -20],
        sunColor: '#9db4ff',
        sunIntensity: 0.4,
        ambient: 0.3,
        ambientColor: '#8fa6ff',
        hemi: ['#2c3a66', '#1a2436', 0.5],
        fog: '#1b2340',
        fogDensity: 0.018,
        turbidity: 14,
        rayleigh: 0.6,
      }
    }
    return {
      sun: [26, 32, 18],
      sunColor: '#fff4dd',
      sunIntensity: 1.35,
      ambient: 0.66,
      ambientColor: '#ffffff',
      hemi: ['#bcdcff', '#4f7a3a', 0.5],
      fog: '#b8d8ea',
      fogDensity: 0.007,
      turbidity: 6,
      rayleigh: 1.4,
    }
  }, [timeOfDay])

  // Warm the (large) Godzilla GLB once the drake fight is clearly underway
  // (aggroed and worn down), so it's already cached by the time the dragon
  // actually falls — but not from the very start, so a hunt that never
  // engages the drake never pays for a 17MB download. `game` mutates in
  // place rather than triggering React re-renders, so this is checked from
  // inside the frame loop (once, via the ref guard) instead of a useEffect.
  const godzillaWarmed = useRef(false)

  useFrame((state, rawDelta) => {
    if (!godzillaWarmed.current) {
      const drake = game.monsters.find((m) => m.species === 'drake')
      const drakeIsFalling = drake && !drake.dead && drake.hp <= drake.def.maxHp * 0.4
      if (game.phase === 'kaiju' || drakeIsFalling) {
        godzillaWarmed.current = true
        preloadGodzilla()
      }
    }

    const delta = Math.min(rawDelta, 0.05)

    // `input.cameraAngle` is the single source of truth — mouse drag writes to
    // it directly, and the rotate keys nudge it here.
    if (input.current.rotateLeft) input.current.cameraAngle -= CAMERA.rotateSpeed * delta
    if (input.current.rotateRight) input.current.cameraAngle += CAMERA.rotateSpeed * delta

    updateGame(game, delta, input.current)

    const player = game.player

    if (hunterRef.current) {
      hunterRef.current.position.set(player.x, 0, player.z)
      hunterRef.current.rotation.y = player.facing
    }

    // Follow camera; frames the locked target alongside the hunter.
    const angle = input.current.cameraAngle
    let focusX = player.x
    let focusZ = player.z

    const trackId = game.lockedOnId ?? game.autoLockId
    const locked = trackId ? game.monsters.find((m) => m.id === trackId && !m.dead) : null
    if (locked) {
      focusX = player.x + (locked.x - player.x) * 0.3
      focusZ = player.z + (locked.z - player.z) * 0.3
    }

    // Mouse-wheel zoom scales both distance and height so the pitch holds.
    const zoom = input.current.cameraZoom ?? 1
    const desired = camState.current.scratchDesired.set(
      focusX + Math.sin(angle) * CAMERA.distance * zoom,
      CAMERA.height * zoom,
      focusZ + Math.cos(angle) * CAMERA.distance * zoom,
    )

    const smoothing = 1 - Math.exp(-CAMERA.followLerp * delta)
    camState.current.pos.lerp(desired, smoothing)
    camState.current.look.lerp(camState.current.scratchLook.set(focusX, CAMERA.lookHeight, focusZ), smoothing)

    const shake = game.shake
    const offsetX = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0
    const offsetY = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0

    camera.position.set(
      camState.current.pos.x + offsetX,
      camState.current.pos.y + offsetY,
      camState.current.pos.z,
    )
    camera.lookAt(camState.current.look)
  })

  return (
    <>
      {/* Fog attaches to the scene, so it must be a direct Canvas child */}
      <fogExp2 attach="fog" color={lighting.fog} density={lighting.fogDensity} />

      <Sky
        distance={4500}
        sunPosition={lighting.sun}
        turbidity={lighting.turbidity}
        rayleigh={lighting.rayleigh}
        mieCoefficient={0.006}
        mieDirectionalG={0.86}
      />

      <ambientLight intensity={lighting.ambient} color={lighting.ambientColor} />
      <hemisphereLight args={lighting.hemi} />
      <directionalLight
        position={lighting.sun}
        intensity={lighting.sunIntensity}
        color={lighting.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
        shadow-camera-near={0.5}
        shadow-camera-far={95}
        shadow-bias={-0.0006}
      />

      <Terrain />
      <Camp />
      <SafeZone game={game} />

      <group ref={hunterRef}>
        <Hunter player={game.player} />
        <InvulnShield game={game} />
      </group>

      {game.monsters.map((runtime) => (
        <MonsterEntity key={runtime.id} runtime={runtime} game={game} />
      ))}

      <Pickups game={game} />
      <RangeRing game={game} />
      <Projectiles game={game} />
      <Effects game={game} />
      <DamageNumbers game={game} nodesRef={damageNodesRef} />

      {net && (
        <>
          <RemoteHunters
            remotePlayersRef={net.remotePlayersRef}
            nameNodesRef={nameNodesRef}
            roster={roster}
          />
          <NetSync game={game} net={net} />
        </>
      )}
    </>
  )
}

export default GameScene
