/**
 * Headless check of the combat/progression systems.
 * Drives the real game state with synthetic input, no renderer involved.
 *
 *   node server/sim-test.mjs
 */
import {
  createGameState,
  updateGame,
  readSnapshot,
  distanceToSafeZone,
  hasLineOfSight,
} from '../src/game/gameState.js'
import { SAFE_ZONE, PLAYER, OBSTACLES, RESPAWN } from '../src/game/constants.js'
import { xpToNext } from '../src/game/progression.js'
import { CLASSES } from '../src/data/classes.js'
import { PICKUPS } from '../src/data/pickups.js'

let failures = 0
const check = (label, condition, extra = '') => {
  if (!condition) failures += 1
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}${extra ? ` (${extra})` : ''}`)
}

/**
 * Mirrors the queue semantics of the real useHunterInput hook: one-shot actions
 * are counted/queued and drained exactly once each via consumeX().
 */
function makeInput(overrides = {}) {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    cameraAngle: 0,
    cameraZoom: 1,
    rotateLeft: false,
    rotateRight: false,
    _attacks: 0,
    _dodges: 0,
    _skills: [],
    _weapons: [],
    _lockOns: 0,
    consumeAttack() { if (this._attacks <= 0) return false; this._attacks -= 1; return true },
    consumeDodge() { if (this._dodges <= 0) return false; this._dodges -= 1; return true },
    consumeSkill() { return this._skills.length ? this._skills.shift() : null },
    consumeWeapon() { return this._weapons.length ? this._weapons.shift() : null },
    consumeLockOn() { if (this._lockOns <= 0) return false; this._lockOns -= 1; return true },
    ...overrides,
  }
}

/** Convenience: a neutral input with nothing pressed. */
const input0 = () => makeInput()

const step = (game, input, seconds, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i += 1) updateGame(game, dt, input)
}

console.log('\n--- class + level stats ---')
{
  const g1 = createGameState({ classId: 'vanguard', level: 1, xp: 0 })
  const g2 = createGameState({ classId: 'blademaster', level: 1, xp: 0 })
  check('vanguard has more HP than blademaster', g1.player.stats.maxHp > g2.player.stats.maxHp,
    `${g1.player.stats.maxHp} vs ${g2.player.stats.maxHp}`)
  check('blademaster is faster', g2.player.stats.speedMult > g1.player.stats.speedMult)
  check('vanguard takes less damage', g1.player.stats.defenceMult < g2.player.stats.defenceMult)
  check('class sets starting weapon', g2.player.weapon === CLASSES.blademaster.weapon)

  const leveled = createGameState({ classId: 'vanguard', level: 10, xp: 0 })
  check('level 10 has more HP than level 1', leveled.player.stats.maxHp > g1.player.stats.maxHp,
    `${leveled.player.stats.maxHp} vs ${g1.player.stats.maxHp}`)
  check('level 10 hits harder', leveled.player.stats.damageMult > g1.player.stats.damageMult)
}

console.log('\n--- safe zone ---')
{
  const game = createGameState({ classId: 'vanguard', level: 1 })
  game.started = true
  const input = makeInput()

  check('spawns inside safe zone', distanceToSafeZone(game.player.x, game.player.z) < SAFE_ZONE.radius)

  // Wound the hunter, then confirm the ward heals them.
  game.player.hp = 50
  step(game, input, 1.0)
  check('safe zone regenerates HP', game.player.hp > 50, `hp=${Math.round(game.player.hp)}`)
  check('safe zone flag is set', game.player.inSafeZone === true)

  // Damage is refused entirely inside the ward.
  const before = game.player.hp
  const monster = game.monsters[0]
  monster.x = game.player.x + 1
  monster.z = game.player.z
  monster.state = 'attack'
  monster.stateTime = 0
  monster.hasHitThisSwing = false
  step(game, input, 0.3)
  check('no damage taken inside safe zone', game.player.hp >= before - 0.01)

  // Monsters are pushed back out of the ward.
  const m = game.monsters[1]
  m.aggro = true
  m.state = 'chase'
  m.x = SAFE_ZONE.x
  m.z = SAFE_ZONE.z + 2
  step(game, input, 0.5)
  check('monster kept out of safe zone',
    distanceToSafeZone(m.x, m.z) >= SAFE_ZONE.radius - 0.01,
    `dist=${distanceToSafeZone(m.x, m.z).toFixed(2)}`)
}

console.log('\n--- movement smoothing ---')
{
  const game = createGameState({ classId: 'warden', level: 1 })
  game.started = true
  game.player.x = 0
  game.player.z = 0
  const input = makeInput({ forward: true })

  updateGame(game, 1 / 60, input)
  const speedAfterOneFrame = game.player.speed
  step(game, input, 1.0)
  const speedAtCruise = game.player.speed

  check('does not reach full speed instantly', speedAfterOneFrame < speedAtCruise * 0.5,
    `${speedAfterOneFrame.toFixed(2)} vs ${speedAtCruise.toFixed(2)}`)
  check('accelerates to a cruise speed', speedAtCruise > 3, `${speedAtCruise.toFixed(2)}`)

  // Release input and confirm it decelerates rather than stopping dead.
  input.forward = false
  updateGame(game, 1 / 60, input)
  check('decelerates smoothly', game.player.speed > 0.5 && game.player.speed < speedAtCruise,
    `${game.player.speed.toFixed(2)}`)
  step(game, input, 1.0)
  check('eventually comes to rest', game.player.speed < 0.3, `${game.player.speed.toFixed(2)}`)
}

console.log('\n--- hitstop + combat ---')
{
  const game = createGameState({ classId: 'vanguard', level: 1 })
  game.started = true
  game.player.x = 0
  game.player.z = 0
  game.player.facing = 0
  game.player.facing = 0

  const monster = game.monsters[0]
  monster.x = 0
  monster.z = 2
  const hpBefore = monster.hp

  const input = makeInput()
  input._attacks = 3

  // Hitstop is deliberately brief, so sample the peak across the swing rather
  // than reading the value once the window has already decayed.
  let peakHitstop = 0
  let peakShake = 0
  for (let i = 0; i < 27; i += 1) {
    updateGame(game, 1 / 60, input)
    peakHitstop = Math.max(peakHitstop, game.hitstop)
    peakShake = Math.max(peakShake, game.shake)
  }

  check('melee swing damages monster', monster.hp < hpBefore, `${hpBefore} -> ${monster.hp}`)
  check('hit triggers hitstop', peakHitstop > 0, `peak=${peakHitstop.toFixed(3)}s`)
  check('hit triggers camera shake', peakShake > 0, `peak=${peakShake.toFixed(2)}`)
  check('hitstop decays back to zero', game.hitstop === 0)
  check('hit spawns damage number', game.damageNumbers.length > 0)
  check('hit spawns impact effect', game.effects.some((e) => e.kind === 'impact'))
}

console.log('\n--- XP and level up ---')
{
  const game = createGameState({ classId: 'vanguard', level: 1, xp: 0 })
  game.started = true
  const hpBefore = game.player.stats.maxHp

  // Give enough XP to guarantee at least one level.
  const needed = xpToNext(1)
  const drake = game.monsters.find((m) => m.species === 'drake')
  drake.hp = 1
  game.player.progress.xp = needed // next kill must level us
  game.player.inSafeZone = false
  drake.x = 0
  drake.z = 2
  game.player.x = 0
  game.player.z = 0
  game.player.facing = 0 // face +z, where the drake is

  const input = makeInput()
  input._attacks = 3
  step(game, input, 0.6)

  check('monster died', drake.dead === true)
  check('gained a level', game.player.progress.level > 1, `level=${game.player.progress.level}`)
  check('max HP increased on level up', game.player.stats.maxHp > hpBefore,
    `${hpBefore} -> ${game.player.stats.maxHp}`)
  check('level-up VFX spawned', game.effects.some((e) => e.kind === 'levelUp'))
  check('pendingLevelUps flagged for save', game.player.pendingLevelUps > 0)
}

console.log('\n--- stormcaller discharge passive ---')
{
  const game = createGameState({ classId: 'stormcaller', level: 8 })
  game.started = true
  game.player.x = 0
  game.player.z = 0
  game.player.facing = 0
  game.player.inSafeZone = false

  // Two monsters close together: hitting one should chain to the other.
  const [a, b] = game.monsters
  a.x = 0; a.z = 2
  b.x = 1.5; b.z = 3
  const bHp = b.hp

  const input = makeInput()
  input._attacks = 3
  step(game, input, 0.7)

  check('discharge chained to nearby monster', b.hp < bHp, `${bHp} -> ${b.hp}`)
  check('lightning VFX spawned', game.effects.some((e) => e.kind === 'lightning'))
}

console.log('\n--- blademaster momentum ---')
{
  const game = createGameState({ classId: 'blademaster', level: 1 })
  game.started = true
  game.player.x = 0
  game.player.z = 0
  game.player.facing = 0
  game.player.facing = 0
  const monster = game.monsters[0]
  monster.x = 0
  monster.z = 1.5

  const input = makeInput()
  input._attacks = 3
  step(game, input, 0.3)
  check('momentum builds on hit', game.player.momentum > 0, `${game.player.momentum.toFixed(2)}`)
}

console.log('\n--- snapshot shape for HUD ---')
{
  const game = createGameState({ classId: 'warden', level: 4, xp: 20 })
  const snap = readSnapshot(game)
  check('snapshot exposes class', snap.classId === 'warden')
  check('snapshot exposes level', snap.level === 4)
  check('snapshot exposes xp target', snap.xpNeeded > 0)
  check('snapshot exposes safe zone flag', typeof snap.inSafeZone === 'boolean')
  check('snapshot exposes momentum', typeof snap.momentum === 'number')
}

console.log('\n--- line of sight ---')
{
  // OBSTACLES[0] is at (-14, -8) with radius 3.2.
  const blocker = OBSTACLES[0]
  const clear = hasLineOfSight(0, 0, 5, 5)
  check('clear ground has line of sight', clear === true)

  // Straight through the middle of the cliff.
  const throughRock = hasLineOfSight(
    blocker.x - 8, blocker.z,
    blocker.x + 8, blocker.z,
  )
  check('cliff blocks line of sight', throughRock === false)

  // Passing well to the side of it should be fine.
  const besideRock = hasLineOfSight(
    blocker.x - 8, blocker.z + blocker.r + 4,
    blocker.x + 8, blocker.z + blocker.r + 4,
  )
  check('path beside the cliff is clear', besideRock === true)

  // A monster hidden behind a cliff must not aggro.
  const game = createGameState({ classId: 'vanguard', level: 1 })
  game.started = true
  const monster = game.monsters[0]
  monster.aggro = false
  monster.memoryTimer = 0
  // Put monster and player on opposite sides of the blocker, within detect range.
  monster.x = blocker.x - (blocker.r + 1.5)
  monster.z = blocker.z
  monster.facing = Math.PI / 2 // looking toward +x, i.e. at the player
  game.player.x = blocker.x + (blocker.r + 1.5)
  game.player.z = blocker.z
  game.player.inSafeZone = false

  const input = makeInput()
  step(game, input, 0.5)
  check('monster does not aggro through a cliff', monster.aggro === false)

  // Now move the player into the open, in front of the monster.
  game.player.x = monster.x + 4
  game.player.z = monster.z + 4
  monster.facing = Math.atan2(4, 4)
  step(game, input, 0.4)
  check('monster aggros with clear sight', monster.aggro === true)
}

console.log('\n--- enemy stamina / winded ---')
{
  const game = createGameState({ classId: 'vanguard', level: 1 })
  game.started = true
  const monster = game.monsters[0]
  const pool = monster.def.stamina
  check('monster starts with full stamina', monster.stamina === pool.max)

  // Force repeated attacks to drain the pool.
  game.player.x = monster.x
  game.player.z = monster.z + 1.5
  game.player.inSafeZone = false
  monster.aggro = true
  monster.state = 'chase'
  monster.facing = Math.atan2(0, 1)

  const input = makeInput()
  let sawWinded = false
  // Pin BOTH positions every frame. Letting the monster move creates a chase
  // feedback loop (it follows the player, who is pinned relative to it) that
  // walks the pair across the map and into the safe zone, where they de-aggro.
  const anchorX = monster.x
  const anchorZ = monster.z
  for (let i = 0; i < 60 * 25; i += 1) {
    monster.x = anchorX
    monster.z = anchorZ
    game.player.x = anchorX
    game.player.z = anchorZ + 1.5
    game.player.hp = game.player.stats.maxHp // survive the beating
    updateGame(game, 1 / 60, input)
    if (monster.winded) { sawWinded = true; break }
  }
  check('monster eventually runs out of stamina', sawWinded, `stamina=${Math.round(monster.stamina)}`)

  // The flag is raised during chase; the state transition (and its VFX/event)
  // is owned by a single handler that runs at the top of the next tick.
  monster.x = anchorX
  monster.z = anchorZ
  updateGame(game, 1 / 60, input)
  check('winded monster enters the winded state', monster.state === 'winded',
    `state=${monster.state}`)

  // And recovers afterwards, once left alone.
  for (let i = 0; i < 60 * 12; i += 1) {
    monster.x = anchorX
    monster.z = anchorZ
    updateGame(game, 1 / 60, input)
  }
  check('monster recovers from winded', monster.winded === false,
    `stamina=${Math.round(monster.stamina)}`)
}

console.log('\n--- drops / pickups ---')
{
  const game = createGameState({ classId: 'vanguard', level: 1 })
  game.started = true
  game.player.x = 0
  game.player.z = 0
  game.player.facing = 0
  game.player.inSafeZone = false

  const monster = game.monsters[0]
  monster.x = 0
  monster.z = 2
  monster.hp = 1

  const input = makeInput()
  input._attacks = 1
  step(game, input, 0.6)

  check('slain monster died', monster.dead === true)

  // Drop *positions* are randomised, so whether the magnet grabs one inside the
  // step window is not deterministic. The invariant that always holds is that a
  // material exists — either still on the ground or already in the satchel.
  const materialOnGround = game.pickups.some((p) => p.type === 'material')
  const materialCollected = game.player.collected.material >= 1
  check('slain monster yielded a material', materialOnGround || materialCollected,
    `ground=${materialOnGround} collected=${game.player.collected.material}`)
  // The carve reward is granted on death, so this part IS deterministic.
  check('carve reward granted on death', game.quest.rewards.includes(monster.def.reward))

  // A drop far from the hunter must persist rather than being auto-collected.
  game.pickups.length = 0
  game.pickups.push({
    id: 'far', type: 'material', def: PICKUPS.material,
    x: game.player.x + 14, z: game.player.z + 14, y: 0.45, bob: 0, t: 0, collected: false,
  })
  step(game, input, 0.4)
  check('distant drop is not collected', game.pickups.length === 1)

  // Now one right at our feet: should heal and vanish.
  game.pickups.length = 0
  game.player.hp = 50
  const potionsBefore = game.player.collected.healthPotion
  game.pickups.push({
    id: 'near', type: 'healthPotion', def: PICKUPS.healthPotion,
    x: game.player.x + 0.4, z: game.player.z, y: 0.45, bob: 0, t: 0, collected: false,
  })
  step(game, input, 0.2)
  check('walking over a potion heals', game.player.hp > 50, `hp=${Math.round(game.player.hp)}`)
  check('collected potion is removed', game.pickups.length === 0)
  check('satchel tally increments', game.player.collected.healthPotion === potionsBefore + 1)
}

console.log('\n--- respawn invincibility ---')
{
  const game = createGameState({ classId: 'blademaster', level: 1 })
  game.started = true
  game.player.inSafeZone = false
  game.player.x = 0
  game.player.z = 0

  // Let the real AI land the killing blow. Setting monster.state directly
  // doesn't work: the aggro gate re-enters 'alert' on the next tick.
  const monster = game.monsters[0]
  monster.x = 0
  monster.z = 1.4
  monster.aggro = true
  monster.state = 'chase'
  monster.facing = Math.PI // look back toward the player at -z

  const idle = input0()
  let died = false
  for (let i = 0; i < 60 * 6; i += 1) {
    game.player.hp = 1 // stay one hit from death
    updateGame(game, 1 / 60, idle)
    if (game.player.state === 'dead') { died = true; break }
  }
  check('hunter can die', died, `state=${game.player.state}`)

  // Wait out the death animation into the respawn.
  step(game, idle, 2.6)
  check('hunter respawns', game.player.state !== 'dead')
  check('respawn grants invulnerability', game.player.invulnTimer > 0,
    `timer=${game.player.invulnTimer.toFixed(2)}`)
  check('invuln flag is set', game.player.invuln === true)

  // Damage during grace does nothing. Drag the hunter out of the safe zone
  // first, otherwise the ward (not the grace period) is what's protecting them.
  game.player.x = 0
  game.player.z = 0
  const hpAfterRespawn = game.player.hp
  const m2 = game.monsters[1]
  m2.x = 0
  m2.z = 1.4
  m2.aggro = true
  m2.state = 'chase'
  m2.facing = Math.PI

  const graceFrames = Math.floor(60 * Math.min(1.5, RESPAWN.invulnDuration - 0.5))
  for (let i = 0; i < graceFrames; i += 1) {
    updateGame(game, 1 / 60, idle)
    game.player.x = 0
    game.player.z = 0
  }
  check('still invulnerable mid-grace', game.player.invulnTimer > 0)
  check('no damage during respawn grace', game.player.hp >= hpAfterRespawn - 0.01,
    `hp=${Math.round(game.player.hp)}`)

  // Grace expires.
  step(game, idle, RESPAWN.invulnDuration + 0.5)
  check('invulnerability expires', game.player.invulnTimer === 0)
  check('invuln flag clears', game.player.invuln === false)
}

console.log('\n--- input queue ---')
{
  const input = makeInput()
  // The real hook exposes press* helpers; emulate the queue semantics here.
  let attacks = 0
  input._attacks = 2
  while (input.consumeAttack()) attacks += 1
  check('queued attacks drain exactly once each', attacks === 2)
  check('empty queue returns false', input.consumeAttack() === false)
}

console.log('')
console.log(failures === 0 ? 'ALL SIM CHECKS PASSED' : `${failures} SIM CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
