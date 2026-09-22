import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const vector = new THREE.Vector3()

/**
 * Projects damage numbers from world space onto pooled DOM nodes.
 * Writes styles directly (no React state) so numbers stay smooth at 60fps.
 * `nodesRef` holds the span elements rendered by the HUD layer.
 */
function DamageNumbers({ game, nodesRef }) {
  const { camera, size } = useThree()

  useFrame(() => {
    const nodes = nodesRef.current
    if (!nodes) return

    let index = 0
    game.damageNumbers.forEach((number) => {
      const node = nodes[index]
      if (!node) return
      index += 1

      const progress = number.t / number.duration
      // Rise and drift as it fades.
      vector.set(
        number.x + number.driftX * progress,
        number.y + progress * 1.7,
        number.z,
      )
      vector.project(camera)

      // Behind the camera — skip.
      if (vector.z > 1) {
        node.style.opacity = '0'
        return
      }

      const screenX = (vector.x * 0.5 + 0.5) * size.width
      const screenY = (-vector.y * 0.5 + 0.5) * size.height

      const scale =
        number.flavour === 'ultimate' ? 1.75 : number.flavour === 'skill' ? 1.3 : 1
      const pop = progress < 0.15 ? 0.6 + (progress / 0.15) * 0.55 : 1.15 - progress * 0.15

      node.textContent = number.value
      node.style.opacity = String(Math.max(0, 1 - progress * 1.25))
      node.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px) scale(${scale * pop})`
      node.dataset.flavour = number.flavour
    })

    for (let i = index; i < nodes.length; i += 1) {
      if (nodes[i]) nodes[i].style.opacity = '0'
    }
  })

  return null
}

export default DamageNumbers
