import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import type { World } from '../lib/world'
import { Terrain } from './Terrain'
import { Water } from './Water'
import { Buildings } from './Buildings'
import { Transit } from './Transit'
import { Landmarks } from './Landmarks'
import { Companies } from './Companies'
import { QuestRoute } from './QuestRoute'
import { CameraRig } from './CameraRig'
import { DevStats } from './DevStats'
import { useStore } from '../store'

export const SKY = '#dbe6ee'

export function Scene({ world }: { world: World }) {
  const select = useStore((s) => s.select)
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 42, near: 0.5, far: 2500 }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping }}
      onPointerMissed={() => select(null)}
      style={{ background: SKY }}
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 320, 1500]} />
      <hemisphereLight args={['#fdfbf5', '#a89a80', 1.15]} />
      <directionalLight position={[-220, 380, 160]} intensity={1.9} color="#fff4e0" />
      <directionalLight position={[300, 120, -200]} intensity={0.35} color="#cfe3ff" />
      <Terrain world={world} />
      <Water />
      <Buildings world={world} />
      <Transit world={world} />
      <Landmarks world={world} />
      <Companies world={world} />
      <QuestRoute world={world} />
      <CameraRig world={world} />
      {import.meta.env.DEV && <DevStats />}
    </Canvas>
  )
}
