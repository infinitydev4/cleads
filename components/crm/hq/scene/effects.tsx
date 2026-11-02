"use client"

import { memo, useEffect, useMemo } from "react"
import { useThree } from "@react-three/fiber"
import { Environment, Lightformer, SoftShadows } from "@react-three/drei"
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"
import * as THREE from "three"
import { useHq } from "../store"
import { PALETTE } from "./materials"

/**
 * The look of the scene: studio light for reflections (rendered once, locally: no HDR file to download), soft shadows,
 * ambient occlusion, bloom on the neon, filmic tone mapping and a light vignette. In light mode (slow device) ambient
 * occlusion and soft shadows step aside.
 */

/** Soft studio light, a warm key and a faint lime bounce: rendered once into a small cube map. */
const Studio = memo(function Studio({ intensity }: { intensity: number }) {
  return (
    <Environment frames={1} resolution={256} environmentIntensity={intensity}>
      <Lightformer form="rect" intensity={2.4} color="#ffffff" scale={[60, 60, 1]} position={[0, 40, 0]} rotation-x={Math.PI / 2} />
      <Lightformer form="rect" intensity={1.2} color="#fff1dc" scale={[40, 14, 1]} position={[34, 12, 34]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.6} color="#dfe6ff" scale={[40, 14, 1]} position={[-34, 10, 20]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={0.8} color={PALETTE.neon} scale={10} position={[-26, 6, -26]} target={[0, 0, 0]} />
    </Environment>
  )
})

/** Sets the scene's sky and fog; kept out of the component because it writes to the three.js scene. */
function paintSky(scene: THREE.Scene, texture: THREE.Texture, horizon: string) {
  scene.background = texture
  scene.fog = new THREE.Fog(horizon, 95, 230)
}

/** The sky as a vertical gradient behind everything, and a fog of the same colour that melts the horizon into it. */
function Sky() {
  const scene = useThree((s) => s.scene)
  const top = useHq((s) => s.light.backgroundTop)
  const bottom = useHq((s) => s.light.backgroundBottom)
  const texture = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = 4
    c.height = 256
    const g = c.getContext("2d")!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, top)
    grad.addColorStop(1, bottom)
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [top, bottom])
  useEffect(() => {
    paintSky(scene, texture, bottom)
    return () => {
      texture.dispose()
    }
  }, [scene, texture, bottom])
  return null
}

export function Look() {
  const lowPower = useHq((s) => s.lowPower)
  const night = useHq((s) => s.light.night)
  // Rounded so the cube map is not re-rendered for every tiny change of the evening light.
  const envIntensity = Math.round((0.5 * (1 - night) + 0.18 * night) * 20) / 20
  const bloom = <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.15} intensity={0.65 + 0.95 * night} radius={0.75} />
  const vignette = <Vignette offset={0.3} darkness={0.32 + 0.18 * night} />
  return (
    <>
      <Sky />
      <Studio intensity={envIntensity} />
      {!lowPower && <SoftShadows size={16} samples={12} focus={0.45} />}
      {/* Two complete chains rather than a conditional effect: a missing child breaks the composer's pass. */}
      {lowPower ? (
        <EffectComposer key="light" multisampling={0}>
          {bloom}
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
          {vignette}
        </EffectComposer>
      ) : (
        <EffectComposer key="full" multisampling={0}>
          <N8AO halfRes aoRadius={1.2} distanceFalloff={0.7} intensity={2} color="#11182b" quality="performance" />
          {bloom}
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
          {vignette}
        </EffectComposer>
      )}
    </>
  )
}
