// Shared tuning values for the hunt. Kept in one place so balance passes
// don't require touching gameplay code.

export const MAP_BOUND = 40 // half-extent of the playable square

/**
 * Monsters must be able to actually see you before they aggro, and they give up
 * after losing sight for a while (heading to your last known spot first).
 */
export const VISION = {
  // Cliffs block sight at 92% of their radius — slightly forgiving so you
  // don't get spotted through a sliver of rock you're clearly behind.
  occluderScale: 0.92,
  // How long a monster keeps hunting after sight is broken.
  memory: 3.2,
  // Peripheral limit: beyond this half-angle a monster won't notice you at all.
  fieldOfView: 1.95,
  // Inside this range they notice you regardless of facing (footsteps/scent).
  awarenessRadius: 5.5,
}

export const RESPAWN = {
  // Grace period after respawning so you can't be instantly re-killed.
  invulnDuration: 3,
}

export const PLAYER = {
  radius: 0.45,
  walkSpeed: 4.4,
  sprintSpeed: 7.8,
  rollSpeed: 12,
  // Acceleration/deceleration make movement feel weighty instead of snapping
  // between full speed and a dead stop.
  accel: 26,
  decel: 20,
  turnRate: 16,
  rollDuration: 0.5,
  rollInvulnEnd: 0.34,
  rollCost: 25,
  hitStun: 0.4,
  hitKnockback: 4.2,
  staminaRegen: 22,
  sprintDrain: 18,
  // Brief freeze on impact — the single biggest contributor to hits feeling solid.
  hitstopOnHit: 0.055,
  hitstopOnHeavy: 0.1,
  hitstopOnUltimate: 0.18,
}

export const CAMERA = {
  distance: 13.5,
  height: 10,
  lookHeight: 1.1,
  followLerp: 7.5,
  rotateSpeed: 2.4,
  dragSpeed: 0.0065,
  // Mouse-wheel zoom, applied as a multiplier on distance/height.
  zoomMin: 0.6,
  zoomMax: 1.75,
  zoomStep: 0.12,
}

/**
 * When you attack without a lock-on, snap toward the nearest monster inside
 * this cone/range. Removes the "swung at nothing" feeling without taking aim
 * away from the player.
 */
export const AUTO_AIM = {
  range: 4.6,
  arc: 2.4,
}

export const CAMP = { x: 0, z: 30 }

/**
 * Safe zone around camp: health and stamina regenerate fast and monsters
 * refuse to enter, so there's always somewhere to retreat and reset a fight.
 */
export const SAFE_ZONE = {
  x: CAMP.x,
  z: CAMP.z,
  radius: 10,
  hpRegen: 14, // per second
  staminaRegen: 55,
}

/**
 * Biomes. `ground` tints the terrain, `scatter` picks which props populate it,
 * and `elevation` raises the whole patch into a plateau you can fight on.
 */
export const BIOMES = [
  {
    id: 'plains',
    name: 'Verdant Plains',
    x: 0,
    z: 6,
    radius: 20,
    ground: '#6fae52',
    elevation: 0,
    scatter: { grass: 120, trees: 10, rocks: 6, flowers: 40 },
  },
  {
    id: 'forest',
    name: 'Deepwood',
    x: -20,
    z: -18,
    radius: 18,
    ground: '#386b3c',
    elevation: 0.35,
    scatter: { grass: 90, pines: 44, trees: 28, mushrooms: 26 },
  },
  {
    id: 'highlands',
    name: 'Stone Highlands',
    x: 23,
    z: -12,
    radius: 16,
    ground: '#8d8574',
    elevation: 1.5,
    scatter: { rocks: 60, grass: 24, pillars: 10 },
  },
  {
    id: 'ashen',
    name: 'Ashen Hollow',
    x: -2,
    z: -33,
    radius: 15,
    ground: '#5c4038',
    elevation: -0.4,
    scatter: { rocks: 34, embers: 40, deadTrees: 18 },
    hazard: 'heat',
  },
  {
    id: 'frost',
    name: 'Frostvale',
    x: 28,
    z: 20,
    radius: 14,
    ground: '#d6e6ef',
    elevation: 0.7,
    scatter: { pines: 26, rocks: 18, crystals: 14 },
    hazard: 'cold',
  },
  {
    id: 'mire',
    name: 'Sunken Mire',
    x: -28,
    z: 14,
    radius: 14,
    ground: '#4a6b52',
    elevation: -0.55,
    scatter: { reeds: 70, deadTrees: 12, grass: 30 },
    water: { radius: 8.5, color: '#4f8f8a' },
  },
]

// Static collidables: cliffs and boulders the hunter and monsters bump into.
export const OBSTACLES = [
  { x: -14, z: -8, r: 3.2 },
  { x: -24, z: -26, r: 3.6 },
  { x: -9, z: -24, r: 2.6 },
  { x: 13, z: -22, r: 3.8 },
  { x: 21, z: -4, r: 3.4 },
  { x: 30, z: -18, r: 4.0 },
  { x: 16, z: 8, r: 2.4 },
  { x: -20, z: 4, r: 3.0 },
  { x: -33, z: 22, r: 3.2 },
  { x: 33, z: 10, r: 2.8 },
  { x: 24, z: 28, r: 3.0 },
  { x: -8, z: 16, r: 2.0 },
  { x: 7, z: -12, r: 1.8 },
  { x: -34, z: -6, r: 3.4 },
]
