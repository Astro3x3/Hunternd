import { Component, Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'

// Sketchfab GLB — "Wyvern animated" by charliecatling, Sketchfab Standard
// licence (personal/non-commercial use — see model credit in-app if this
// ships publicly). Served from /public so it's fetched at this URL with no
// bundler processing.
const WYVERN_GLB_URL = '/models/wyvern_animated.glb'

// Clip names baked into the file (Blender rig export), keyed to the states
// our monster AI actually produces so the visual reads correctly:
//   idol   — idle/patrol/recover/stagger/winded
//   walk   — chase (ground pursuit)
//   flaping/flying — alert/breathWindup/breath (rearing + wing beats)
const WYVERN_CLIPS = {
  idol: 'metarig|idol',
  walk: 'metarig|walk',
  flap: 'metarig|flaping',
  fly: 'metarig|flying',
  takeOff: 'metarig|take off',
}

function clipForState(state) {
  switch (state) {
    case 'chase':
    case 'attack':
    case 'windup':
      return WYVERN_CLIPS.walk
    case 'alert':
    case 'breathWindup':
    case 'breath':
      return WYVERN_CLIPS.flap
    default:
      return WYVERN_CLIPS.idol
  }
}

// Sketchfab GLB — "Godzilla 2024" by savounited, licensed CC-BY-4.0
// (https://creativecommons.org/licenses/by/4.0/) — attribution required if
// this ships publicly: credit "savounited" and link the CC-BY-4.0 licence.
// Served the same way as the wyvern — static asset, no bundler processing.
// The file ships with no animation clips, so GodzillaModel picks whatever
// clip names it can find generically (see pickGodzillaClip below) and falls
// back to a static pose if there are none at all.
const GODZILLA_GLB_URL = '/models/godzilla_2024.glb'

/* ------------------------------ shared parts ----------------------------- */

// A row of spikes running along the spine, tapering toward the tail.
function SpineRow({ count, from, to, baseSize, color, taper = 0.45 }) {
  const spikes = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const k = i / (count - 1)
      return {
        z: from + (to - from) * k,
        y: 0.1 + Math.sin(k * Math.PI) * 0.12,
        size: baseSize * (1 - k * taper) * (0.6 + Math.sin(k * Math.PI) * 0.7),
      }
    })
  }, [count, from, to, baseSize, taper])

  return (
    <group>
      {spikes.map((spike, i) => (
        <mesh key={i} position={[0, spike.y, spike.z]} rotation={[-0.25, 0, 0]} castShadow>
          <coneGeometry args={[spike.size * 0.45, spike.size * 2.1, 5]} />
          <meshStandardMaterial color={color} flatShading roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

// Overlapping belly scutes.
function Scutes({ count, from, to, width, color }) {
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const k = i / (count - 1)
        const z = from + (to - from) * k
        const w = width * (0.7 + Math.sin(k * Math.PI) * 0.4)
        return (
          <mesh key={i} position={[0, 0, z]} castShadow>
            <boxGeometry args={[w, 0.06, (Math.abs(to - from) / count) * 0.85]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        )
      })}
    </group>
  )
}

// Three curved claws on a foot.
function Claws({ color, size = 1 }) {
  return (
    <group>
      {[-1, 0, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.09 * size, -0.02, 0.16 * size]}
          rotation={[1.25, side * 0.3, 0]}
          castShadow
        >
          <coneGeometry args={[0.035 * size, 0.17 * size, 5]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

// Upper/lower jaw with teeth. `openRef` drives the hinge each frame.
function Jaw({ palette, size = 1, lowerRef }) {
  const toothRow = (count, width, z, flip) =>
    Array.from({ length: count }, (_, i) => {
      const k = count === 1 ? 0.5 : i / (count - 1)
      return (
        <mesh
          key={i}
          position={[(k - 0.5) * width, flip ? 0.04 : -0.04, z]}
          rotation={[0, 0, 0]}
          castShadow
        >
          <coneGeometry args={[0.022 * size, 0.1 * size, 4]} />
          <meshStandardMaterial color={palette.claw} />
        </mesh>
      )
    })

  return (
    <group>
      {/* Upper jaw */}
      <mesh position={[0, 0.07 * size, 0.2 * size]} castShadow>
        <boxGeometry args={[0.44 * size, 0.24 * size, 0.6 * size]} />
        <meshStandardMaterial color={palette.body} flatShading roughness={0.65} />
      </mesh>
      <group position={[0, -0.03 * size, 0.28 * size]} rotation={[Math.PI, 0, 0]}>
        {toothRow(5, 0.3 * size, 0, false)}
      </group>

      {/* Lower jaw hinges open */}
      <group ref={lowerRef} position={[0, -0.02 * size, 0.02 * size]}>
        <mesh position={[0, -0.09 * size, 0.2 * size]} castShadow>
          <boxGeometry args={[0.38 * size, 0.16 * size, 0.56 * size]} />
          <meshStandardMaterial color={palette.belly} flatShading roughness={0.7} />
        </mesh>
        <group position={[0, -0.01 * size, 0.26 * size]}>{toothRow(5, 0.26 * size, 0, true)}</group>
      </group>
    </group>
  )
}

/* ------------------------------- variants -------------------------------- */

function QuadrupedBody({ palette, refs }) {
  return (
    <group ref={refs.body}>
      {/* Segmented torso */}
      <mesh ref={refs.chest} position={[0, 0, 0.3]} castShadow>
        <sphereGeometry args={[0.7, 14, 12]} />
        <meshStandardMaterial color={palette.body} flatShading roughness={0.65} />
      </mesh>
      <mesh position={[0, -0.04, -0.5]} castShadow>
        <sphereGeometry args={[0.6, 14, 12]} />
        <meshStandardMaterial color={palette.body} flatShading roughness={0.65} />
      </mesh>
      <mesh position={[0, -0.26, -0.05]} scale={[0.9, 0.55, 1.5]} castShadow>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color={palette.belly} roughness={0.75} />
      </mesh>

      <group position={[0, 0.5, 0]}>
        <SpineRow count={9} from={0.7} to={-1.0} baseSize={0.17} color={palette.plate} />
      </group>
      <group position={[0, -0.5, 0]}>
        <Scutes count={7} from={0.6} to={-0.8} width={0.5} color={palette.belly} />
      </group>

      {/* Neck into head */}
      <group ref={refs.neck} position={[0, 0.2, 0.82]}>
        <mesh rotation={[0.5, 0, 0]} castShadow>
          <capsuleGeometry args={[0.26, 0.32, 5, 10]} />
          <meshStandardMaterial color={palette.body} flatShading roughness={0.65} />
        </mesh>

        <group ref={refs.head} position={[0, 0.12, 0.42]}>
          <mesh castShadow>
            <boxGeometry args={[0.5, 0.42, 0.5]} />
            <meshStandardMaterial color={palette.body} flatShading roughness={0.65} />
          </mesh>
          {/* Brow ridges */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.17, 0.2, 0.1]} rotation={[0, 0, side * 0.2]} castShadow>
              <boxGeometry args={[0.14, 0.07, 0.3]} />
              <meshStandardMaterial color={palette.plate} flatShading />
            </mesh>
          ))}
          {/* Small horns */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.17, 0.3, -0.05]} rotation={[-0.4, 0, side * 0.35]} castShadow>
              <coneGeometry args={[0.05, 0.26, 5]} />
              <meshStandardMaterial color={palette.claw} />
            </mesh>
          ))}
          {/* Eyes with glow */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.19, 0.1, 0.2]}>
              <sphereGeometry args={[0.065, 10, 10]} />
              <meshStandardMaterial
                color={palette.eye}
                emissive={palette.eye}
                emissiveIntensity={1.4}
                toneMapped={false}
              />
            </mesh>
          ))}
          <group position={[0, -0.06, 0.2]}>
            <Jaw palette={palette} size={1} lowerRef={refs.lowerJaw} />
          </group>
        </group>
      </group>

      {/* Tail: three tapering segments */}
      <group ref={refs.tail} position={[0, 0.06, -1.0]}>
        <mesh position={[0, -0.02, -0.32]} rotation={[0.2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.22, 0.4, 4, 8]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
        <group ref={refs.tail2} position={[0, -0.06, -0.72]}>
          <mesh position={[0, 0, -0.3]} rotation={[0.28, 0, 0]} castShadow>
            <capsuleGeometry args={[0.15, 0.4, 4, 8]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          <mesh position={[0, -0.06, -0.62]} rotation={[0.3, 0, 0]} castShadow>
            <coneGeometry args={[0.12, 0.34, 6]} />
            <meshStandardMaterial color={palette.plate} />
          </mesh>
        </group>
      </group>

      {/* Four legs with joints + claws */}
      {[
        [-0.52, 0.62, 0],
        [0.52, 0.62, 1],
        [-0.5, -0.6, 2],
        [0.5, -0.6, 3],
      ].map(([x, z, index]) => (
        <group key={index} ref={refs.legs[index]} position={[x, -0.34, z]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.16, 0.22, 4, 8]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
          <mesh position={[0, -0.42, 0.02]} castShadow>
            <capsuleGeometry args={[0.12, 0.24, 4, 8]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          <mesh position={[0, -0.6, 0.06]} castShadow>
            <boxGeometry args={[0.24, 0.1, 0.3]} />
            <meshStandardMaterial color={palette.accent} />
          </mesh>
          <group position={[0, -0.62, 0.12]}>
            <Claws color={palette.claw} />
          </group>
        </group>
      ))}
    </group>
  )
}

function BipedBody({ palette, refs }) {
  return (
    <group ref={refs.body}>
      <mesh ref={refs.chest} rotation={[0.42, 0, 0]} castShadow>
        <capsuleGeometry args={[0.52, 0.8, 6, 12]} />
        <meshStandardMaterial color={palette.body} flatShading roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.1, 0.18]} rotation={[0.42, 0, 0]} scale={[0.85, 1, 0.7]} castShadow>
        <capsuleGeometry args={[0.44, 0.6, 5, 10]} />
        <meshStandardMaterial color={palette.belly} roughness={0.75} />
      </mesh>

      <group position={[0, 0.34, -0.1]} rotation={[0.3, 0, 0]}>
        <SpineRow count={8} from={0.45} to={-0.85} baseSize={0.15} color={palette.plate} />
      </group>

      {/* Feathered crest shapes along the back */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.3, 0.42, -0.1]}
          rotation={[0.4, side * 0.3, side * 0.5]}
          castShadow
        >
          <boxGeometry args={[0.04, 0.42, 0.24]} />
          <meshStandardMaterial color={palette.accent} flatShading />
        </mesh>
      ))}

      {/* Neck + head, carried forward */}
      <group ref={refs.neck} position={[0, 0.62, 0.42]}>
        <mesh rotation={[0.7, 0, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.34, 5, 10]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>

        <group ref={refs.head} position={[0, 0.06, 0.42]}>
          <mesh castShadow>
            <boxGeometry args={[0.36, 0.34, 0.44]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
          {/* Swept crest */}
          <mesh position={[0, 0.24, -0.1]} rotation={[-0.5, 0, 0]} castShadow>
            <coneGeometry args={[0.1, 0.46, 5]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.15, 0.08, 0.16]}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial
                color={palette.eye}
                emissive={palette.eye}
                emissiveIntensity={1.6}
                toneMapped={false}
              />
            </mesh>
          ))}
          <group position={[0, -0.05, 0.16]}>
            <Jaw palette={palette} size={0.9} lowerRef={refs.lowerJaw} />
          </group>
        </group>
      </group>

      {/* Clawed forelimbs */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.44, 0.24, 0.24]} rotation={[0.6, 0, side * 0.35]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.26, 4, 8]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
          <mesh position={[0, -0.36, 0.04]} castShadow>
            <capsuleGeometry args={[0.07, 0.2, 4, 8]} />
            <meshStandardMaterial color={palette.accent} />
          </mesh>
          <group position={[0, -0.5, 0.06]} scale={0.85}>
            <Claws color={palette.claw} />
          </group>
        </group>
      ))}

      {/* Long counterbalance tail */}
      <group ref={refs.tail} position={[0, 0.16, -0.62]}>
        <mesh position={[0, -0.06, -0.42]} rotation={[-0.35, 0, 0]} castShadow>
          <capsuleGeometry args={[0.17, 0.6, 4, 8]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
        <group ref={refs.tail2} position={[0, -0.14, -0.95]}>
          <mesh position={[0, 0, -0.4]} rotation={[-0.2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.6, 4, 8]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          <mesh position={[0, 0.04, -0.82]} rotation={[-0.2, 0, 0]} castShadow>
            <coneGeometry args={[0.09, 0.3, 5]} />
            <meshStandardMaterial color={palette.claw} />
          </mesh>
        </group>
      </group>

      {/* Digitigrade legs */}
      {[-1, 1].map((side, index) => (
        <group key={side} ref={refs.legs[index]} position={[side * 0.3, -0.16, 0.04]}>
          <mesh position={[0, -0.2, -0.04]} rotation={[-0.3, 0, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.3, 4, 8]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
          <mesh position={[0, -0.52, 0.06]} rotation={[0.45, 0, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.32, 4, 8]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          <mesh position={[0, -0.76, 0.16]} castShadow>
            <boxGeometry args={[0.24, 0.1, 0.36]} />
            <meshStandardMaterial color={palette.accent} />
          </mesh>
          <group position={[0, -0.78, 0.26]}>
            <Claws color={palette.claw} size={1.15} />
          </group>
        </group>
      ))}
    </group>
  )
}

function DrakeBody({ palette, refs }) {
  const membrane = palette.membrane ?? palette.accent

  // One wing, built from an upper arm, forearm, finger struts and membranes.
  const wing = (side) => (
    <group ref={refs.wings[side > 0 ? 1 : 0]} position={[side * 0.78, 0.5, -0.05]}>
      {/* Upper arm */}
      <mesh position={[side * 0.4, 0.16, 0]} rotation={[0, 0, -side * 0.5]} castShadow>
        <capsuleGeometry args={[0.11, 0.66, 4, 8]} />
        <meshStandardMaterial color={palette.body} flatShading />
      </mesh>
      {/* Forearm sweeping back */}
      <group position={[side * 0.78, 0.44, 0]}>
        <mesh position={[side * 0.42, -0.08, -0.16]} rotation={[0.3, side * 0.3, -side * 1.15]} castShadow>
          <capsuleGeometry args={[0.085, 0.72, 4, 8]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
        {/* Finger struts */}
        {[0, 1, 2].map((finger) => (
          <mesh
            key={finger}
            position={[side * (0.85 + finger * 0.1), -0.34 - finger * 0.2, -0.5 - finger * 0.32]}
            rotation={[0.5 + finger * 0.18, side * 0.2, -side * (1.0 - finger * 0.12)]}
            castShadow
          >
            <capsuleGeometry args={[0.045, 0.85 - finger * 0.1, 4, 6]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
        ))}
        {/* Membrane panels between the struts */}
        {[0, 1, 2].map((panel) => (
          <mesh
            key={panel}
            position={[side * (0.55 + panel * 0.12), -0.3 - panel * 0.22, -0.34 - panel * 0.34]}
            rotation={[0.42 + panel * 0.16, side * (0.5 - panel * 0.1), -side * 0.5]}
            castShadow
          >
            <boxGeometry args={[1.0 - panel * 0.08, 0.02, 0.72 - panel * 0.06]} />
            <meshStandardMaterial
              color={membrane}
              roughness={0.85}
              transparent
              opacity={0.93}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </group>
  )

  return (
    <group ref={refs.body}>
      {/* Heavy segmented torso */}
      <mesh ref={refs.chest} position={[0, 0, 0.45]} castShadow>
        <sphereGeometry args={[0.92, 16, 14]} />
        <meshStandardMaterial color={palette.body} flatShading roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.06, -0.62]} castShadow>
        <sphereGeometry args={[0.8, 16, 14]} />
        <meshStandardMaterial color={palette.body} flatShading roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.36, -0.05]} scale={[0.95, 0.6, 1.7]} castShadow>
        <sphereGeometry args={[0.66, 14, 12]} />
        <meshStandardMaterial color={palette.belly} roughness={0.75} />
      </mesh>

      {/* Shoulder + hip armour plates */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.62, 0.4, 0.5]} rotation={[0, 0, -side * 0.5]} castShadow>
          <boxGeometry args={[0.4, 0.2, 0.62]} />
          <meshStandardMaterial color={palette.plate} flatShading />
        </mesh>
      ))}

      <group position={[0, 0.72, 0]}>
        <SpineRow count={11} from={1.0} to={-1.3} baseSize={0.26} color={palette.plate} taper={0.35} />
      </group>
      <group position={[0, -0.72, 0]}>
        <Scutes count={9} from={0.9} to={-1.0} width={0.72} color={palette.belly} />
      </group>

      {wing(-1)}
      {wing(1)}

      {/* Thick neck, three segments up to the head */}
      <group ref={refs.neck} position={[0, 0.34, 1.0]}>
        <mesh rotation={[0.45, 0, 0]} castShadow>
          <capsuleGeometry args={[0.36, 0.42, 6, 12]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
        <mesh position={[0, 0.26, 0.42]} rotation={[0.35, 0, 0]} castShadow>
          <capsuleGeometry args={[0.3, 0.34, 6, 12]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
        {/* Neck plates */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.16 + i * 0.16, 0.12 + i * 0.22]} rotation={[-0.2, 0, 0]} castShadow>
            <coneGeometry args={[0.13 - i * 0.02, 0.3, 5]} />
            <meshStandardMaterial color={palette.plate} flatShading />
          </mesh>
        ))}

        <group ref={refs.head} position={[0, 0.5, 0.78]}>
          {/* Skull */}
          <mesh castShadow>
            <boxGeometry args={[0.62, 0.5, 0.66]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
          {/* Brow / cheek ridges */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.22, 0.24, 0.06]} rotation={[0, 0, side * 0.22]} castShadow>
              <boxGeometry args={[0.18, 0.1, 0.42]} />
              <meshStandardMaterial color={palette.plate} flatShading />
            </mesh>
          ))}
          {/* Swept horns */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.24, 0.3, -0.12]} rotation={[-0.55, side * 0.25, side * 0.42]}>
              <mesh castShadow>
                <coneGeometry args={[0.09, 0.62, 6]} />
                <meshStandardMaterial color={palette.claw} roughness={0.5} />
              </mesh>
            </group>
          ))}
          {/* Smaller cheek spikes */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.3, -0.06, -0.02]} rotation={[0, 0, side * 1.3]} castShadow>
              <coneGeometry args={[0.055, 0.28, 5]} />
              <meshStandardMaterial color={palette.claw} />
            </mesh>
          ))}
          {/* Glowing eyes */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.24, 0.11, 0.28]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshStandardMaterial
                color={palette.eye}
                emissive={palette.eye}
                emissiveIntensity={2.2}
                toneMapped={false}
              />
            </mesh>
          ))}
          {/* Nostrils */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.1, 0.02, 0.5]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshStandardMaterial color="#2b1410" />
            </mesh>
          ))}
          {/* Throat glow while charging fire */}
          <mesh ref={refs.throat} position={[0, -0.12, 0.3]} visible={false}>
            <sphereGeometry args={[0.16, 12, 12]} />
            <meshBasicMaterial color="#ff8a2b" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <group position={[0, -0.08, 0.3]}>
            <Jaw palette={palette} size={1.3} lowerRef={refs.lowerJaw} />
          </group>
        </group>
      </group>

      {/* Long tail with club */}
      <group ref={refs.tail} position={[0, 0.1, -1.3]}>
        <mesh position={[0, -0.04, -0.46]} rotation={[0.18, 0, 0]} castShadow>
          <capsuleGeometry args={[0.32, 0.6, 5, 10]} />
          <meshStandardMaterial color={palette.body} flatShading />
        </mesh>
        <group ref={refs.tail2} position={[0, -0.12, -1.0]}>
          <mesh position={[0, 0, -0.46]} rotation={[0.22, 0, 0]} castShadow>
            <capsuleGeometry args={[0.22, 0.62, 5, 10]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          <group ref={refs.tail3} position={[0, -0.08, -1.0]}>
            <mesh position={[0, 0, -0.3]} castShadow>
              <sphereGeometry args={[0.28, 12, 12]} />
              <meshStandardMaterial color={palette.plate} flatShading />
            </mesh>
            {/* Club spikes */}
            {[0, 1, 2, 3, 4].map((i) => {
              const angle = (i / 5) * Math.PI * 2
              return (
                <mesh
                  key={i}
                  position={[Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, -0.3]}
                  rotation={[0, 0, angle - Math.PI / 2]}
                  castShadow
                >
                  <coneGeometry args={[0.07, 0.3, 5]} />
                  <meshStandardMaterial color={palette.claw} />
                </mesh>
              )
            })}
          </group>
        </group>
      </group>

      {/* Four powerful legs */}
      {[
        [-0.72, 0.85, 0],
        [0.72, 0.85, 1],
        [-0.68, -0.85, 2],
        [0.68, -0.85, 3],
      ].map(([x, z, index]) => (
        <group key={index} ref={refs.legs[index]} position={[x, -0.5, z]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.24, 0.32, 5, 10]} />
            <meshStandardMaterial color={palette.body} flatShading />
          </mesh>
          <mesh position={[0, -0.58, 0.04]} castShadow>
            <capsuleGeometry args={[0.17, 0.34, 4, 8]} />
            <meshStandardMaterial color={palette.accent} flatShading />
          </mesh>
          <mesh position={[0, -0.84, 0.1]} castShadow>
            <boxGeometry args={[0.36, 0.14, 0.46]} />
            <meshStandardMaterial color={palette.accent} />
          </mesh>
          <group position={[0, -0.86, 0.2]} scale={1.5}>
            <Claws color={palette.claw} />
          </group>
        </group>
      ))}
    </group>
  )
}

/**
 * Suspense only catches the loading state, not a thrown parse/runtime error —
 * this surfaces a bad GLB loudly in the console and falls back to the
 * procedural drake instead of a blank monster.
 */
class GltfErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('[Wyvern GLB] failed to load/parse, falling back to procedural drake:', error)
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

// Hoisted so the hit-flash tint doesn't allocate a new THREE.Color for every
// material, on every monster, every frame — this runs per-monster per-frame
// during any fight with multiple aggroed monsters, so it adds up fast.
const HIT_FLASH_COLOR = new THREE.Color('#ff6a52')

/**
 * Shared hit-flash (on taking damage) + death-fade tint, driven off whatever
 * materials a model variant has collected into `materials.current`. Used by
 * both the procedural bodies and the GLB wyvern so the two read consistently.
 */
function useHitFlashAndFade(runtime, materials, baseColors) {
  // `baseScale` is whatever scale the caller's root group is actually using
  // (def.scale for the procedural/wyvern bodies, but an auto-fit value for
  // Godzilla) — shrinking on death must ease from THAT, not a hardcoded
  // def.scale, or it'd snap to the wrong size the instant a monster dies.
  return (rootObject, baseScale) => {
    const flash = runtime.hitFlash
    const fade = runtime.dead ? Math.min(runtime.deadTimer / 3.2, 1) : 0
    materials.current.forEach((material) => {
      if (!material.color) return
      if (!baseColors.has(material)) baseColors.set(material, material.color.clone())
      const base = baseColors.get(material)
      if (flash > 0) {
        material.color.copy(base).lerp(HIT_FLASH_COLOR, Math.min(1, flash * 5))
      } else if (!material.color.equals(base)) {
        material.color.lerp(base, 0.22)
      }
      if (fade > 0) {
        material.transparent = true
        material.opacity = 1 - fade
      }
    })

    if (runtime.dead && rootObject) {
      rootObject.scale.setScalar(baseScale * (1 - fade * 0.28))
    }
  }
}

/**
 * GLB-driven replacement for the procedural drake body. Rigged + animated
 * (idle/walk/flap/fly/take off clips), so unlike the procedural variants it
 * drives its own skeleton via drei's useAnimations rather than the manual
 * leg/tail/wing refs used elsewhere in this file.
 */
function WyvernModel({ runtime }) {
  const { def } = runtime
  const { scene, animations } = useGLTF(WYVERN_GLB_URL)

  // useGLTF caches and returns the SAME scene/skeleton to every caller, so
  // each monster instance needs its own clone (SkeletonUtils handles bones +
  // skinned meshes, a plain scene.clone() would not).
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])

  const { actions, mixer } = useAnimations(animations, clone)

  const root = useRef(null)
  const currentClip = useRef(null)
  const materials = useRef([])
  const baseColors = useMemo(() => new WeakMap(), [])
  const applyTint = useHitFlashAndFade(runtime, materials, baseColors)

  useFrame(() => {
    // Collect materials lazily on the first frames.
    if (materials.current.length === 0) {
      clone.traverse((child) => {
        if (child.material && !materials.current.includes(child.material)) {
          materials.current.push(child.material)
        }
      })
    }

    const wantClip = runtime.dead ? WYVERN_CLIPS.idol : clipForState(runtime.state)
    if (currentClip.current !== wantClip) {
      const next = actions[wantClip]
      const prev = currentClip.current ? actions[currentClip.current] : null
      if (next) {
        next.reset().fadeIn(0.25).play()
        if (prev && prev !== next) prev.fadeOut(0.25)
      }
      currentClip.current = wantClip
    }

    // Slow the loop to a stop once dead rather than cutting it abruptly.
    mixer.timeScale = runtime.dead ? 0 : 1

    applyTint(root.current, def.scale)
  })

  return (
    <group ref={root} scale={def.scale}>
      <group position={[0, 1.75, 0]}>
        <primitive object={clone} />
      </group>
    </group>
  )
}

useGLTF.preload(WYVERN_GLB_URL)

/**
 * Picks the animation clip that best matches a monster state out of whatever
 * clip names the GLB actually ships with. Unlike the wyvern (whose clips are
 * known and hand-mapped), we don't control the godzilla file's naming, so
 * this matches loosely by keyword and falls back to the first clip — the
 * model still reads fine standing idle if nothing matches.
 */
function pickGodzillaClip(names, state) {
  const find = (...keywords) =>
    names.find((name) => keywords.some((k) => name.toLowerCase().includes(k)))

  switch (state) {
    case 'chase':
    case 'attack':
    case 'windup':
    case 'breath':
    case 'breathWindup':
      return find('walk', 'run', 'move', 'attack', 'roar') ?? names[0]
    case 'alert':
      return find('roar', 'alert', 'idle') ?? names[0]
    default:
      return find('idle', 'idol') ?? names[0]
  }
}

/**
 * GLB-driven Godzilla boss. Same cloning/tinting approach as `WyvernModel`
 * (SkeletonUtils clone so each instance gets its own skeleton), but clip
 * selection is generic since we don't control this file's clip names.
 */
// How tall Godzilla should actually stand in-world, in metres — this drives
// an auto-fit scale computed from the GLB's real bounding box (see below)
// rather than trusting a hand-tuned multiplier, because this file's raw mesh
// units don't match the wyvern's (its source model is authored much smaller
// than "kaiju-sized" in its own local space).
const GODZILLA_TARGET_HEIGHT = 13

function GodzillaModel({ runtime }) {
  const { scene, animations } = useGLTF(GODZILLA_GLB_URL)

  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { actions, mixer } = useAnimations(animations, clone)
  const clipNames = useMemo(() => Object.keys(actions), [actions])

  // Auto-fit: measure the clone's actual bounding box once and derive a
  // scale factor that makes it GODZILLA_TARGET_HEIGHT metres tall, instead of
  // applying def.scale directly to raw (and here, tiny) mesh units.
  //
  // IMPORTANT: this is a SKINNED mesh. Box3.setFromObject() right after
  // SkeletonUtils.clone() reads bone matrices that haven't been computed
  // yet (nothing has rendered this clone or called updateMatrixWorld on a
  // fully wired-up skeleton), so it silently produces a wrong/huge box —
  // which is exactly what made the model render at a wild, scattered scale.
  // Forcing updateMatrixWorld(true) first makes every bone matrix current
  // before we measure, so the box reflects the model's real rest-pose size.
  const { fitScale, footOffset } = useMemo(() => {
    clone.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const height = size.y
    if (!Number.isFinite(height) || height <= 0.001) {
      // Bounding box still came out degenerate — bail to a neutral 1:1 scale
      // rather than dividing by ~0 and blowing the model up to infinity.
      return { fitScale: 1, footOffset: 0 }
    }
    return { fitScale: GODZILLA_TARGET_HEIGHT / height, footOffset: -box.min.y }
  }, [clone])

  const root = useRef(null)
  const currentClip = useRef(null)
  const materials = useRef([])
  const baseColors = useMemo(() => new WeakMap(), [])
  const applyTint = useHitFlashAndFade(runtime, materials, baseColors)

  useFrame(() => {
    if (materials.current.length === 0) {
      clone.traverse((child) => {
        if (child.material && !materials.current.includes(child.material)) {
          materials.current.push(child.material)
        }
      })
    }

    if (clipNames.length > 0) {
      const wantClip = pickGodzillaClip(clipNames, runtime.dead ? 'idle' : runtime.state)
      if (currentClip.current !== wantClip) {
        const next = actions[wantClip]
        const prev = currentClip.current ? actions[currentClip.current] : null
        if (next) {
          next.reset().fadeIn(0.3).play()
          if (prev && prev !== next) prev.fadeOut(0.3)
        }
        currentClip.current = wantClip
      }
      mixer.timeScale = runtime.dead ? 0 : 1
    }

    applyTint(root.current, fitScale)
  })

  return (
    <group ref={root} scale={fitScale}>
      <group position={[0, footOffset, 0]}>
        <primitive object={clone} />
      </group>
    </group>
  )
}

// Deliberately NOT preloaded at module scope — this file is 17MB, and eager
// preloading here would make every player download it on app start whether
// or not they ever reach the kaiju phase. GameScene calls this once the boss
// phase actually begins, so the fetch only happens for hunts that get there.
export function preloadGodzilla() {
  useGLTF.preload(GODZILLA_GLB_URL)
}

/* ------------------------------ main model ------------------------------- */

function MonsterModel({ runtime }) {
  const { def } = runtime

  // The drake now uses the rigged wyvern GLB. Suspense covers the load, the
  // error boundary catches a bad/missing file, and both fall back to the
  // original hand-built drake so a monster never renders as nothing.
  if (def.model === 'drake') {
    return (
      <GltfErrorBoundary fallback={<ProceduralMonsterModel runtime={runtime} />}>
        <Suspense fallback={<ProceduralMonsterModel runtime={runtime} />}>
          <WyvernModel runtime={runtime} />
        </Suspense>
      </GltfErrorBoundary>
    )
  }

  if (def.model === 'godzilla') {
    return (
      <GltfErrorBoundary fallback={<ProceduralMonsterModel runtime={runtime} />}>
        <Suspense fallback={<ProceduralMonsterModel runtime={runtime} />}>
          <GodzillaModel runtime={runtime} />
        </Suspense>
      </GltfErrorBoundary>
    )
  }

  return <ProceduralMonsterModel runtime={runtime} />
}

/** Original hand-built monster bodies (quad/biped/drake), kept as the
 * Suspense/error fallback for the drake and as the only path for the rest. */
function ProceduralMonsterModel({ runtime }) {
  const { def } = runtime
  const palette = def.palette

  const root = useRef(null)
  const refs = useRef({
    body: { current: null },
    chest: { current: null },
    neck: { current: null },
    head: { current: null },
    lowerJaw: { current: null },
    throat: { current: null },
    tail: { current: null },
    tail2: { current: null },
    tail3: { current: null },
    legs: [{ current: null }, { current: null }, { current: null }, { current: null }],
    wings: [{ current: null }, { current: null }],
  }).current

  // Cache materials so hit-flash can tint them all at once.
  const materials = useRef([])
  const baseColors = useMemo(() => new WeakMap(), [])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const t = state.clock.elapsedTime

    // Collect materials lazily on the first frames.
    if (materials.current.length === 0 && root.current) {
      root.current.traverse((child) => {
        if (child.material && !materials.current.includes(child.material)) {
          materials.current.push(child.material)
        }
      })
    }

    const walking =
      runtime.state === 'patrol' || runtime.state === 'chase' || runtime.state === 'attack'
    const stride = runtime.state === 'chase' ? 11 : 6.5
    const cycle = walking ? Math.sin(t * stride) : 0
    const amplitude = walking ? 0.62 : 0

    // Diagonal gait for quadrupeds: legs 0/3 together, 1/2 together.
    refs.legs.forEach((legRef, i) => {
      const leg = legRef.current
      if (!leg) return
      const diagonal = i === 0 || i === 3 ? 1 : -1
      const idle = Math.sin(t * 1.4 + i) * 0.03
      leg.rotation.x = walking ? cycle * diagonal * amplitude : idle
    })

    // Breathing: chest swells, whole body rises slightly.
    if (refs.chest.current) {
      const breath = 1 + Math.sin(t * (runtime.aggro ? 3.2 : 1.6)) * (runtime.aggro ? 0.05 : 0.03)
      refs.chest.current.scale.setScalar(breath)
    }

    // Jaw hinge from the AI's jawOpen value.
    if (refs.lowerJaw.current) {
      refs.lowerJaw.current.rotation.x = runtime.jawOpen * 0.7
    }

    // Throat glows while charging breath.
    if (refs.throat.current) {
      const charging = runtime.state === 'breathWindup' || runtime.state === 'breath'
      refs.throat.current.visible = charging
      if (charging) {
        const k = runtime.state === 'breath' ? 1 : Math.min(runtime.stateTime / (def.ranged?.windup ?? 1), 1)
        refs.throat.current.scale.setScalar(0.7 + k * 0.9)
        refs.throat.current.material.opacity = 0.5 + k * 0.45
      }
    }

    // Head tracks the hunter when aggressive.
    if (refs.head.current) {
      const track = runtime.aggro && !runtime.dead ? 1 : 0
      refs.head.current.rotation.x = THREE.MathUtils.lerp(
        refs.head.current.rotation.x,
        Math.sin(t * (walking ? 4 : 1.2)) * 0.06 - track * 0.1,
        delta * 6,
      )
    }
    if (refs.neck.current) {
      const lift = runtime.state === 'alert' || runtime.state === 'breathWindup' ? -0.4 : 0
      refs.neck.current.rotation.x = THREE.MathUtils.lerp(refs.neck.current.rotation.x, lift, delta * 5)
    }

    // Tail segments follow with increasing lag for a whip feel.
    const tailWave = Math.sin(t * (walking ? 4.5 : 1.8))
    if (refs.tail.current) refs.tail.current.rotation.y = tailWave * 0.3
    if (refs.tail2.current) refs.tail2.current.rotation.y = Math.sin(t * (walking ? 4.5 : 1.8) - 0.6) * 0.38
    if (refs.tail3.current) refs.tail3.current.rotation.y = Math.sin(t * (walking ? 4.5 : 1.8) - 1.2) * 0.42

    // Wings: folded normally, spread on roar, beat during breath attacks.
    const spread =
      runtime.state === 'alert' || runtime.state === 'breathWindup' || runtime.state === 'breath'
        ? 1
        : 0
    refs.wings.forEach((wingRef, i) => {
      const wing = wingRef.current
      if (!wing) return
      const side = i === 0 ? -1 : 1
      const beat = spread ? Math.sin(t * 7) * 0.3 : 0
      wing.rotation.z = THREE.MathUtils.lerp(wing.rotation.z, side * (spread * 0.55 + beat), delta * 7)
      wing.rotation.y = THREE.MathUtils.lerp(wing.rotation.y, side * spread * -0.3, delta * 7)
    })

    // Body posture per state.
    let pitch = 0
    let lift = 0
    let roll = 0

    if (runtime.state === 'windup') {
      const k = Math.min(runtime.stateTime / def.windup, 1)
      pitch = -0.42 * k
      lift = 0.24 * k
    } else if (runtime.state === 'attack') {
      const k = Math.min(runtime.stateTime / def.active, 1)
      pitch = -0.42 + k * 0.85
      lift = 0.24 * (1 - k)
    } else if (runtime.state === 'breathWindup') {
      const k = Math.min(runtime.stateTime / (def.ranged?.windup ?? 1), 1)
      pitch = -0.3 * k
      lift = 0.3 * k
    } else if (runtime.state === 'breath') {
      pitch = -0.22
      lift = 0.26
    } else if (runtime.state === 'recover') {
      const k = Math.min(runtime.stateTime / def.recover, 1)
      pitch = 0.38 * (1 - k)
    } else if (runtime.state === 'stagger') {
      pitch = 0.3
      roll = Math.sin(t * 20) * 0.24
      lift = -0.14
    } else if (runtime.state === 'alert') {
      pitch = -0.32
      lift = 0.18
    } else if (runtime.dead) {
      const k = Math.min(runtime.deadTimer / 1.0, 1)
      roll = k * 1.5
      lift = -0.34 * k
    } else if (walking) {
      pitch = Math.sin(t * stride * 0.5) * 0.05
      lift = Math.abs(Math.sin(t * stride * 0.5)) * 0.05
    } else {
      lift = Math.sin(t * 1.6) * 0.02
    }

    if (refs.body.current) {
      const b = refs.body.current
      b.rotation.x = THREE.MathUtils.lerp(b.rotation.x, pitch, delta * 9)
      b.rotation.z = THREE.MathUtils.lerp(b.rotation.z, roll, delta * 11)
      b.position.y = THREE.MathUtils.lerp(b.position.y, lift, delta * 9)
    }

    // Hit flash + death fade.
    const flash = runtime.hitFlash
    const fade = runtime.dead ? Math.min(runtime.deadTimer / 3.2, 1) : 0
    materials.current.forEach((material) => {
      if (!material.color) return
      if (!baseColors.has(material)) baseColors.set(material, material.color.clone())
      const base = baseColors.get(material)
      if (flash > 0) {
        material.color.copy(base).lerp(HIT_FLASH_COLOR, Math.min(1, flash * 5))
      } else if (!material.color.equals(base)) {
        material.color.lerp(base, 0.22)
      }
      if (fade > 0) {
        material.transparent = true
        material.opacity = 1 - fade
      }
    })

    if (runtime.dead && root.current) {
      root.current.scale.setScalar(def.scale * (1 - fade * 0.28))
    }
  })

  const bodies = {
    quad: <QuadrupedBody palette={palette} refs={refs} />,
    biped: <BipedBody palette={palette} refs={refs} />,
    drake: <DrakeBody palette={palette} refs={refs} />,
  }

  const baseHeight = def.model === 'drake' ? 1.75 : def.model === 'biped' ? 1.25 : 1.05

  return (
    <group ref={root} scale={def.scale}>
      <group position={[0, baseHeight, 0]}>{bodies[def.model] ?? bodies.quad}</group>
    </group>
  )
}

export default MonsterModel
