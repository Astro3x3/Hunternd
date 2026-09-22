import { MONSTERS, MONSTER_SPAWNS } from '../data/monsters'
import { SKILLS_BY_ID, skillsForClass } from '../data/skills'
import { WEAPONS } from '../data/weapons'
import { CLASSES, DEFAULT_CLASS } from '../data/classes'
import { deriveStats, grantXp, xpToNext, XP_REWARDS, MAX_LEVEL } from './progression'
import { PICKUPS, PICKUP_COLLECT_RADIUS, PICKUP_LIFETIME, PICKUP_MAGNET_RADIUS } from '../data/pickups'
import { QUEST_CHAIN, MAX_QUESTS } from '../data/quests'
import {
  AUTO_AIM,
  MAP_BOUND,
  OBSTACLES,
  PLAYER,
  RESPAWN,
  SAFE_ZONE,
  VISION,
} from './constants'

const EVENT_TTL = 4

let uid = 0
const nextId = () => {
  uid += 1
  return uid
}

/** Builds a fresh runtime quest (with zeroed kill counters) from the chain. */
function makeQuestFromChain(index) {
  const def = QUEST_CHAIN[index]
  if (!def) return null
  return {
    id: def.id,
    title: def.title,
    blurb: def.blurb,
    objectives: def.objectives.map((o) => ({ ...o, killed: 0 })),
    complete: false,
  }
}

/**
 * The whole hunt lives in one mutable object that the frame loop mutates in
 * place. React only reads throttled snapshots for the HUD, so combat never
 * triggers a re-render.
 */
export function createGameState({ classId = DEFAULT_CLASS, level = 1, xp = 0 } = {}) {
  const stats = deriveStats(classId, level)

  return {
    time: 0,
    started: false,
    paused: false,
    // Impact freeze. While positive, the sim runs at a crawl so hits land hard.
    hitstop: 0,

    player: {
      classId,
      x: SAFE_ZONE.x,
      z: SAFE_ZONE.z - 3,
      facing: Math.PI,
      // Velocity-based movement: we accelerate toward a desired velocity rather
      // than teleporting to full speed, which reads as weight.
      vx: 0,
      vz: 0,
      rollDirX: 0,
      rollDirZ: 0,
      knockX: 0,
      knockZ: 0,
      speed: 0, // current planar speed, drives animation blending

      hp: stats.maxHp,
      stamina: stats.maxStamina,
      stats,
      progress: { level, xp },
      pendingLevelUps: 0,

      state: 'idle',
      stateTime: 0,
      moving: false,
      sprinting: false,
      inSafeZone: true,

      weapon: CLASSES[classId]?.weapon ?? 'greatsword',
      comboIndex: 0,
      comboQueued: false,
      swingHits: new Set(),
      swingFired: false,
      // Blademaster momentum stacks.
      momentum: 0,
      momentumTimer: 0,

      invuln: false,
      // Counts down after respawning; while positive nothing can touch you.
      invulnTimer: 0,
      buffTimer: 0,
      damageMultiplier: 1,
      // Set by class-specific buff skills while active; cleared when buffTimer expires.
      staggerImmune: false,
      dischargeRadiusMult: 1,
      cooldowns: {},
      activeSkill: null,
      skillResolved: false,
      deaths: 0,
      collected: { healthPotion: 0, staminaTonic: 0, rageShard: 0, material: 0 },
    },

    monsters: MONSTER_SPAWNS.map((spawn) => {
      const def = MONSTERS[spawn.species]
      return {
        id: spawn.id,
        species: spawn.species,
        def,
        biome: spawn.biome,
        x: spawn.den[0],
        z: spawn.den[1],
        den: { x: spawn.den[0], z: spawn.den[1] },
        patrol: spawn.patrol,
        facing: Math.random() * Math.PI * 2,
        hp: def.maxHp,
        state: 'idle',
        stateTime: Math.random() * 2,
        targetX: spawn.den[0],
        targetZ: spawn.den[1],
        attackTimer: 0,
        rangedTimer: 2 + Math.random() * 3,
        staggerAccum: 0,
        hitFlash: 0,
        jawOpen: 0,
        aggro: false,
        dead: false,
        deadTimer: 0,
        hasHitThisSwing: false,
        shotsLeft: 0,
        shotTimer: 0,
        // --- enemy resource ---
        stamina: def.stamina?.max ?? 100,
        winded: false,
        windedTimer: 0,
        // --- perception ---
        canSee: false,
        memoryTimer: 0,
        lastSeenX: spawn.den[0],
        lastSeenZ: spawn.den[1],
      }
    }),

    projectiles: [],
    effects: [],
    damageNumbers: [],
    pickups: [],

    // Sequential quest chain: one active quest at a time, up to MAX_QUESTS.
    // `questIndex` is the chain position; `chainComplete` flags having
    // cleared all of them. `rewards` accumulates across the whole session.
    questIndex: 0,
    chainComplete: false,
    quest: makeQuestFromChain(0),
    rewards: [],

    lockedOnId: null,
    // Transient target picked automatically at swing-start (see updatePlayer).
    // Lets combos track a nearby monster without requiring a manual lock.
    autoLockId: null,
    shake: 0,
    events: [],

    // --- multiplayer ---
    isHost: true,
    online: false,
    outgoingHits: [],
  }
}

/* ------------------------------- helpers -------------------------------- */

function pushEvent(state, type, text, emoji) {
  state.events.push({ id: `e${nextId()}`, type, text, emoji, t: state.time })
  if (state.events.length > 16) state.events.shift()
}

function spawnEffect(state, kind, x, y, z, options = {}) {
  state.effects.push({
    id: `fx${nextId()}`,
    kind,
    x,
    y,
    z,
    rotation: options.rotation ?? 0,
    scale: options.scale ?? 1,
    color: options.color,
    t: 0,
    duration: options.duration ?? 0.45,
  })
  if (state.effects.length > 56) state.effects.shift()
}

function spawnDamageNumber(state, x, y, z, value, flavour = 'normal') {
  state.damageNumbers.push({
    id: `dn${nextId()}`,
    x,
    y,
    z,
    value,
    flavour,
    t: 0,
    duration: 0.95,
    driftX: (Math.random() - 0.5) * 0.9,
  })
  if (state.damageNumbers.length > 24) state.damageNumbers.shift()
}

function spawnProjectile(state, config) {
  state.projectiles.push({
    id: `p${nextId()}`,
    kind: config.kind,
    owner: config.owner,
    x: config.x,
    y: config.y,
    z: config.z,
    vx: config.vx,
    vy: config.vy ?? 0,
    vz: config.vz,
    damage: config.damage,
    radius: config.radius,
    knock: config.knock ?? 0.6,
    life: config.life,
    t: 0,
    facing: Math.atan2(config.vx, config.vz),
    dead: false,
  })
}

function resolveCollision(x, z, radius) {
  let nx = x
  let nz = z

  for (const obstacle of OBSTACLES) {
    const dx = nx - obstacle.x
    const dz = nz - obstacle.z
    const minDist = obstacle.r + radius
    const distSq = dx * dx + dz * dz
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq)
      nx = obstacle.x + (dx / dist) * minDist
      nz = obstacle.z + (dz / dist) * minDist
    }
  }

  const limit = MAP_BOUND - radius
  return [Math.max(-limit, Math.min(limit, nx)), Math.max(-limit, Math.min(limit, nz))]
}

function angleDelta(from, to) {
  let diff = to - from
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return diff
}

/**
 * True when nothing blocks the straight line between two points.
 *
 * Treats each obstacle as a circle and measures the closest approach of the
 * segment to its centre — cheap (no real raycast) and exact for circles, which
 * is all our collision geometry is.
 */
export function hasLineOfSight(x1, z1, x2, z2) {
  const dx = x2 - x1
  const dz = z2 - z1
  const lenSq = dx * dx + dz * dz
  if (lenSq < 1e-6) return true

  for (const obstacle of OBSTACLES) {
    // Project the circle's centre onto the segment, clamped to its ends.
    let t = ((obstacle.x - x1) * dx + (obstacle.z - z1) * dz) / lenSq
    t = Math.max(0, Math.min(1, t))
    const closestX = x1 + t * dx
    const closestZ = z1 + t * dz
    const dist = Math.hypot(obstacle.x - closestX, obstacle.z - closestZ)
    if (dist < obstacle.r * VISION.occluderScale) return false
  }
  return true
}

/**
 * Can this monster perceive the hunter right now?
 * Combines distance, field of view, and line of sight. Close range ignores
 * facing, so you can't stand behind a monster's shoulder and be invisible.
 */
function canPerceive(monster, player) {
  const dx = player.x - monster.x
  const dz = player.z - monster.z
  const dist = Math.hypot(dx, dz)
  if (dist > monster.def.detectRange) return false
  if (!hasLineOfSight(monster.x, monster.z, player.x, player.z)) return false
  if (dist <= VISION.awarenessRadius) return true
  return Math.abs(angleDelta(monster.facing, Math.atan2(dx, dz))) <= VISION.fieldOfView / 2
}

/** Rolls a monster's drop table and scatters the results around its corpse. */
function spawnDrops(state, monster) {
  const table = monster.def.drops
  if (!table) return

  table.forEach((entry, index) => {
    if (Math.random() > entry.chance) return
    const def = PICKUPS[entry.id]
    if (!def) return

    const angle = (index / table.length) * Math.PI * 2 + Math.random() * 0.8
    const radius = 0.7 + Math.random() * monster.def.hitRadius
    state.pickups.push({
      id: `pk${nextId()}`,
      type: entry.id,
      def,
      x: monster.x + Math.cos(angle) * radius,
      z: monster.z + Math.sin(angle) * radius,
      y: 0.45,
      bob: Math.random() * Math.PI * 2,
      t: 0,
      collected: false,
    })
  })

  if (state.pickups.length > 40) state.pickups.splice(0, state.pickups.length - 40)
}

function inCone(ox, oz, facing, tx, tz, reach, arc, targetRadius = 0) {
  const dx = tx - ox
  const dz = tz - oz
  const dist = Math.hypot(dx, dz)
  if (dist > reach + targetRadius) return false
  if (dist < 0.001) return true
  return Math.abs(angleDelta(facing, Math.atan2(dx, dz))) <= arc / 2
}

const livingMonsters = (state) => state.monsters.filter((m) => !m.dead)
const currentWeapon = (state) => WEAPONS[state.player.weapon] ?? WEAPONS.greatsword
const playerClass = (state) => CLASSES[state.player.classId] ?? CLASSES[DEFAULT_CLASS]
const monsterTopY = (monster) => (monster.def.model === 'drake' ? 3.4 : 2.1)

export function distanceToSafeZone(x, z) {
  return Math.hypot(x - SAFE_ZONE.x, z - SAFE_ZONE.z)
}

/** Total outgoing multiplier: level scaling, buffs, and class momentum. */
function outgoingMultiplier(state) {
  const player = state.player
  return player.stats.damageMult * player.damageMultiplier * (1 + player.momentum)
}

/* ---------------------------- damage handling --------------------------- */

function damageMonster(state, monster, amount, knockback, sourceX, sourceZ, flavour = 'normal') {
  if (state.online && !state.isHost) {
    state.outgoingHits.push({
      monsterId: monster.id,
      damage: amount,
      knock: knockback,
      x: sourceX,
      z: sourceZ,
      flavour,
    })
  }

  monster.hp -= amount
  monster.hitFlash = 0.2
  monster.staggerAccum += amount
  monster.aggro = true

  // Hitstop scales with how heavy the blow was.
  const stop =
    flavour === 'ultimate'
      ? PLAYER.hitstopOnUltimate
      : flavour === 'skill' || amount >= 50
        ? PLAYER.hitstopOnHeavy
        : PLAYER.hitstopOnHit
  state.hitstop = Math.max(state.hitstop, stop)
  state.shake = Math.min(1.2, state.shake + (flavour === 'ultimate' ? 0.8 : 0.22))

  spawnDamageNumber(state, monster.x, monsterTopY(monster) * 0.7, monster.z, amount, flavour)
  spawnEffect(state, 'impact', monster.x, monsterTopY(monster) * 0.55, monster.z, {
    scale: flavour === 'ultimate' ? 2.4 : flavour === 'skill' ? 1.5 : 1,
    duration: 0.32,
    rotation: Math.random() * Math.PI,
  })

  if (state.online && !state.isHost) {
    if (monster.hp < 0) monster.hp = 0
    return
  }

  if (knockback) {
    const dx = monster.x - sourceX
    const dz = monster.z - sourceZ
    const dist = Math.hypot(dx, dz) || 1
    const [nx, nz] = resolveCollision(
      monster.x + (dx / dist) * knockback,
      monster.z + (dz / dist) * knockback,
      monster.def.hitRadius,
    )
    monster.x = nx
    monster.z = nz
  }

  if (monster.hp <= 0) {
    monster.hp = 0
    monster.dead = true
    monster.state = 'dead'
    monster.deadTimer = 0
    if (state.lockedOnId === monster.id) state.lockedOnId = null

    spawnEffect(state, 'slayBurst', monster.x, monsterTopY(monster) * 0.5, monster.z, {
      scale: monster.def.scale * 2,
      duration: 0.9,
    })
    state.hitstop = Math.max(state.hitstop, 0.12)
    spawnDrops(state, monster)

    // --- XP + level ups ---
    const xp = XP_REWARDS[monster.species] ?? 40
    const gained = grantXp(state.player.progress, xp)
    pushEvent(state, 'xp', `+${xp} XP`, '✨')
    if (gained > 0) {
      state.player.pendingLevelUps += gained
      state.player.stats = deriveStats(state.player.classId, state.player.progress.level)
      // Level ups top you off — a small reward for pushing on.
      state.player.hp = state.player.stats.maxHp
      state.player.stamina = state.player.stats.maxStamina
      spawnEffect(state, 'levelUp', state.player.x, 0.1, state.player.z, { duration: 1.3 })
      pushEvent(state, 'level', `Level ${state.player.progress.level}!`, '⬆️')
    }

    state.rewards.push(monster.def.reward)
    pushEvent(state, 'slay', `${monster.def.name} slain! Carved ${monster.def.reward}.`, '🏆')

    if (state.quest && !state.quest.complete) {
      const objective = state.quest.objectives.find((o) => o.species === monster.species)
      if (objective && objective.killed < objective.required) objective.killed += 1

      if (state.quest.objectives.every((o) => o.killed >= o.required)) {
        state.quest.complete = true
        pushEvent(state, 'quest', `Quest complete: ${state.quest.title.replace('Hunt: ', '')}!`, '📜')

        if (state.questIndex + 1 < MAX_QUESTS) {
          state.questIndex += 1
          const next = makeQuestFromChain(state.questIndex)
          state.quest = next
          spawnEffect(state, 'newQuest', state.player.x, 0.1, state.player.z, { duration: 1.0 })
          pushEvent(state, 'newQuest', `New quest: ${next.title.replace('Hunt: ', '')}`, '📖')
        } else {
          state.chainComplete = true
          pushEvent(state, 'chainComplete', 'All quests complete! Open your Guild Card.', '🏆')
        }
      }
    }
    return
  }

  if (monster.staggerAccum >= monster.def.staggerThreshold && monster.state !== 'stagger') {
    monster.staggerAccum = 0
    monster.state = 'stagger'
    monster.stateTime = 0
    spawnEffect(state, 'stagger', monster.x, monsterTopY(monster), monster.z, { duration: 0.8 })
    pushEvent(state, 'stagger', `${monster.def.name} staggered!`, '💫')
  }
}

function damagePlayer(state, amount, sourceX, sourceZ) {
  const player = state.player
  if (player.invuln || player.state === 'dead') return

  // Safe zone is exactly that — nothing can hurt you inside it.
  if (player.inSafeZone) return

  const mitigated = Math.max(1, Math.round(amount * player.stats.defenceMult))
  player.hp -= mitigated
  player.momentum = 0
  state.shake = Math.min(1.5, state.shake + 0.55)
  state.hitstop = Math.max(state.hitstop, 0.07)

  spawnDamageNumber(state, player.x, 1.6, player.z, mitigated, 'player')
  spawnEffect(state, 'impact', player.x, 1.1, player.z, { scale: 0.9, duration: 0.3 })
  spawnEffect(state, 'hurt', player.x, 1.0, player.z, { duration: 0.35 })

  // Knock the hunter away from whatever hit them.
  if (sourceX !== undefined) {
    const dx = player.x - sourceX
    const dz = player.z - sourceZ
    const dist = Math.hypot(dx, dz) || 1
    player.knockX = (dx / dist) * PLAYER.hitKnockback
    player.knockZ = (dz / dist) * PLAYER.hitKnockback
  }

  if (player.hp <= 0) {
    player.hp = 0
    player.state = 'dead'
    player.stateTime = 0
    player.deaths += 1
    pushEvent(state, 'faint', 'You fainted! Returning to camp…', '💀')
    return
  }

  // Vanguard's Iron Resolve grants stagger immunity: you still take damage,
  // but don't get knocked out of your current action/combo.
  if (player.state !== 'roll' && !player.staggerImmune) {
    player.state = 'hit'
    player.stateTime = 0
    player.comboIndex = 0
    player.activeSkill = null
  }
}

/* ------------------------------- weapons -------------------------------- */

function fireArrow(state, power = 1) {
  const player = state.player
  const weapon = currentWeapon(state)
  const config = weapon.projectile
  if (!config) return

  const klass = playerClass(state)
  let aim = player.facing
  const trackId = state.lockedOnId ?? state.autoLockId
  const locked = trackId ? state.monsters.find((m) => m.id === trackId && !m.dead) : null
  if (locked) aim = Math.atan2(locked.x - player.x, locked.z - player.z)

  const rangedBonus = 1 + (klass.rangedBonus ?? 0)

  spawnProjectile(state, {
    kind: config.kind,
    owner: 'player',
    x: player.x + Math.sin(aim) * 0.6,
    y: 1.15,
    z: player.z + Math.cos(aim) * 0.6,
    vx: Math.sin(aim) * config.speed,
    vz: Math.cos(aim) * config.speed,
    damage: Math.round(config.damage * power * outgoingMultiplier(state) * rangedBonus),
    radius: config.radius,
    knock: 0.4 * power,
    life: config.life,
  })
  spawnEffect(state, 'muzzle', player.x + Math.sin(aim) * 0.8, 1.15, player.z + Math.cos(aim) * 0.8, {
    rotation: aim,
    duration: 0.18,
  })
}

/**
 * Stormcaller passive: heavy hits (30+ damage) arc lightning to nearby
 * monsters. `force` bypasses the damage threshold — used by Stormcaller's
 * skills that are flagged `guaranteedDischarge`, which should always chain
 * regardless of how much damage they happen to roll for.
 */
function tryDischarge(state, originMonster, hitDamage, force = false) {
  const klass = playerClass(state)
  if (!klass.discharge) return
  if (!force && hitDamage < 30) return

  const radiusMult = state.player.dischargeRadiusMult ?? 1
  const damage = klass.discharge.damage
  const radius = klass.discharge.radius * radiusMult
  let chained = 0
  livingMonsters(state).forEach((monster) => {
    if (monster.id === originMonster.id) return
    if (Math.hypot(monster.x - originMonster.x, monster.z - originMonster.z) > radius) return
    chained += 1
    spawnEffect(state, 'lightning', monster.x, monsterTopY(monster) * 0.6, monster.z, {
      duration: 0.34,
      scale: 1.2,
    })
    damageMonster(state, monster, damage, 0.4, originMonster.x, originMonster.z, 'skill')
  })
  if (chained > 0) {
    spawnEffect(state, 'lightning', originMonster.x, monsterTopY(originMonster) * 0.6, originMonster.z, {
      duration: 0.3,
      scale: 1.6,
    })
  }
}

/* -------------------------------- skills -------------------------------- */

function startSkill(state, skill) {
  const player = state.player
  if (player.cooldowns[skill.id] > 0) return
  if (skill.stamina && player.stamina < skill.stamina) return

  player.stamina -= skill.stamina || 0
  player.cooldowns[skill.id] = skill.cooldown
  player.state = 'skill'
  player.stateTime = 0
  player.activeSkill = skill.id
  player.skillResolved = false
  player.comboIndex = 0

  spawnEffect(state, 'cast', player.x, 0.1, player.z, {
    duration: skill.windup,
    scale: skill.ultimate ? 2 : 1.2,
  })

  if (skill.ultimate) {
    state.shake = Math.min(1.4, state.shake + 0.4)
    pushEvent(state, 'ult', `${skill.name} unleashed!`, skill.emoji)
  }
}

function resolveSkillEffect(state, skill) {
  const player = state.player

  if (skill.kind === 'heal') {
    player.hp = Math.min(player.stats.maxHp, player.hp + skill.heal)
    spawnEffect(state, 'heal', player.x, 0.1, player.z, { duration: 0.9 })
    pushEvent(state, 'heal', `Recovered ${skill.heal} HP.`, '🧪')
    return
  }

  if (skill.kind === 'buff') {
    player.buffTimer = skill.buffDuration
    player.damageMultiplier = skill.buffMultiplier
    // Per-class buff flavour: these clear automatically when buffTimer expires
    // (see updatePlayer's buff-timer tick).
    player.staggerImmune = Boolean(skill.staggerImmune)
    player.dischargeRadiusMult = skill.dischargeRadiusMult ?? 1
    spawnEffect(state, 'buff', player.x, 0.1, player.z, { duration: 1.0 })
    pushEvent(state, 'buff', `${skill.name} — damage up!`, skill.emoji)
    return
  }

  if (skill.kind === 'meteor') {
    const trackId = state.lockedOnId ?? state.autoLockId
    const locked = trackId ? state.monsters.find((m) => m.id === trackId && !m.dead) : null
    const targetX = locked ? locked.x : player.x + Math.sin(player.facing) * 7
    const targetZ = locked ? locked.z : player.z + Math.cos(player.facing) * 7

    spawnEffect(state, 'meteorTelegraph', targetX, 0.06, targetZ, {
      scale: skill.reach,
      duration: 1.15,
    })
    spawnProjectile(state, {
      kind: 'meteor',
      owner: 'player',
      x: targetX,
      y: 26,
      z: targetZ,
      vx: 0,
      vy: -26,
      vz: 0,
      damage: Math.round(skill.damage * outgoingMultiplier(state)),
      radius: skill.reach,
      knock: skill.knock,
      life: 1.4,
    })
    return
  }

  const damage = Math.round(skill.damage * outgoingMultiplier(state))
  let hits = 0

  if (skill.vfx === 'powerSlash') {
    spawnEffect(state, 'powerSlash', player.x, 1.0, player.z, {
      rotation: player.facing,
      scale: skill.reach / 4,
      duration: 0.5,
    })
  } else if (skill.vfx === 'vortex') {
    spawnEffect(state, 'vortex', player.x, 0.2, player.z, {
      scale: skill.reach / 4,
      duration: 0.75,
    })
  }

  livingMonsters(state).forEach((monster) => {
    const dist = Math.hypot(monster.x - player.x, monster.z - player.z)
    const connected =
      skill.kind === 'radial'
        ? dist <= skill.reach + monster.def.hitRadius
        : inCone(player.x, player.z, player.facing, monster.x, monster.z, skill.reach, skill.arc, monster.def.hitRadius)

    if (connected) {
      damageMonster(state, monster, damage, skill.knock, player.x, player.z, 'skill')
      if (!monster.dead) tryDischarge(state, monster, damage, Boolean(skill.guaranteedDischarge))
      hits += 1
    }
  })

  if (hits > 0) pushEvent(state, 'hit', `${skill.name} hit ${hits}×`, skill.emoji)
}

/* ------------------------------ player tick ----------------------------- */

function updatePlayer(state, dt, input) {
  const player = state.player
  const weapon = currentWeapon(state)
  const klass = playerClass(state)

  for (const id of Object.keys(player.cooldowns)) {
    if (player.cooldowns[id] > 0) player.cooldowns[id] = Math.max(0, player.cooldowns[id] - dt)
  }
  if (player.buffTimer > 0) {
    player.buffTimer -= dt
    if (player.buffTimer <= 0) {
      player.damageMultiplier = 1
      player.staggerImmune = false
      player.dischargeRadiusMult = 1
    }
  }

  // Momentum stacks decay if you stop connecting.
  if (player.momentum > 0) {
    player.momentumTimer -= dt
    if (player.momentumTimer <= 0) {
      const decay = klass.momentum?.decay ?? 2.2
      player.momentum = Math.max(0, player.momentum - decay * dt * 0.1)
    }
  }

  player.stateTime += dt

  // Respawn grace: tick it down first, then derive `invuln` from it so rolling
  // i-frames and respawn i-frames share one flag.
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt)
  player.invuln = player.invulnTimer > 0

  // Safe zone status drives regen and the HUD badge.
  const safeDist = distanceToSafeZone(player.x, player.z)
  player.inSafeZone = safeDist < SAFE_ZONE.radius

  if (player.state === 'dead') {
    if (player.stateTime > 2.2) {
      player.hp = player.stats.maxHp
      player.stamina = player.stats.maxStamina
      player.x = SAFE_ZONE.x
      player.z = SAFE_ZONE.z - 3
      player.vx = 0
      player.vz = 0
      player.state = 'idle'
      player.stateTime = 0
      player.comboIndex = 0
      player.momentum = 0
      player.invulnTimer = RESPAWN.invulnDuration
      player.invuln = true
      spawnEffect(state, 'respawn', player.x, 0.1, player.z, { duration: 0.9 })
      pushEvent(state, 'respawn', `Revived — invulnerable for ${RESPAWN.invulnDuration}s.`, '✨')
    }
    return
  }

  // ---- weapon switching (only while free) ----
  const requestedWeapon = input.consumeWeapon()
  if (requestedWeapon && WEAPONS[requestedWeapon] && player.weapon !== requestedWeapon) {
    if (player.state === 'idle' || player.state === 'move') {
      player.weapon = requestedWeapon
      player.comboIndex = 0
      spawnEffect(state, 'swap', player.x, 1.0, player.z, { duration: 0.4 })
      pushEvent(state, 'weapon', `Drew ${WEAPONS[requestedWeapon].name}.`, WEAPONS[requestedWeapon].emoji)
    }
  }

  // ---- movement intent in camera space ----
  let inputX = 0
  let inputZ = 0
  if (input.forward) inputZ -= 1
  if (input.back) inputZ += 1
  if (input.left) inputX -= 1
  if (input.right) inputX += 1

  const hasInput = inputX !== 0 || inputZ !== 0
  let dirX = 0
  let dirZ = 0
  if (hasInput) {
    const len = Math.hypot(inputX, inputZ)
    const nx = inputX / len
    const nz = inputZ / len
    const cos = Math.cos(input.cameraAngle)
    const sin = Math.sin(input.cameraAngle)
    // Rotate input by the camera's orbit angle so "up the screen" always maps
    // to "away from the camera," no matter how far you've orbited. The sign
    // here must be the INVERSE of how the camera itself is placed (see
    // GameScene's `desired` vector) — camera position rotates by +angle
    // around the focus point, so movement must rotate by -angle to compensate.
    dirX = nx * cos + nz * sin
    dirZ = -nx * sin + nz * cos
  }

  const busy = player.state === 'attack' || player.state === 'skill' || player.state === 'roll'

  // ---- dodge ----
  const rollCost = PLAYER.rollCost * (1 - (klass.rollDiscount ?? 0))
  if (input.consumeDodge() && player.state !== 'roll' && player.stamina >= rollCost) {
    player.stamina -= rollCost
    player.state = 'roll'
    player.stateTime = 0
    player.comboIndex = 0
    player.activeSkill = null
    if (hasInput) player.facing = Math.atan2(dirX, dirZ)
    player.rollDirX = Math.sin(player.facing)
    player.rollDirZ = Math.cos(player.facing)
    spawnEffect(state, 'dust', player.x, 0.08, player.z, { duration: 0.42 })
  }

  // Input reports a slot letter (Q/E/R/F/C); resolve it against the CURRENT
  // class's kit so switching classes mid-hunt immediately uses the new set.
  const skillSlot = input.consumeSkill()
  if (skillSlot && player.state !== 'roll' && player.state !== 'hit') {
    const skill = skillsForClass(player.classId).find((s) => s.key === skillSlot)
    if (skill) startSkill(state, skill)
  }

  if (input.consumeAttack()) {
    if (player.state === 'idle' || player.state === 'move') {
      player.state = 'attack'
      player.stateTime = 0
      player.comboIndex = 0
      player.swingHits = new Set()
      player.swingFired = false

      // Auto-lock: if nothing is manually locked, swinging near a monster
      // both turns to face it AND engages lock-on for the swing, so combos
      // track the target the same way a manual lock does. Lock releases
      // naturally once you're idle and it wanders out of AUTO_AIM range.
      if (!state.lockedOnId) {
        let best = null
        let bestDist = Infinity
        livingMonsters(state).forEach((monster) => {
          const dist = Math.hypot(monster.x - player.x, monster.z - player.z)
          if (dist > AUTO_AIM.range + monster.def.hitRadius || dist >= bestDist) return
          const toTarget = Math.atan2(monster.x - player.x, monster.z - player.z)
          if (Math.abs(angleDelta(player.facing, toTarget)) > AUTO_AIM.arc / 2) return
          best = monster
          bestDist = dist
        })
        if (best) {
          player.facing = Math.atan2(best.x - player.x, best.z - player.z)
          state.autoLockId = best.id
        }
      }
    } else if (player.state === 'attack') {
      player.comboQueued = true
    }
  }

  // ---- per-state behaviour ----
  if (player.state === 'roll') {
    // Roll i-frames OR respawn grace — either grants invulnerability.
    player.invuln = player.invuln || player.stateTime < PLAYER.rollInvulnEnd
    const t = player.stateTime / PLAYER.rollDuration
    // Ease-out so the roll launches fast and settles.
    const speed = PLAYER.rollSpeed * (1 - t * t * 0.8)
    player.vx = player.rollDirX * speed
    player.vz = player.rollDirZ * speed
    if (player.stateTime >= PLAYER.rollDuration) {
      player.state = 'idle'
      player.stateTime = 0
    }
  } else if (player.state === 'attack') {
    const combo = weapon.combo
    const step = combo[Math.min(player.comboIndex, combo.length - 1)]
    const activeStart = step.windup
    const activeEnd = step.windup + step.active
    const total = activeEnd + step.recover

    if (player.stateTime >= activeStart && player.stateTime <= activeEnd) {
      if (step.fires) {
        if (!player.swingFired) {
          player.swingFired = true
          fireArrow(state, step.power ?? 1)
        }
      } else {
        if (!player.swingFired) {
          player.swingFired = true
          spawnEffect(state, step.vfx, player.x, 1.05, player.z, {
            rotation: player.facing,
            scale: step.reach / 3,
            duration: step.vfx === 'shockBig' ? 0.45 : 0.28,
          })
        }

        const damage = Math.round(step.damage * outgoingMultiplier(state))
        livingMonsters(state).forEach((monster) => {
          if (player.swingHits.has(monster.id)) return
          if (
            inCone(player.x, player.z, player.facing, monster.x, monster.z, step.reach, step.arc, monster.def.hitRadius)
          ) {
            player.swingHits.add(monster.id)

            const before = monster.staggerAccum
            damageMonster(state, monster, damage, step.knock, player.x, player.z)

            // Build momentum (Blademaster) on every connect.
            if (klass.momentum) {
              player.momentum = Math.min(klass.momentum.max, player.momentum + klass.momentum.perHit)
              player.momentumTimer = 1.6
            }

            if (!monster.dead) {
              // Weapon + class stagger modifiers.
              const staggerMult = weapon.staggerMult * (klass.staggerBonus ?? 1)
              monster.staggerAccum = before + damage * staggerMult
              if (monster.staggerAccum >= monster.def.staggerThreshold && monster.state !== 'stagger') {
                monster.staggerAccum = 0
                monster.state = 'stagger'
                monster.stateTime = 0
                spawnEffect(state, 'stagger', monster.x, monsterTopY(monster), monster.z, { duration: 0.8 })
              }
              tryDischarge(state, monster, damage)
            }
          }
        })
      }
    }

    // Forward lunge folded into velocity so it blends with movement physics.
    if (step.lunge && player.stateTime < activeEnd) {
      const push = step.lunge * (1 - player.stateTime / activeEnd)
      player.vx = Math.sin(player.facing) * push
      player.vz = Math.cos(player.facing) * push
    } else {
      player.vx *= 1 - Math.min(1, dt * 12)
      player.vz *= 1 - Math.min(1, dt * 12)
    }

    if (player.stateTime >= total) {
      if (player.comboQueued && player.comboIndex < combo.length - 1) {
        player.comboQueued = false
        player.comboIndex += 1
        player.stateTime = 0
        player.swingHits = new Set()
        player.swingFired = false
      } else {
        player.comboQueued = false
        player.comboIndex = 0
        player.state = 'idle'
        player.stateTime = 0
      }
    }
  } else if (player.state === 'skill') {
    const skill = SKILLS_BY_ID[player.activeSkill]
    if (!skill) {
      player.state = 'idle'
    } else {
      if (player.stateTime >= skill.windup && !player.skillResolved) {
        player.skillResolved = true
        resolveSkillEffect(state, skill)
      }
      player.vx *= 1 - Math.min(1, dt * 10)
      player.vz *= 1 - Math.min(1, dt * 10)
      if (player.stateTime >= skill.duration) {
        player.state = 'idle'
        player.stateTime = 0
        player.activeSkill = null
      }
    }
  } else if (player.state === 'hit') {
    // Knockback decays across the stun.
    player.vx = player.knockX
    player.vz = player.knockZ
    player.knockX *= 1 - Math.min(1, dt * 7)
    player.knockZ *= 1 - Math.min(1, dt * 7)
    if (player.stateTime >= PLAYER.hitStun) {
      player.state = 'idle'
      player.stateTime = 0
      player.knockX = 0
      player.knockZ = 0
    }
  }

  // ---- free movement: accelerate toward the desired velocity ----
  if (!busy && player.state !== 'hit') {
    const wantsSprint = input.sprint && hasInput && player.stamina > 1
    const base = wantsSprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed
    const maxSpeed = base * player.stats.speedMult
    player.sprinting = wantsSprint

    const desiredVx = dirX * maxSpeed
    const desiredVz = dirZ * maxSpeed
    const rate = hasInput ? PLAYER.accel : PLAYER.decel
    const blend = 1 - Math.exp(-rate * dt)
    player.vx += (desiredVx - player.vx) * blend
    player.vz += (desiredVz - player.vz) * blend

    if (hasInput) {
      const targetFacing = Math.atan2(dirX, dirZ)
      player.facing += angleDelta(player.facing, targetFacing) * Math.min(1, dt * PLAYER.turnRate)
      player.state = 'move'
    } else if (player.state === 'move' && Math.hypot(player.vx, player.vz) < 0.4) {
      player.state = 'idle'
    }

    player.moving = hasInput
    if (wantsSprint) player.stamina = Math.max(0, player.stamina - PLAYER.sprintDrain * dt)
  } else {
    player.moving = false
    player.sprinting = false
  }

  // ---- integrate velocity into position, once, for every state ----
  const [nx, nz] = resolveCollision(player.x + player.vx * dt, player.z + player.vz * dt, PLAYER.radius)
  player.x = nx
  player.z = nz
  player.speed = Math.hypot(player.vx, player.vz)

  // Face the locked target through attacks so combos don't whiff. Manual
  // lock-on takes priority; the auto-lock from swing-start is the fallback so
  // a full combo tracks the same monster instead of re-aiming each hit.
  const trackId = state.lockedOnId ?? state.autoLockId
  if (trackId && (player.state === 'attack' || player.state === 'skill')) {
    const target = state.monsters.find((m) => m.id === trackId && !m.dead)
    if (target) {
      const desired = Math.atan2(target.x - player.x, target.z - player.z)
      player.facing += angleDelta(player.facing, desired) * Math.min(1, dt * 8)
    } else if (state.autoLockId === trackId) {
      state.autoLockId = null
    }
  }
  // Auto-lock only lasts for the swing/skill that triggered it.
  if (state.autoLockId && player.state !== 'attack' && player.state !== 'skill') {
    state.autoLockId = null
  }

  // ---- regeneration ----
  if (player.inSafeZone) {
    player.hp = Math.min(player.stats.maxHp, player.hp + SAFE_ZONE.hpRegen * dt)
    player.stamina = Math.min(player.stats.maxStamina, player.stamina + SAFE_ZONE.staminaRegen * dt)
  } else if (!player.sprinting && player.state !== 'roll') {
    player.stamina = Math.min(player.stats.maxStamina, player.stamina + player.stats.staminaRegen * dt)
  }
}

/* ----------------------------- monster tick ----------------------------- */

function updateMonster(state, monster, dt) {
  const player = state.player
  const def = monster.def

  monster.stateTime += dt
  if (monster.hitFlash > 0) monster.hitFlash = Math.max(0, monster.hitFlash - dt)
  if (monster.attackTimer > 0) monster.attackTimer = Math.max(0, monster.attackTimer - dt)
  if (monster.rangedTimer > 0) monster.rangedTimer = Math.max(0, monster.rangedTimer - dt)

  const wantsJaw =
    monster.state === 'attack' ||
    monster.state === 'breath' ||
    monster.state === 'breathWindup' ||
    monster.state === 'alert'
  monster.jawOpen += ((wantsJaw ? 1 : 0) - monster.jawOpen) * Math.min(1, dt * 12)

  if (monster.dead) {
    monster.deadTimer += dt
    return
  }

  // Hard guarantee: a monster is never inside the ward, whatever state it's in.
  // Doing this per-tick (rather than only while pathing) also covers monsters
  // knocked into the zone by heavy attacks.
  {
    const keepOut = SAFE_ZONE.radius + def.hitRadius
    const safeDist = distanceToSafeZone(monster.x, monster.z)
    if (safeDist < keepOut) {
      // atan2(0,0) is 0, which harmlessly ejects along +z if dead centre.
      const ang = Math.atan2(monster.x - SAFE_ZONE.x, monster.z - SAFE_ZONE.z)
      monster.x = SAFE_ZONE.x + Math.sin(ang) * keepOut
      monster.z = SAFE_ZONE.z + Math.cos(ang) * keepOut
    }
  }

  const distToPlayer = Math.hypot(player.x - monster.x, player.z - monster.z)
  // Monsters won't chase into the safe zone, and lose interest if you reach it.
  const playerReachable = player.state !== 'dead' && !player.inSafeZone

  /* ---------------------------- perception ---------------------------- */
  monster.canSee = playerReachable && canPerceive(monster, player)
  if (monster.canSee) {
    monster.memoryTimer = VISION.memory
    monster.lastSeenX = player.x
    monster.lastSeenZ = player.z
  } else if (monster.memoryTimer > 0) {
    monster.memoryTimer = Math.max(0, monster.memoryTimer - dt)
  }

  /* --------------------------- enemy stamina -------------------------- */
  const pool = def.stamina
  if (pool) {
    const calmRegen = pool.calmRegen ?? pool.regen
    if (monster.winded) {
      monster.windedTimer -= dt
      // Resting recovers at the calm rate, which is what ends the opening.
      monster.stamina = Math.min(pool.max, monster.stamina + calmRegen * dt)
      if (monster.windedTimer <= 0 && monster.stamina > pool.max * 0.5) {
        monster.winded = false
      }
    } else {
      // Fighting regen is throttled; disengaging lets them recover properly.
      const rate = monster.aggro ? pool.regen : calmRegen
      monster.stamina = Math.min(pool.max, monster.stamina + rate * dt)
    }
  }

  if (monster.state === 'stagger') {
    if (monster.stateTime >= def.staggerTime) {
      monster.state = monster.memoryTimer > 0 ? 'chase' : 'idle'
      monster.stateTime = 0
    }
    return
  }

  // Winded monsters drop everything and pant — this is the punish window.
  if (monster.winded && monster.state !== 'winded') {
    monster.state = 'winded'
    monster.stateTime = 0
    spawnEffect(state, 'winded', monster.x, monsterTopY(monster), monster.z, {
      scale: def.scale,
      duration: 0.8,
    })
    pushEvent(state, 'winded', `${def.name} is exhausted!`, '💨')
  }

  if (monster.state === 'winded') {
    if (!monster.winded) {
      monster.state = monster.memoryTimer > 0 ? 'chase' : 'idle'
      monster.stateTime = 0
    }
    return
  }

  /* ----------------------------- aggro gate --------------------------- */
  // Aggro now needs actual line of sight, not just proximity.
  if (!monster.aggro && monster.canSee) {
    monster.aggro = true
    monster.state = 'alert'
    monster.stateTime = 0
    spawnEffect(state, 'roar', monster.x, monsterTopY(monster), monster.z, {
      scale: def.scale,
      duration: 0.7,
    })
    pushEvent(state, 'alert', `${def.name} noticed you!`, '❗')
  } else if (monster.aggro && (!playerReachable || distToPlayer > def.loseRange)) {
    monster.aggro = false
    monster.memoryTimer = 0
    monster.state = 'idle'
    monster.stateTime = 0
    monster.staggerAccum = 0
  } else if (monster.aggro && !monster.canSee && monster.memoryTimer <= 0) {
    // Lost the trail: give up and go home.
    monster.aggro = false
    monster.state = 'idle'
    monster.stateTime = 0
    monster.staggerAccum = 0
    pushEvent(state, 'lost', `${def.name} lost your trail.`, '🌫️')
  }

  const moveToward = (tx, tz, speed) => {
    const dx = tx - monster.x
    const dz = tz - monster.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.1) return false

    let nextX = monster.x + (dx / dist) * speed * dt
    let nextZ = monster.z + (dz / dist) * speed * dt

    // Hard block on entering the safe zone.
    const safeDist = distanceToSafeZone(nextX, nextZ)
    const keepOut = SAFE_ZONE.radius + def.hitRadius
    if (safeDist < keepOut) {
      const ang = Math.atan2(nextX - SAFE_ZONE.x, nextZ - SAFE_ZONE.z)
      nextX = SAFE_ZONE.x + Math.sin(ang) * keepOut
      nextZ = SAFE_ZONE.z + Math.cos(ang) * keepOut
    }

    const [cx, cz] = resolveCollision(nextX, nextZ, def.hitRadius)
    monster.x = cx
    monster.z = cz
    monster.facing += angleDelta(monster.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 6)
    return true
  }

  switch (monster.state) {
    case 'idle': {
      if (monster.stateTime > 1.6 + Math.random()) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * monster.patrol
        monster.targetX = monster.den.x + Math.cos(angle) * radius
        monster.targetZ = monster.den.z + Math.sin(angle) * radius
        monster.state = 'patrol'
        monster.stateTime = 0
      }
      break
    }

    case 'patrol': {
      const moved = moveToward(monster.targetX, monster.targetZ, def.moveSpeed)
      if (!moved || monster.stateTime > 6) {
        monster.state = 'idle'
        monster.stateTime = 0
      }
      break
    }

    case 'alert': {
      monster.facing += angleDelta(monster.facing, Math.atan2(player.x - monster.x, player.z - monster.z)) * Math.min(1, dt * 7)
      if (monster.stateTime > 0.8) {
        monster.state = 'chase'
        monster.stateTime = 0
      }
      break
    }

    case 'chase': {
      const ranged = def.ranged
      const staminaLeft = monster.stamina
      const canAfford = (cost) => !pool || staminaLeft >= cost

      const canBreathe =
        ranged &&
        monster.canSee && // don't breathe fire at a wall
        monster.rangedTimer <= 0 &&
        distToPlayer >= ranged.minRange &&
        distToPlayer <= ranged.maxRange &&
        canAfford(pool?.breathCost ?? 0)

      const wantsToStrike =
        monster.canSee && distToPlayer <= def.attackRange && monster.attackTimer <= 0

      if (canBreathe) {
        monster.state = 'breathWindup'
        monster.stateTime = 0
      } else if (wantsToStrike && canAfford(pool?.attackCost ?? 0)) {
        monster.state = 'windup'
        monster.stateTime = 0
        monster.hasHitThisSwing = false
      } else if (wantsToStrike && pool) {
        // In range and ready, but too tired to swing. Pant instead of standing
        // there doing nothing — otherwise a low-stamina monster stalls forever,
        // never spending enough to trip the winded threshold.
        monster.winded = true
        monster.windedTimer = pool.windedTime
      } else if (monster.canSee) {
        moveToward(player.x, player.z, def.chaseSpeed)
      } else {
        // Sight broken: head for where we last saw them, then give up.
        const reached = moveToward(monster.lastSeenX, monster.lastSeenZ, def.chaseSpeed * 0.85)
        if (!reached) {
          monster.state = 'search'
          monster.stateTime = 0
        }
      }
      break
    }

    case 'search': {
      // Sweep around, looking for the lost hunter.
      monster.facing += dt * 1.6
      if (monster.canSee) {
        monster.state = 'chase'
        monster.stateTime = 0
      } else if (monster.memoryTimer <= 0 || monster.stateTime > 3) {
        monster.aggro = false
        monster.state = 'idle'
        monster.stateTime = 0
      }
      break
    }

    case 'breathWindup': {
      const ranged = def.ranged
      monster.facing += angleDelta(monster.facing, Math.atan2(player.x - monster.x, player.z - monster.z)) * Math.min(1, dt * 5)
      if (monster.stateTime >= ranged.windup) {
        monster.state = 'breath'
        monster.stateTime = 0
        monster.shotsLeft = ranged.shots
        monster.shotTimer = 0
        // Breath is the expensive option.
        if (pool) {
          monster.stamina = Math.max(0, monster.stamina - (pool.breathCost ?? pool.attackCost))
          if (monster.stamina <= 0) {
            monster.winded = true
            monster.windedTimer = pool.windedTime
          }
        }
      }
      break
    }

    case 'breath': {
      const ranged = def.ranged
      monster.shotTimer -= dt
      if (monster.shotsLeft > 0 && monster.shotTimer <= 0) {
        monster.shotsLeft -= 1
        monster.shotTimer = 0.16
        const spread = (Math.random() - 0.5) * ranged.spread * 2
        const aim = monster.facing + spread
        const muzzleY = def.model === 'drake' ? 2.6 : 1.6
        spawnProjectile(state, {
          kind: 'fireball',
          owner: 'monster',
          x: monster.x + Math.sin(monster.facing) * def.hitRadius * 1.4,
          y: muzzleY,
          z: monster.z + Math.cos(monster.facing) * def.hitRadius * 1.4,
          vx: Math.sin(aim) * ranged.speed,
          vz: Math.cos(aim) * ranged.speed,
          damage: ranged.damage,
          radius: ranged.radius,
          life: ranged.life,
        })
        spawnEffect(
          state,
          'muzzleFire',
          monster.x + Math.sin(monster.facing) * def.hitRadius * 1.5,
          muzzleY,
          monster.z + Math.cos(monster.facing) * def.hitRadius * 1.5,
          { rotation: monster.facing, scale: def.scale, duration: 0.22 },
        )
      }
      if (monster.shotsLeft <= 0 && monster.stateTime > 0.5) {
        monster.state = 'recover'
        monster.stateTime = 0
        monster.rangedTimer = ranged.cooldown
      }
      break
    }

    case 'windup': {
      monster.facing += angleDelta(monster.facing, Math.atan2(player.x - monster.x, player.z - monster.z)) * Math.min(1, dt * 4)
      if (monster.stateTime >= def.windup) {
        monster.state = 'attack'
        monster.stateTime = 0
        // Commit the stamina on the swing, not the decision to swing.
        if (pool) {
          monster.stamina = Math.max(0, monster.stamina - pool.attackCost)
          if (monster.stamina <= 0) {
            monster.winded = true
            monster.windedTimer = pool.windedTime
          }
        }
      }
      break
    }

    case 'attack': {
      moveToward(
        monster.x + Math.sin(monster.facing) * 2,
        monster.z + Math.cos(monster.facing) * 2,
        def.chaseSpeed * 0.9,
      )
      if (!monster.hasHitThisSwing) {
        if (inCone(monster.x, monster.z, monster.facing, player.x, player.z, def.attackRange + 0.7, 1.9, PLAYER.radius)) {
          monster.hasHitThisSwing = true
          damagePlayer(state, def.damage, monster.x, monster.z)
        }
      }
      if (monster.stateTime >= def.active) {
        monster.state = 'recover'
        monster.stateTime = 0
        monster.attackTimer = def.attackCooldown
      }
      break
    }

    case 'recover': {
      if (monster.stateTime >= def.recover) {
        monster.state = monster.aggro ? 'chase' : 'idle'
        monster.stateTime = 0
      }
      break
    }

    default:
      monster.state = 'idle'
  }
}

/* ---------------------------- projectile tick ---------------------------- */

function updateProjectiles(state, dt) {
  const player = state.player

  state.projectiles.forEach((projectile) => {
    if (projectile.dead) return
    projectile.t += dt
    projectile.x += projectile.vx * dt
    projectile.z += projectile.vz * dt
    if (projectile.vy) projectile.y += projectile.vy * dt

    if (projectile.kind === 'meteor') {
      if (projectile.y <= 0.2) {
        projectile.dead = true
        spawnEffect(state, 'explosion', projectile.x, 0.3, projectile.z, {
          scale: projectile.radius,
          duration: 0.85,
        })
        state.shake = 1.4
        state.hitstop = Math.max(state.hitstop, PLAYER.hitstopOnUltimate)
        livingMonsters(state).forEach((monster) => {
          const dist = Math.hypot(monster.x - projectile.x, monster.z - projectile.z)
          if (dist <= projectile.radius + monster.def.hitRadius) {
            damageMonster(state, monster, projectile.damage, projectile.knock, projectile.x, projectile.z, 'ultimate')
          }
        })
        pushEvent(state, 'ult', 'Dragon Meteor impact!', '☄️')
      }
      return
    }

    if (projectile.t >= projectile.life) {
      projectile.dead = true
      return
    }

    if (Math.abs(projectile.x) > MAP_BOUND || Math.abs(projectile.z) > MAP_BOUND) {
      projectile.dead = true
      return
    }
    for (const obstacle of OBSTACLES) {
      if (Math.hypot(projectile.x - obstacle.x, projectile.z - obstacle.z) < obstacle.r) {
        projectile.dead = true
        spawnEffect(state, 'impact', projectile.x, projectile.y, projectile.z, { duration: 0.25 })
        return
      }
    }

    if (projectile.owner === 'player') {
      for (const monster of livingMonsters(state)) {
        if (Math.hypot(projectile.x - monster.x, projectile.z - monster.z) < projectile.radius + monster.def.hitRadius) {
          projectile.dead = true
          damageMonster(state, monster, projectile.damage, projectile.knock, projectile.x, projectile.z)
          return
        }
      }
    } else if (player.state !== 'dead') {
      // Fireballs fizzle harmlessly against the safe zone boundary.
      if (distanceToSafeZone(projectile.x, projectile.z) < SAFE_ZONE.radius) {
        projectile.dead = true
        spawnEffect(state, 'wardHit', projectile.x, projectile.y, projectile.z, { duration: 0.4 })
        return
      }
      if (Math.hypot(projectile.x - player.x, projectile.z - player.z) < projectile.radius + PLAYER.radius) {
        projectile.dead = true
        if (projectile.kind === 'fireball') {
          spawnEffect(state, 'explosion', projectile.x, 0.4, projectile.z, { scale: 1.4, duration: 0.5 })
        }
        damagePlayer(state, projectile.damage, projectile.x, projectile.z)
      }
    }
  })

  state.projectiles = state.projectiles.filter((p) => !p.dead)
}

/* ------------------------------ pickup tick ------------------------------ */

function updatePickups(state, dt) {
  const player = state.player
  if (player.state === 'dead') return

  state.pickups.forEach((pickup) => {
    if (pickup.collected) return
    pickup.t += dt

    const dx = player.x - pickup.x
    const dz = player.z - pickup.z
    const dist = Math.hypot(dx, dz)

    // Drift toward the hunter once they're close — makes collecting feel good
    // without demanding pixel-accurate walking.
    if (dist < PICKUP_MAGNET_RADIUS && dist > 0.01) {
      const pull = (1 - dist / PICKUP_MAGNET_RADIUS) * 9 * dt
      pickup.x += (dx / dist) * pull
      pickup.z += (dz / dist) * pull
    }

    if (dist < PICKUP_COLLECT_RADIUS) {
      pickup.collected = true
      const def = pickup.def
      player.collected[pickup.type] = (player.collected[pickup.type] ?? 0) + 1

      if (def.kind === 'heal') {
        const before = player.hp
        player.hp = Math.min(player.stats.maxHp, player.hp + def.amount)
        const healed = Math.round(player.hp - before)
        spawnDamageNumber(state, player.x, 1.7, player.z, healed > 0 ? healed : 0, 'heal')
        spawnEffect(state, 'heal', player.x, 0.1, player.z, { duration: 0.6 })
        pushEvent(state, 'pickup', `${def.name} — +${healed} HP`, def.emoji)
      } else if (def.kind === 'stamina') {
        player.stamina = Math.min(player.stats.maxStamina, player.stamina + def.amount)
        spawnEffect(state, 'pickupFlash', player.x, 0.8, player.z, { duration: 0.45 })
        pushEvent(state, 'pickup', `${def.name} — stamina restored`, def.emoji)
      } else if (def.kind === 'buff') {
        player.buffTimer = Math.max(player.buffTimer, def.duration)
        player.damageMultiplier = Math.max(player.damageMultiplier, def.multiplier)
        spawnEffect(state, 'buff', player.x, 0.1, player.z, { duration: 0.8 })
        pushEvent(state, 'pickup', `${def.name} — damage up!`, def.emoji)
      } else {
        state.rewards.push(def.name)
        spawnEffect(state, 'pickupFlash', player.x, 0.8, player.z, { duration: 0.45 })
        pushEvent(state, 'pickup', `Collected ${def.name}`, def.emoji)
      }
    }
  })

  // Drop anything collected or expired.
  state.pickups = state.pickups.filter((p) => !p.collected && p.t < PICKUP_LIFETIME)
}

/* ---------------------------- multiplayer sync --------------------------- */

export function applyMonsterSnapshot(state, snapshot) {
  if (!snapshot) return

  snapshot.monsters?.forEach((incoming) => {
    const monster = state.monsters.find((m) => m.id === incoming.i)
    if (!monster) return

    monster.netTargetX = incoming.x
    monster.netTargetZ = incoming.z
    monster.netTargetFacing = incoming.f
    monster.state = incoming.s
    monster.stateTime = incoming.st
    monster.hp = incoming.h
    monster.aggro = incoming.a === 1
    monster.jawOpen = incoming.j

    const nowDead = incoming.d === 1
    if (nowDead && !monster.dead) {
      spawnEffect(state, 'slayBurst', monster.x, monsterTopY(monster) * 0.5, monster.z, {
        scale: monster.def.scale * 2,
        duration: 0.9,
      })
      pushEvent(state, 'slay', `${monster.def.name} slain!`, '🏆')
    }
    monster.dead = nowDead
    monster.deadTimer = incoming.dt
  })

  if (snapshot.quest) {
    const incomingIndex = snapshot.quest.i ?? 0
    // The host moved on to a new quest — rebuild the matching definition
    // locally rather than trying to patch the old objectives list in place.
    if (incomingIndex !== state.questIndex || !state.quest) {
      state.questIndex = incomingIndex
      state.quest = makeQuestFromChain(incomingIndex)
      if (state.quest) {
        pushEvent(state, 'newQuest', `New quest: ${state.quest.title.replace('Hunt: ', '')}`, '📖')
      }
    }

    if (state.quest) {
      snapshot.quest.o?.forEach((killed, index) => {
        if (state.quest.objectives[index]) state.quest.objectives[index].killed = killed
      })
      const complete = snapshot.quest.c === 1
      if (complete && !state.quest.complete) {
        pushEvent(state, 'quest', `Quest complete: ${state.quest.title.replace('Hunt: ', '')}!`, '📜')
      }
      state.quest.complete = complete
    }

    const chainDone = snapshot.quest.done === 1
    if (chainDone && !state.chainComplete) {
      pushEvent(state, 'chainComplete', 'All quests complete! Open your Guild Card.', '🏆')
    }
    state.chainComplete = chainDone
    if (snapshot.quest.r) state.rewards = snapshot.quest.r
  }
}

export function applyRemoteHit(state, hit) {
  if (!state.isHost) return
  const monster = state.monsters.find((m) => m.id === hit.monsterId)
  if (!monster || monster.dead) return
  damageMonster(state, monster, hit.damage, hit.knock, hit.x, hit.z, hit.flavour ?? 'normal')
}

function interpolateMonster(monster, dt) {
  if (monster.netTargetX === undefined) return
  const ease = 1 - Math.exp(-11 * dt)
  monster.x += (monster.netTargetX - monster.x) * ease
  monster.z += (monster.netTargetZ - monster.z) * ease

  let diff = monster.netTargetFacing - monster.facing
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  monster.facing += diff * ease

  if (monster.dead) monster.deadTimer += dt
}

/* ------------------------------ main update ----------------------------- */

export function updateGame(state, rawDt, input) {
  if (!state.started || state.paused) return

  const realDt = Math.min(rawDt, 0.04)

  // Hitstop: run the sim at a crawl for a few frames so impacts register.
  let dt = realDt
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - realDt)
    dt = realDt * 0.12
  }

  state.time += dt

  if (input.consumeLockOn()) {
    const candidates = livingMonsters(state)
      .map((m) => ({ id: m.id, dist: Math.hypot(m.x - state.player.x, m.z - state.player.z) }))
      .filter((c) => c.dist < 30)
      .sort((a, b) => a.dist - b.dist)

    if (candidates.length === 0) {
      state.lockedOnId = null
    } else {
      const currentIndex = candidates.findIndex((c) => c.id === state.lockedOnId)
      state.lockedOnId = candidates[(currentIndex + 1) % candidates.length].id
    }
  }

  if (state.lockedOnId) {
    const target = state.monsters.find((m) => m.id === state.lockedOnId)
    if (!target || target.dead) state.lockedOnId = null
  }

  updatePlayer(state, dt, input)

  if (state.online && !state.isHost) {
    state.monsters.forEach((monster) => {
      monster.hitFlash = Math.max(0, monster.hitFlash - dt)
      interpolateMonster(monster, dt)
    })
  } else {
    state.monsters.forEach((monster) => updateMonster(state, monster, dt))
  }

  updateProjectiles(state, dt)
  updatePickups(state, dt)

  state.effects.forEach((effect) => {
    effect.t += dt
  })
  state.effects = state.effects.filter((effect) => effect.t < effect.duration)

  state.damageNumbers.forEach((number) => {
    number.t += dt
  })
  state.damageNumbers = state.damageNumbers.filter((n) => n.t < n.duration)

  // Shake decays on real time so hitstop doesn't stretch it out.
  if (state.shake > 0) state.shake = Math.max(0, state.shake - realDt * 2.6)
}

/** Flat snapshot for the HUD. Called on a timer, not every frame. */
export function readSnapshot(state) {
  const player = state.player
  const locked = state.lockedOnId ? state.monsters.find((m) => m.id === state.lockedOnId) : null

  const engaged =
    locked ??
    state.monsters
      .filter((m) => !m.dead && m.aggro)
      .map((m) => ({ m, d: Math.hypot(m.x - player.x, m.z - player.z) }))
      .sort((a, b) => a.d - b.d)[0]?.m ??
    null

  const level = player.progress.level
  const needed = xpToNext(level)

  return {
    classId: player.classId,
    hp: Math.round(player.hp),
    maxHp: player.stats.maxHp,
    stamina: Math.round(player.stamina),
    maxStamina: player.stats.maxStamina,
    state: player.state,
    weapon: player.weapon,
    buffTimer: player.buffTimer,
    momentum: player.momentum,
    inSafeZone: player.inSafeZone,
    invulnTimer: player.invulnTimer,
    collected: { ...player.collected },
    cooldowns: { ...player.cooldowns },
    comboIndex: player.comboIndex,
    comboLength: (WEAPONS[player.weapon] ?? WEAPONS.greatsword).combo.length,
    attacking: player.state === 'attack',
    playerPos: { x: player.x, z: player.z },
    level,
    xp: player.progress.xp,
    xpNeeded: Number.isFinite(needed) ? needed : 0,
    maxLevel: level >= MAX_LEVEL,
    pendingLevelUps: player.pendingLevelUps,
    lockedOnId: state.lockedOnId,
    engaged: engaged
      ? {
          id: engaged.id,
          name: engaged.def.name,
          rank: engaged.def.rank,
          hp: Math.round(engaged.hp),
          maxHp: engaged.def.maxHp,
          state: engaged.state,
          stamina: Math.round(engaged.stamina),
          maxStamina: engaged.def.stamina?.max ?? 0,
          winded: engaged.winded,
          canSee: engaged.canSee,
        }
      : null,
    monsters: state.monsters.map((m) => ({
      id: m.id,
      species: m.species,
      x: m.x,
      z: m.z,
      dead: m.dead,
      aggro: m.aggro,
    })),
    quest: state.quest
      ? {
          title: state.quest.title,
          blurb: state.quest.blurb,
          complete: state.quest.complete,
          objectives: state.quest.objectives.map((o) => ({ ...o, name: MONSTERS[o.species].name })),
        }
      : null,
    questNumber: state.questIndex + 1,
    questTotal: MAX_QUESTS,
    chainComplete: state.chainComplete,
    rewards: [...state.rewards],
    events: state.events.filter((event) => state.time - event.t < EVENT_TTL).slice(-4),
  }
}
