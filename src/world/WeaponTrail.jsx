import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SEGMENTS = 22 // ribbon resolution — higher is smoother but costlier

/**
 * A ribbon that follows the weapon's edge through a swing.
 *
 * Every frame we sample the world position of two points on the blade (base and
 * tip) and push them into a ring buffer, then rebuild a triangle strip from the
 * history. Opacity fades along the ribbon's length and the whole thing fades out
 * when the hunter isn't swinging, so it never lingers awkwardly during idle.
 *
 * `baseRef` / `tipRef` are objects parented to the weapon, so their world
 * matrices already account for every joint rotation above them.
 */
function WeaponTrail({ baseRef, tipRef, active, color = '#cfe6ff' }) {
  const meshRef = useRef(null)
  const strengthRef = useRef(0)

  const { geometry, positions, alphas } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(SEGMENTS * 2 * 3)
    const alpha = new Float32Array(SEGMENTS * 2)

    // Two vertices per segment (inner/outer edge) stitched into quads.
    const indices = []
    for (let i = 0; i < SEGMENTS - 1; i += 1) {
      const a = i * 2
      const b = i * 2 + 1
      const c = (i + 1) * 2
      const d = (i + 1) * 2 + 1
      indices.push(a, b, c, b, d, c)
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    geo.setIndex(indices)
    return { geometry: geo, positions: pos, alphas: alpha }
  }, [])

  // Custom shader so alpha can vary per-vertex along the ribbon.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uStrength: { value: 0 },
        },
        vertexShader: `
          attribute float aAlpha;
          varying float vAlpha;
          void main() {
            vAlpha = aAlpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uStrength;
          varying float vAlpha;
          void main() {
            float a = vAlpha * uStrength;
            if (a <= 0.001) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    [color],
  )

  // Ring buffer of sampled edge pairs, newest first.
  const history = useRef(
    Array.from({ length: SEGMENTS }, () => ({
      base: new THREE.Vector3(),
      tip: new THREE.Vector3(),
      filled: false,
    })),
  )

  const scratchBase = useMemo(() => new THREE.Vector3(), [])
  const scratchTip = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const base = baseRef.current
    const tip = tipRef.current
    if (!base || !tip || !meshRef.current) return

    // Fade in hard on swing start, fade out gently after.
    const target = active ? 1 : 0
    strengthRef.current += (target - strengthRef.current) * (1 - Math.exp(-(active ? 40 : 9) * delta))
    material.uniforms.uStrength.value = strengthRef.current

    if (strengthRef.current < 0.01) {
      meshRef.current.visible = false
      // Reset history so the next swing doesn't smear from the old pose.
      history.current.forEach((entry) => {
        entry.filled = false
      })
      return
    }
    meshRef.current.visible = true

    base.getWorldPosition(scratchBase)
    tip.getWorldPosition(scratchTip)

    // Shift history back by one and write the newest sample at index 0.
    const entries = history.current
    for (let i = entries.length - 1; i > 0; i -= 1) {
      entries[i].base.copy(entries[i - 1].base)
      entries[i].tip.copy(entries[i - 1].tip)
      entries[i].filled = entries[i - 1].filled
    }
    entries[0].base.copy(scratchBase)
    entries[0].tip.copy(scratchTip)
    entries[0].filled = true

    // Rebuild the strip. Unfilled slots collapse onto the newest sample so the
    // ribbon grows out from the blade instead of springing from the origin.
    for (let i = 0; i < SEGMENTS; i += 1) {
      const entry = entries[i].filled ? entries[i] : entries[0]
      const fade = 1 - i / (SEGMENTS - 1)
      const offset = i * 6

      positions[offset] = entry.base.x
      positions[offset + 1] = entry.base.y
      positions[offset + 2] = entry.base.z
      positions[offset + 3] = entry.tip.x
      positions[offset + 4] = entry.tip.y
      positions[offset + 5] = entry.tip.z

      // Squared falloff keeps the head bright and the tail wispy.
      alphas[i * 2] = fade * fade * 0.35
      alphas[i * 2 + 1] = fade * fade * 0.9
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
    geometry.computeBoundingSphere()
  })

  // Rendered at the scene root: vertices are already in world space.
  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />
}

export default WeaponTrail
