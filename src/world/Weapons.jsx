// Weapon meshes held in the hunter's hand. Each is modelled around the grip
// at local origin so the hand group can swing it directly.
import { Component, Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'

const STEEL = { color: '#d2dcec', metalness: 0.85, roughness: 0.22 }
const DARK_STEEL = { color: '#8e9aae', metalness: 0.8, roughness: 0.3 }
const GOLD = { color: '#e0b842', metalness: 0.7, roughness: 0.32 }
const LEATHER = '#5a3f2a'
const WOOD = '#8a6038'

// Sketchfab GLB — "MHW Greatsword - Wyvern Ignition" by Vaxeon, CC Attribution.
// Served from /public so it's fetched at this URL with no bundler processing.
const GREATSWORD_GLB_URL = '/models/greatsword.glb'

/**
 * Loads the downloaded glTF greatsword and grips it the same way the
 * procedural one was gripped: blade running up local +Y from the fist.
 *
 * Sketchfab exports rarely come pre-scaled/pre-pivoted for a specific rig, so
 * this wraps the scene in an adjustable group. If the blade renders too big,
 * too small, sideways, or floating off-hand once you can see it, these are
 * the three numbers to tune:
 *   - `scale`     uniform size — MHW props commonly import around real-world
 *                 metres, so a game-hand-sized blade is often scale 0.01–0.05.
 *   - `rotation`  fixes which local axis the blade points along; glTF often
 *                 stores the mesh lying along Z or X rather than Y.
 *   - `position`  shifts the pivot so the grip (not the blade's centre) sits
 *                 at the hand's origin.
 * Start it running, then adjust these three props from Hunter.jsx and refresh
 * to dial it in — no need to touch the loader itself.
 */
function GreatswordModel({
  scale = 0.19,
  position = [0, 0, 0],
  rotation = [-Math.PI / 2, 0, 0],
}) {
  const { scene } = useGLTF(GREATSWORD_GLB_URL)

  // useGLTF caches and returns the SAME scene object to every caller, so if
  // this component ever mounts twice (e.g. a remote hunter also carrying a
  // greatsword) both would fight over one Object3D and only one place would
  // actually show it. Cloning per-instance is cheap and avoids that entirely.
  //
  // The clone is also re-centred on its own grip point HERE, in local space,
  // before any scale/rotation is applied outside — measuring and centring
  // pre-transform (rather than trying to correct with an outer `position`
  // after rotation) is what keeps this stable regardless of what rotation
  // gets picked, since rotating an off-centre mesh swings its offset around
  // with it and any outer position correction has to change to match.
  const clone = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene)
    const box = new THREE.Box3().setFromObject(cloned)
    const center = box.getCenter(new THREE.Vector3())
    // Shift the mesh so the blade's bounding-box centre sits at local origin.
    cloned.position.sub(center)
    // Wrap in a group so callers' position/rotation/scale apply on top of
    // this internal centring without fighting over the same transform.
    const wrapper = new THREE.Group()
    wrapper.add(cloned)
    return wrapper
  }, [scene])

  return <primitive object={clone} scale={scale} position={position} rotation={rotation} />
}

// Preload so the first time a Vanguard/Blademaster draws it, the model is
// already warm instead of popping in a frame late.
useGLTF.preload(GREATSWORD_GLB_URL)

export function GreatSword({ useModel = true }) {
  if (useModel) {
    return (
      <GltfErrorBoundary fallback={<ProceduralGreatSword />}>
        <Suspense fallback={<ProceduralGreatSword />}>
          {/*
            Measured from the raw GLB: native bounding-box size ≈
            [1.5, 4.27, 12.7], i.e. the blade's long axis is Z, not Y, and
            it's ~12.7 units long. GreatswordModel re-centres the mesh on its
            own bounding-box centre BEFORE this rotation/scale is applied, so
            these numbers only need to handle orientation + size, not also
            correct for an off-centre pivot.

            - rotation: −90° around X takes a shape lying along +Z and stands
              it up along +Y instead (matches how the hand pivot swings things).
            - scale: our procedural blade is ~2.4 units tall in-hand; the raw
              model is 12.7 units long, so 2.4 / 12.7 ≈ 0.19 lands it at the
              same visual size.
            - position: GreatswordModel centres the mesh on the whole blade's
              midpoint, but our hand pivot expects the GRIP (like the
              procedural sword, whose blade runs from y≈0 up to y≈2.4). Shift
              up by roughly half the scaled height (12.714 * 0.19 / 2 ≈ 1.2)
              so the grip — not the blade's middle — sits at the hand.
          */}
          <GreatswordModel scale={0.19} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.2, 0]} />
        </Suspense>
      </GltfErrorBoundary>
    )
  }
  return <ProceduralGreatSword />
}

/**
 * Suspense only catches the loading state, not a thrown parse/runtime error —
 * those need a real error boundary or they vanish into a red screen (dev) or
 * just an empty node (prod) without telling you why. This surfaces it loudly
 * in the console so a bad GLB fails obviously instead of silently.
 */
class GltfErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('[Greatsword GLB] failed to load/parse, falling back to procedural sword:', error)
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

/** Original hand-built greatsword, kept as the Suspense fallback and as an
 * easy way to compare/revert if the glTF doesn't read well in-game. */
function ProceduralGreatSword() {
  return (
    <group>
      {/* Grip + pommel */}
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.42, 8]} />
        <meshStandardMaterial color={LEATHER} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.24, 0]} castShadow>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>

      {/* Cross guard with swept tips */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[0.46, 0.08, 0.13]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[-0.26, 0.28, 0]} rotation={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[0.14, 0.06, 0.1]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[0.26, 0.28, 0]} rotation={[0, 0, -0.5]} castShadow>
        <boxGeometry args={[0.14, 0.06, 0.1]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>

      {/* Blade: tapered body, fuller groove, then the point */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[0.34, 1.7, 0.06]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[0, 1.12, 0.035]}>
        <boxGeometry args={[0.09, 1.55, 0.012]} />
        <meshStandardMaterial {...DARK_STEEL} />
      </mesh>
      <mesh position={[0, 1.12, -0.035]}>
        <boxGeometry args={[0.09, 1.55, 0.012]} />
        <meshStandardMaterial {...DARK_STEEL} />
      </mesh>
      <mesh position={[0, 2.16, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.2, 0.44, 4]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
    </group>
  )
}

export function DualBlade({ mirrored = false }) {
  const side = mirrored ? -1 : 1
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.036, 0.3, 8]} />
        <meshStandardMaterial color={LEATHER} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow>
        <boxGeometry args={[0.22, 0.05, 0.1]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      {/* Curved blade approximated with two angled segments */}
      <mesh position={[0.03 * side, 0.6, 0]} rotation={[0, 0, -0.1 * side]} castShadow>
        <boxGeometry args={[0.14, 0.8, 0.035]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[0.12 * side, 1.08, 0]} rotation={[0, 0, -0.42 * side]} castShadow>
        <boxGeometry args={[0.12, 0.42, 0.032]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[0.21 * side, 1.29, 0]} rotation={[0, 0, -0.42 * side]} castShadow>
        <coneGeometry args={[0.07, 0.2, 4]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
    </group>
  )
}

export function Hammer() {
  return (
    <group>
      {/* Long wooden shaft */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 1.5, 8]} />
        <meshStandardMaterial color={WOOD} roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.2, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.16, 8]} />
        <meshStandardMaterial color={LEATHER} roughness={0.9} />
      </mesh>

      {/* Head: big drum with banded ends and spikes */}
      <mesh position={[0, 1.42, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.62, 12]} />
        <meshStandardMaterial {...DARK_STEEL} />
      </mesh>
      <mesh position={[0, 1.42, 0.32]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.35, 0.08, 12]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[0, 1.42, -0.32]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.35, 0.08, 12]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <coneGeometry args={[0.1, 0.28, 5]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
    </group>
  )
}

export function Bow({ draw = 0 }) {
  // `draw` (0..1) pulls the string back and flexes the limbs.
  const flex = draw * 0.22
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {/* Grip */}
      <mesh castShadow>
        <boxGeometry args={[0.09, 0.34, 0.09]} />
        <meshStandardMaterial color={LEATHER} roughness={0.85} />
      </mesh>

      {/* Upper and lower limbs, angled outward */}
      <mesh position={[-0.06 - flex * 0.3, 0.48, 0]} rotation={[0, 0, 0.3 + flex]} castShadow>
        <boxGeometry args={[0.055, 0.72, 0.075]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      <mesh position={[-0.06 - flex * 0.3, -0.48, 0]} rotation={[0, 0, -0.3 - flex]} castShadow>
        <boxGeometry args={[0.055, 0.72, 0.075]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {/* Limb tips */}
      <mesh position={[-0.2 - flex * 0.5, 0.82, 0]} rotation={[0, 0, 0.55 + flex]} castShadow>
        <boxGeometry args={[0.045, 0.28, 0.06]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[-0.2 - flex * 0.5, -0.82, 0]} rotation={[0, 0, -0.55 - flex]} castShadow>
        <boxGeometry args={[0.045, 0.28, 0.06]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>

      {/* Bowstring — two segments meeting at the nock point */}
      <mesh position={[-0.13 + draw * 0.17, 0.46, 0]} rotation={[0, 0, -0.1 - draw * 0.22]}>
        <cylinderGeometry args={[0.008, 0.008, 0.95, 4]} />
        <meshStandardMaterial color="#efe6d2" />
      </mesh>
      <mesh position={[-0.13 + draw * 0.17, -0.46, 0]} rotation={[0, 0, 0.1 + draw * 0.22]}>
        <cylinderGeometry args={[0.008, 0.008, 0.95, 4]} />
        <meshStandardMaterial color="#efe6d2" />
      </mesh>

      {/* Nocked arrow appears while drawing */}
      {draw > 0.15 && (
        <group position={[0.12 - draw * 0.34, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.92, 6]} />
            <meshStandardMaterial color="#c8a86a" />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <coneGeometry args={[0.04, 0.14, 6]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          <mesh position={[0, -0.42, 0]} rotation={[0, 0, 0.4]}>
            <boxGeometry args={[0.1, 0.16, 0.006]} />
            <meshStandardMaterial color="#d95f4a" />
          </mesh>
        </group>
      )}
    </group>
  )
}
