import { forwardRef, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLAYER } from '../game/constants'
import { WEAPONS } from '../data/weapons'
import { SKILLS_BY_ID } from '../data/skills'
import { CLASSES, DEFAULT_CLASS } from '../data/classes'
import { Bow, DualBlade, GreatSword, Hammer } from './Weapons'
import WeaponTrail from './WeaponTrail'

/**
 * The hunter. Reads the live player object each frame so its pose always
 * matches the authoritative combat state.
 *
 * Animation is blended rather than switched: locomotion is driven by actual
 * velocity (not a boolean), and every joint target is eased with an
 * exponential filter, so transitions between idle/walk/run/attack never pop.
 */
const Hunter = forwardRef(function Hunter({ player, showTrail = true }, ref) {
  const torso = useRef(null)
  const hips = useRef(null)
  const head = useRef(null)
  const cape = useRef(null)
  const rightArm = useRef(null)
  const leftArm = useRef(null)
  const leftLeg = useRef(null)
  const rightLeg = useRef(null)
  const weaponPivot = useRef(null)
  const auraRef = useRef(null)
  const trailBase = useRef(null)
  const trailTip = useRef(null)

  // Smoothed animation values, persisted across frames.
  const anim = useRef({
    stride: 0, // walk cycle phase
    strideSpeed: 0,
    locomotion: 0, // 0 idle → 1 full run, drives limb amplitude
    draw: 0, // bow draw
    swingX: -0.35,
    swingZ: 0,
    armX: -0.2,
    torsoPitch: 0,
    torsoYaw: 0,
    lean: 0,
  })

  const klass = CLASSES[player.classId] ?? CLASSES[DEFAULT_CLASS]
  const armour = klass.armour

  const materials = useMemo(
    () => ({
      plate: { color: armour.plate, metalness: 0.45, roughness: 0.45 },
      light: { color: armour.light, metalness: 0.5, roughness: 0.4 },
      trim: { color: armour.trim, metalness: 0.75, roughness: 0.3 },
      cloth: armour.cloth,
      under: '#2c3446',
    }),
    [armour],
  )

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const t = state.clock.elapsedTime
    const weapon = WEAPONS[player.weapon] ?? WEAPONS.greatsword
    const a = anim.current
    const isRanged = weapon.kind === 'ranged'

    /* ---------------- locomotion blend from real velocity ---------------- */
    // Normalise current speed against sprint speed to get a 0..1 blend factor.
    const maxSpeed = PLAYER.sprintSpeed * (player.stats?.speedMult ?? 1)
    const speedNorm = Math.min(1, (player.speed ?? 0) / maxSpeed)
    a.locomotion += (speedNorm - a.locomotion) * (1 - Math.exp(-11 * delta))

    // Stride frequency scales with speed so footfalls match ground travel.
    a.strideSpeed = 5.5 + a.locomotion * 10
    a.stride += a.strideSpeed * delta * (a.locomotion > 0.02 ? 1 : 0)

    const cycle = Math.sin(a.stride)
    const legAmp = a.locomotion * 0.85
    const armSwing = a.locomotion * 0.55

    /* ---------------------- action pose targets -------------------------- */
    let swingX = isRanged ? -1.5 : -0.35
    let swingZ = 0
    let torsoPitch = 0
    let torsoYaw = 0
    let armX = isRanged ? -1.35 : -0.2
    let targetDraw = 0
    let lean = 0

    if (isRanged) torsoYaw = -0.35

    if (player.state === 'attack') {
      const step = weapon.combo[Math.min(player.comboIndex, weapon.combo.length - 1)]
      const activeEnd = step.windup + step.active
      const total = activeEnd + step.recover

      if (isRanged) {
        if (player.stateTime < step.windup) {
          targetDraw = player.stateTime / step.windup
          armX = -1.35 - targetDraw * 0.15
        } else {
          targetDraw = 0
          armX = -1.2
        }
      } else if (weapon.id === 'dualblades') {
        if (step.vfx === 'spin') {
          const k = Math.min(player.stateTime / total, 1)
          torsoYaw = k * Math.PI * 2
          swingX = -0.9
          swingZ = 0.6
        } else {
          const dir = player.comboIndex % 2 === 0 ? 1 : -1
          if (player.stateTime < step.windup) {
            const k = player.stateTime / step.windup
            swingX = -0.4 - k * 0.7
            swingZ = dir * k * 1.1
            torsoYaw = dir * k * 0.45
          } else if (player.stateTime < activeEnd) {
            const k = (player.stateTime - step.windup) / step.active
            swingX = -1.1 + k * 1.5
            swingZ = dir * (1.1 - k * 2.2)
            torsoYaw = dir * (0.45 - k * 0.9)
          } else {
            const k = (player.stateTime - activeEnd) / step.recover
            swingX = 0.4 * (1 - k)
            swingZ = -dir * 1.1 * (1 - k)
            torsoYaw = -dir * 0.45 * (1 - k)
          }
        }
      } else {
        const heavy = weapon.id === 'hammer'
        const raise = heavy ? 2.7 : 2.3
        if (player.stateTime < step.windup) {
          const k = player.stateTime / step.windup
          // Ease-out on the raise so it anticipates rather than snapping up.
          const e = 1 - (1 - k) * (1 - k)
          swingX = -0.35 - e * raise
          torsoPitch = -e * 0.34
          torsoYaw = e * 0.55
          armX = -0.2 - e * 0.9
        } else if (player.stateTime < activeEnd) {
          const k = (player.stateTime - step.windup) / step.active
          // Ease-in on the strike: slow start, violent finish.
          const e = k * k
          swingX = -0.35 - raise + e * (raise + 1.6)
          torsoPitch = -0.34 + e * 0.86
          torsoYaw = 0.55 - e * 1.05
          armX = -1.1 + e * 1.25
        } else {
          const k = (player.stateTime - activeEnd) / step.recover
          const e = 1 - (1 - k) * (1 - k)
          swingX = 1.25 * (1 - e) - 0.35 * e
          torsoPitch = 0.52 * (1 - e)
          torsoYaw = -0.5 * (1 - e)
          armX = 0.15 * (1 - e) - 0.2 * e
        }
      }
    } else if (player.state === 'skill') {
      const skill = SKILLS_BY_ID[player.activeSkill]
      const progress = skill ? Math.min(player.stateTime / skill.duration, 1) : 0

      if (skill?.kind === 'heal') {
        armX = -2.3
        swingX = -0.2
        torsoPitch = -0.2
      } else if (skill?.kind === 'buff') {
        armX = -2.5
        torsoPitch = -0.3 * Math.sin(progress * Math.PI)
      } else if (skill?.kind === 'meteor') {
        if (progress < 0.42) {
          const k = progress / 0.42
          swingX = -0.35 - k * 2.9
          armX = -0.2 - k * 2.2
          torsoPitch = -k * 0.5
        } else {
          const k = (progress - 0.42) / 0.58
          const e = k * k
          swingX = -3.25 + e * 4.0
          armX = -2.4 + e * 2.2
          torsoPitch = -0.5 + e * 0.9
        }
      } else if (skill?.kind === 'radial') {
        torsoYaw = progress * Math.PI * 3
        swingX = -1.2
        swingZ = 0.75
      } else {
        if (progress < 0.45) {
          const k = progress / 0.45
          swingX = -0.35 - k * 2.7
          torsoYaw = k * 0.9
          torsoPitch = -k * 0.4
        } else {
          const k = (progress - 0.45) / 0.55
          const e = k * k
          swingX = -3.05 + e * 4.3
          torsoYaw = 0.9 - e * 1.7
          torsoPitch = -0.4 + e * 0.85
        }
      }
    } else if (player.state === 'roll') {
      const k = player.stateTime / PLAYER.rollDuration
      torsoPitch = Math.sin(k * Math.PI) * 2.15
      swingX = -1.5
      armX = -0.9
    } else if (player.state === 'hit') {
      // Recoil away from the blow, easing back as the stun ends.
      const k = 1 - Math.min(1, player.stateTime / PLAYER.hitStun)
      torsoPitch = -0.42 * k
      torsoYaw = 0.3 * k
      armX = -0.1
    } else if (player.state === 'dead') {
      torsoPitch = 1.45
    } else {
      // Idle/locomotion: lean into movement, breathe when still.
      torsoPitch = a.locomotion * 0.24 + Math.sin(t * 1.8) * 0.03 * (1 - a.locomotion)
      torsoYaw = cycle * 0.1 * a.locomotion
      armX = -0.2 + cycle * armSwing * 0.55
      lean = a.locomotion * 0.1
    }

    /* ---------------------- smooth toward the targets -------------------- */
    // Attacks snap faster than locomotion so hits stay readable and punchy.
    const acting = player.state === 'attack' || player.state === 'skill' || player.state === 'roll'
    const ease = 1 - Math.exp(-(acting ? 34 : 16) * delta)

    a.swingX += (swingX - a.swingX) * ease
    a.swingZ += (swingZ - a.swingZ) * ease
    a.armX += (armX - a.armX) * ease
    a.torsoPitch += (torsoPitch - a.torsoPitch) * ease
    a.lean += (lean - a.lean) * (1 - Math.exp(-10 * delta))
    a.draw += (targetDraw - a.draw) * (1 - Math.exp(-26 * delta))

    // Yaw needs shortest-path interpolation or spins unwind the wrong way.
    let yawDiff = torsoYaw - a.torsoYaw
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2
    a.torsoYaw += yawDiff * ease

    /* ------------------------------- apply ------------------------------- */
    if (weaponPivot.current) {
      weaponPivot.current.rotation.x = a.swingX
      weaponPivot.current.rotation.z = a.swingZ
    }
    if (rightArm.current) rightArm.current.rotation.x = a.armX
    if (leftArm.current) {
      const leftTarget = isRanged ? -1.4 : -0.2 - cycle * armSwing * 0.55
      leftArm.current.rotation.x += (leftTarget - leftArm.current.rotation.x) * ease
    }

    if (leftLeg.current) leftLeg.current.rotation.x = cycle * legAmp
    if (rightLeg.current) rightLeg.current.rotation.x = -cycle * legAmp

    if (torso.current) {
      torso.current.rotation.x = a.torsoPitch + a.lean
      torso.current.rotation.y = a.torsoYaw
      // Vertical bob synced to the stride, scaled by how fast we're going.
      const bob = Math.abs(Math.sin(a.stride)) * 0.055 * a.locomotion
      const crouch = player.sprinting ? 0.05 : 0
      torso.current.position.y += (0.68 - crouch + bob - torso.current.position.y) * (1 - Math.exp(-14 * delta))
    }
    if (head.current) {
      // Head counter-rotates so it stays level as the torso pitches.
      head.current.rotation.x = -a.torsoPitch * 0.5
      head.current.rotation.y = Math.sin(t * 0.7) * 0.05 - a.torsoYaw * 0.3
    }
    if (hips.current) hips.current.rotation.y = cycle * 0.14 * a.locomotion

    if (cape.current) {
      // Cape lifts with speed and flutters.
      const flow = 0.22 + a.locomotion * 0.95 + Math.sin(t * 7) * 0.07 * (0.3 + a.locomotion)
      cape.current.rotation.x += (flow - cape.current.rotation.x) * (1 - Math.exp(-9 * delta))
    }

    if (auraRef.current) {
      const active = player.buffTimer > 0
      auraRef.current.visible = active
      if (active) {
        const pulse = 1 + Math.sin(t * 9) * 0.1
        auraRef.current.scale.setScalar(pulse)
        auraRef.current.rotation.y = t * 2.2
        auraRef.current.material.opacity = 0.32 + Math.sin(t * 7) * 0.12
      }
    }
  })

  const weaponId = player.weapon
  const weapon = WEAPONS[weaponId] ?? WEAPONS.greatsword
  // Trail only during melee swings and melee arts.
  const swinging =
    weapon.kind !== 'ranged' &&
    (player.state === 'attack' ||
      (player.state === 'skill' &&
        ['cone', 'radial'].includes(SKILLS_BY_ID[player.activeSkill]?.kind)))

  // Where the trail samples from, per weapon reach.
  const tipHeight = weaponId === 'hammer' ? 1.45 : weaponId === 'dualblades' ? 1.3 : 2.1
  const baseHeight = weaponId === 'hammer' ? 1.1 : 0.35

  return (
    <group ref={ref}>
      <mesh ref={auraRef} visible={false} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.95, 24]} />
        <meshBasicMaterial color="#ff7a3c" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      <group ref={torso} position={[0, 0.68, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.58, 0.34]} />
          <meshStandardMaterial {...materials.plate} />
        </mesh>
        <mesh position={[0, 0.06, -0.19]} castShadow>
          <boxGeometry args={[0.46, 0.44, 0.06]} />
          <meshStandardMaterial {...materials.light} />
        </mesh>
        <mesh position={[0, 0.16, 0.18]}>
          <boxGeometry args={[0.44, 0.07, 0.03]} />
          <meshStandardMaterial {...materials.trim} />
        </mesh>
        <mesh position={[0, -0.02, 0.18]}>
          <boxGeometry args={[0.3, 0.05, 0.03]} />
          <meshStandardMaterial {...materials.trim} />
        </mesh>

        {/* Layered pauldrons */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.34, 0.22, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.24, 0.16, 0.44]} />
              <meshStandardMaterial {...materials.light} />
            </mesh>
            <mesh position={[side * 0.04, -0.12, 0]} castShadow>
              <boxGeometry args={[0.22, 0.12, 0.4]} />
              <meshStandardMaterial {...materials.plate} />
            </mesh>
            <mesh position={[side * 0.06, 0.1, 0]} rotation={[0, 0, -side * 0.3]} castShadow>
              <coneGeometry args={[0.06, 0.18, 5]} />
              <meshStandardMaterial {...materials.trim} />
            </mesh>
          </group>
        ))}

        <group ref={cape} position={[0, 0.2, -0.2]}>
          <mesh position={[0, -0.42, -0.04]} castShadow>
            <boxGeometry args={[0.46, 0.86, 0.03]} />
            <meshStandardMaterial color={materials.cloth} roughness={0.9} />
          </mesh>
        </group>

        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.09, 0.11, 0.1, 8]} />
          <meshStandardMaterial color={materials.under} />
        </mesh>

        <group ref={head} position={[0, 0.54, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.19, 14, 14]} />
            <meshStandardMaterial color="#e8c9a4" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.045, -0.015]} castShadow>
            <sphereGeometry args={[0.215, 14, 14, 0, Math.PI * 2, 0, Math.PI / 1.75]} />
            <meshStandardMaterial {...materials.plate} />
          </mesh>
          <mesh position={[0, 0.02, 0.17]}>
            <boxGeometry args={[0.26, 0.05, 0.07]} />
            <meshStandardMaterial color="#1b2130" emissive={klass.accent} emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, -0.05, 0.13]} castShadow>
            <boxGeometry args={[0.22, 0.1, 0.12]} />
            <meshStandardMaterial {...materials.light} />
          </mesh>
          <mesh position={[0, 0.2, -0.02]} rotation={[0.1, 0, 0]} castShadow>
            <boxGeometry args={[0.035, 0.18, 0.3]} />
            <meshStandardMaterial {...materials.trim} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.19, 0.06, -0.02]} rotation={[0, 0, -side * 0.9]} castShadow>
              <coneGeometry args={[0.035, 0.2, 5]} />
              <meshStandardMaterial color="#f0e2c4" />
            </mesh>
          ))}
        </group>

        {/* Off-hand */}
        <group ref={leftArm} position={[-0.3, 0.16, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.072, 0.22, 4, 8]} />
            <meshStandardMaterial color={materials.under} />
          </mesh>
          <mesh position={[0, -0.34, 0]} castShadow>
            <boxGeometry args={[0.15, 0.16, 0.15]} />
            <meshStandardMaterial {...materials.light} />
          </mesh>
          <mesh position={[0, -0.46, 0.02]} castShadow>
            <boxGeometry args={[0.12, 0.12, 0.14]} />
            <meshStandardMaterial color="#c9a06a" />
          </mesh>
          {weaponId === 'dualblades' && (
            <group position={[0, -0.5, 0.06]} rotation={[-0.3, 0, 0]} scale={0.92}>
              <DualBlade mirrored />
            </group>
          )}
          {player.activeSkill === 'potion' && (
            <group position={[0, -0.52, 0.06]}>
              <mesh castShadow>
                <sphereGeometry args={[0.08, 10, 10]} />
                <meshStandardMaterial color="#6ee7a8" emissive="#2fae72" emissiveIntensity={0.8} />
              </mesh>
              <mesh position={[0, 0.09, 0]}>
                <cylinderGeometry args={[0.028, 0.028, 0.08, 6]} />
                <meshStandardMaterial color="#d8cfa8" />
              </mesh>
            </group>
          )}
        </group>

        {/* Weapon arm */}
        <group ref={rightArm} position={[0.3, 0.16, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.072, 0.22, 4, 8]} />
            <meshStandardMaterial color={materials.under} />
          </mesh>
          <mesh position={[0, -0.34, 0]} castShadow>
            <boxGeometry args={[0.15, 0.16, 0.15]} />
            <meshStandardMaterial {...materials.light} />
          </mesh>
          <mesh position={[0, -0.46, 0.02]} castShadow>
            <boxGeometry args={[0.12, 0.12, 0.14]} />
            <meshStandardMaterial color="#c9a06a" />
          </mesh>

          <group ref={weaponPivot} position={[0.02, -0.5, 0.06]}>
            {weaponId === 'greatsword' && <GreatSword />}
            {weaponId === 'dualblades' && <DualBlade />}
            {weaponId === 'hammer' && <Hammer />}
            {weaponId === 'bow' && <Bow draw={anim.current.draw} />}

            {/* Invisible anchors the trail samples each frame */}
            <object3D ref={trailBase} position={[0, baseHeight, 0]} />
            <object3D ref={trailTip} position={[0, tipHeight, 0]} />
          </group>
        </group>
      </group>

      <group ref={hips} position={[0, 0.42, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.42, 0.18, 0.3]} />
          <meshStandardMaterial {...materials.plate} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.18, -0.12, 0.02]} rotation={[0, 0, side * 0.18]} castShadow>
            <boxGeometry args={[0.18, 0.26, 0.26]} />
            <meshStandardMaterial {...materials.light} />
          </mesh>
        ))}
      </group>

      {[
        { ref: leftLeg, side: -1 },
        { ref: rightLeg, side: 1 },
      ].map(({ ref: legRef, side }) => (
        <group key={side} ref={legRef} position={[side * 0.13, 0.4, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.088, 0.2, 4, 8]} />
            <meshStandardMaterial color={materials.under} />
          </mesh>
          <mesh position={[0, -0.3, 0.01]} castShadow>
            <boxGeometry args={[0.17, 0.18, 0.19]} />
            <meshStandardMaterial {...materials.plate} />
          </mesh>
          <mesh position={[0, -0.42, 0.04]} castShadow>
            <boxGeometry args={[0.18, 0.12, 0.28]} />
            <meshStandardMaterial color="#5a3f2a" />
          </mesh>
        </group>
      ))}

      {showTrail && (
        <WeaponTrail baseRef={trailBase} tipRef={trailTip} active={swinging} color={klass.accent} />
      )}
    </group>
  )
})

export default Hunter
