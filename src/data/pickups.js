/**
 * Things monsters leave behind. Collected by walking over them — no key press,
 * which keeps the control surface small and the loop fast.
 */
export const PICKUPS = {
  healthPotion: {
    id: 'healthPotion',
    name: 'Health Potion',
    emoji: '🧪',
    kind: 'heal',
    amount: 45,
    color: '#6ee7a8',
    glow: '#2fae72',
  },
  staminaTonic: {
    id: 'staminaTonic',
    name: 'Stamina Tonic',
    emoji: '⚡',
    kind: 'stamina',
    amount: 55,
    color: '#fbbf24',
    glow: '#d99a0b',
  },
  rageShard: {
    id: 'rageShard',
    name: 'Rage Shard',
    emoji: '🔥',
    kind: 'buff',
    multiplier: 1.35,
    duration: 8,
    color: '#ff8a3c',
    glow: '#e2521a',
  },
  material: {
    id: 'material',
    name: 'Monster Material',
    emoji: '💎',
    kind: 'material',
    color: '#a78bfa',
    glow: '#7c4ddb',
  },
}

export const PICKUP_MAGNET_RADIUS = 2.6 // starts drifting toward you here
export const PICKUP_COLLECT_RADIUS = 0.95
export const PICKUP_LIFETIME = 45 // seconds before it fades out
