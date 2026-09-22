import { useMemo } from 'react'
import { Instance, Instances } from '@react-three/drei'
import { BIOMES, MAP_BOUND, OBSTACLES, SAFE_ZONE } from '../game/constants'

/** Deterministic PRNG so the world is identical every load. */
function makeRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const insideObstacle = (x, z, pad = 1.4) =>
  OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad)

const insideSafeZone = (x, z, pad = 1) =>
  Math.hypot(x - SAFE_ZONE.x, z - SAFE_ZONE.z) < SAFE_ZONE.radius + pad

/** Scatters `count` points inside a biome, skipping cliffs and the safe zone. */
function scatterInBiome(biome, count, seed) {
  const rand = makeRandom(seed)
  const points = []
  let guard = 0
  while (points.length < count && guard < count * 30) {
    guard += 1
    const angle = rand() * Math.PI * 2
    const radius = Math.sqrt(rand()) * biome.radius // sqrt keeps density even
    const x = biome.x + Math.cos(angle) * radius
    const z = biome.z + Math.sin(angle) * radius

    if (Math.abs(x) > MAP_BOUND - 2 || Math.abs(z) > MAP_BOUND - 2) continue
    if (insideObstacle(x, z)) continue
    if (insideSafeZone(x, z)) continue
    if (biome.water && Math.hypot(x - biome.x, z - biome.z) < biome.water.radius) continue

    points.push({
      x,
      z,
      y: biome.elevation,
      rot: rand() * Math.PI * 2,
      scale: 0.72 + rand() * 0.66,
    })
  }
  return points
}

/** Gathers one prop type across every biome that requests it. */
function collectProp(propName, seedBase) {
  const out = []
  BIOMES.forEach((biome, index) => {
    const count = biome.scatter?.[propName]
    if (!count) return
    out.push(...scatterInBiome(biome, count, seedBase + index * 977))
  })
  return out
}

function Cliffs() {
  return (
    <group>
      {OBSTACLES.map((o) => (
        <group key={`${o.x}-${o.z}`} position={[o.x, 0, o.z]}>
          <mesh position={[0, o.r * 0.44, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[o.r * 0.78, o.r, o.r * 0.9, 7]} />
            <meshStandardMaterial color="#8d8677" flatShading roughness={0.9} />
          </mesh>
          <mesh position={[o.r * 0.24, o.r * 0.82, -o.r * 0.16]} castShadow>
            <dodecahedronGeometry args={[o.r * 0.44, 0]} />
            <meshStandardMaterial color="#9c9485" flatShading roughness={0.9} />
          </mesh>
          <mesh position={[-o.r * 0.3, o.r * 0.3, o.r * 0.2]} castShadow>
            <dodecahedronGeometry args={[o.r * 0.3, 0]} />
            <meshStandardMaterial color="#847d70" flatShading roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Terrain() {
  const grass = useMemo(() => collectProp('grass', 11), [])
  const trees = useMemo(() => collectProp('trees', 101), [])
  const pines = useMemo(() => collectProp('pines', 211), [])
  const deadTrees = useMemo(() => collectProp('deadTrees', 307), [])
  const rocks = useMemo(() => collectProp('rocks', 401), [])
  const flowers = useMemo(() => collectProp('flowers', 503), [])
  const mushrooms = useMemo(() => collectProp('mushrooms', 601), [])
  const reeds = useMemo(() => collectProp('reeds', 701), [])
  const crystals = useMemo(() => collectProp('crystals', 809), [])
  const embers = useMemo(() => collectProp('embers', 907), [])
  const pillars = useMemo(() => collectProp('pillars', 1009), [])

  return (
    <group>
      {/* Base ground beneath everything */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[MAP_BOUND * 2, MAP_BOUND * 2]} />
        <meshStandardMaterial color="#5e8f4a" roughness={0.95} />
      </mesh>

      {/* Biome plateaus — raised/sunken discs with a soft rim */}
      {BIOMES.map((biome, index) => (
        <group key={biome.id} position={[biome.x, biome.elevation, biome.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01 + index * 0.002, 0]} receiveShadow>
            <circleGeometry args={[biome.radius, 48]} />
            <meshStandardMaterial color={biome.ground} roughness={0.92} />
          </mesh>
          {/* Rim skirt so elevation changes read as solid ground, not a floating disc */}
          {Math.abs(biome.elevation) > 0.05 && (
            <mesh position={[0, -Math.abs(biome.elevation) / 2, 0]}>
              <cylinderGeometry
                args={[biome.radius, biome.radius * 0.99, Math.abs(biome.elevation) + 0.1, 48, 1, true]}
              />
              <meshStandardMaterial color="#7a6348" roughness={0.95} side={2} />
            </mesh>
          )}
          {/* Standing water for the mire */}
          {biome.water && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
              <circleGeometry args={[biome.water.radius, 36]} />
              <meshStandardMaterial
                color={biome.water.color}
                transparent
                opacity={0.88}
                roughness={0.25}
                metalness={0.35}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* Worn road from camp out into the plains */}
      <mesh position={[0, 0.05, 18]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 24]} />
        <meshStandardMaterial color="#b89b6d" roughness={0.9} />
      </mesh>

      <Cliffs />

      {/* ---------- instanced flora & scenery, one draw call per type ---------- */}

      <Instances limit={420} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.9, 5]} />
        <meshStandardMaterial color="#5e8a3f" roughness={0.9} />
        {grass.map((g, i) => (
          <Instance key={i} position={[g.x, g.y + 0.42, g.z]} rotation={[0, g.rot, 0]} scale={[1, g.scale, 1]} />
        ))}
      </Instances>

      {/* Broadleaf trees: trunk + two canopy blobs */}
      <Instances limit={80} castShadow>
        <cylinderGeometry args={[0.24, 0.34, 2.6, 6]} />
        <meshStandardMaterial color="#6b4a30" roughness={0.9} />
        {trees.map((t, i) => (
          <Instance key={i} position={[t.x, t.y + 1.3 * t.scale, t.z]} scale={t.scale} />
        ))}
      </Instances>
      <Instances limit={80} castShadow>
        <sphereGeometry args={[1.6, 9, 8]} />
        <meshStandardMaterial color="#2f7a3c" flatShading roughness={0.85} />
        {trees.map((t, i) => (
          <Instance key={i} position={[t.x, t.y + 3.3 * t.scale, t.z]} scale={t.scale} />
        ))}
      </Instances>

      <Instances limit={90} castShadow>
        <coneGeometry args={[1.35, 3.6, 7]} />
        <meshStandardMaterial color="#255e34" flatShading roughness={0.85} />
        {pines.map((p, i) => (
          <Instance key={i} position={[p.x, p.y + 2 * p.scale, p.z]} scale={p.scale} />
        ))}
      </Instances>

      {/* Bare trunks for the ashen hollow and mire */}
      <Instances limit={40} castShadow>
        <cylinderGeometry args={[0.16, 0.3, 3.2, 5]} />
        <meshStandardMaterial color="#4a3b33" flatShading roughness={0.95} />
        {deadTrees.map((d, i) => (
          <Instance key={i} position={[d.x, d.y + 1.6 * d.scale, d.z]} rotation={[0, d.rot, 0.08]} scale={d.scale} />
        ))}
      </Instances>

      <Instances limit={130} castShadow>
        <dodecahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial color="#9a9384" flatShading roughness={0.95} />
        {rocks.map((r, i) => (
          <Instance key={i} position={[r.x, r.y + 0.3 * r.scale, r.z]} rotation={[r.rot, r.rot, 0]} scale={r.scale} />
        ))}
      </Instances>

      {/* Highland standing stones */}
      <Instances limit={30} castShadow>
        <boxGeometry args={[0.8, 3.4, 0.8]} />
        <meshStandardMaterial color="#7f7869" flatShading roughness={0.95} />
        {pillars.map((p, i) => (
          <Instance key={i} position={[p.x, p.y + 1.7 * p.scale, p.z]} rotation={[0, p.rot, 0.04]} scale={p.scale} />
        ))}
      </Instances>

      <Instances limit={90}>
        <coneGeometry args={[0.11, 1.5, 4]} />
        <meshStandardMaterial color="#7d9a4a" roughness={0.9} />
        {reeds.map((r, i) => (
          <Instance key={i} position={[r.x, r.y + 0.75, r.z]} rotation={[0, r.rot, 0]} />
        ))}
      </Instances>

      {/* Frostvale crystals — faintly glowing so night looks good */}
      <Instances limit={30} castShadow>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#9fd8f0"
          emissive="#4fa8d8"
          emissiveIntensity={0.55}
          flatShading
          roughness={0.35}
          metalness={0.2}
        />
        {crystals.map((c, i) => (
          <Instance key={i} position={[c.x, c.y + 0.55 * c.scale, c.z]} rotation={[0.2, c.rot, 0.15]} scale={c.scale} />
        ))}
      </Instances>

      {/* Glowing embers in the ashen hollow */}
      <Instances limit={70}>
        <sphereGeometry args={[0.16, 7, 7]} />
        <meshStandardMaterial
          color="#ff7a3c"
          emissive="#ff4d1a"
          emissiveIntensity={1.8}
          toneMapped={false}
        />
        {embers.map((e, i) => (
          <Instance key={i} position={[e.x, e.y + 0.14, e.z]} scale={e.scale * 0.8} />
        ))}
      </Instances>

      {/* Forest mushrooms */}
      <Instances limit={50} castShadow>
        <sphereGeometry args={[0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d16a5a" roughness={0.8} />
        {mushrooms.map((m, i) => (
          <Instance key={i} position={[m.x, m.y + 0.2, m.z]} scale={m.scale} />
        ))}
      </Instances>

      {/* Plains flowers */}
      <Instances limit={70}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial color="#ffe36a" roughness={0.7} />
        {flowers.map((f, i) => (
          <Instance key={i} position={[f.x, f.y + 0.24, f.z]} scale={f.scale} />
        ))}
      </Instances>
    </group>
  )
}

export default Terrain
