import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LAVA_GLSL, shimmer } from './hoverGlow'

/**
 * The hovered landmark's outline, drawn in screen space: a rim of constant width just outside the model's silhouette, only
 * where the model ends against whatever is behind it, never across its own faces. (Inverted hulls per part did this for a
 * single tower, but a complex of parts showed each part's hull through the gaps, and the invisible hull-only boxes stood
 * as orange walls round the whole huddle.)
 *
 * Each frame something is hovered: (1) the landmark's meshes, on their own layer, are drawn into `seed` with their depth,
 * behind the terrain's depth (OCCLUDER_LAYER), so a hill's or a building's base sunk into the ground doesn't count as edge;
 * (2) a jump flood spreads, to every pixel within reach, the offset to the nearest silhouette pixel (offsets are integers,
 * stored +1024 in half floats, 0 = none yet); (3) a full-screen quad, drawn last in the main pass, paints the pixels between
 * 0.5 and RIM px from the silhouette at the depth of that nearest silhouette pixel, so the scene's depth test hides the rim
 * wherever a building stands in front of the model, and the lava blobs sit at the world point that depth gives. The rim is
 * pulled LIFT rim-widths (in metres at that depth) toward the camera first: a hill sunk into the terrain (Bernal, Twin Peaks)
 * ends flush with the ground, and without the pull the ground and the houses at its foot covered its sides.
 */
export const OUTLINE_LAYER = 5
export const OCCLUDER_LAYER = 6
export const hoverOutline: { target: THREE.Object3D | null; blob: number } = { target: null, blob: 1.75 }

/** Puts a landmark's meshes on the outline layer (or takes them off). Thin lines (Line2) are left out: they aren't meshes
 * the seed material can draw, and a rim round a cable is noise. */
export function markOutline(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || (o as { isLine2?: boolean }).isLine2 || (o as { isLineSegments2?: boolean }).isLineSegments2) return
    if (on) o.layers.enable(OUTLINE_LAYER)
    else o.layers.disable(OUTLINE_LAYER)
  })
}

const RIM = 6 // CSS px
const LIFT = 4

const fullScreen = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`

const seedMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(1024.0, 1024.0, 0.0, 1.0); }`,
  side: THREE.DoubleSide,
})

const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false })

const floodMaterial = new THREE.ShaderMaterial({
  uniforms: { uSrc: { value: null }, uStep: { value: 1 }, uRes: { value: new THREE.Vector2() } },
  vertexShader: fullScreen,
  fragmentShader: /* glsl */ `
    uniform sampler2D uSrc;
    uniform float uStep;
    uniform vec2 uRes;
    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 best = vec2(0.0);
      float bd = 1e9;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 q = p + vec2(float(x), float(y)) * uStep;
        if (q.x < 0.0 || q.y < 0.0 || q.x > uRes.x || q.y > uRes.y) continue;
        vec2 s = texture2D(uSrc, q / uRes).xy;
        if (s.x < 1.0) continue;
        vec2 off = q + s - 1024.0 - p;
        float d = dot(off, off);
        if (d < bd) { bd = d; best = off; }
      }
      gl_FragColor = vec4(bd < 1e9 ? best + 1024.0 : vec2(0.0), 0.0, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
})

export function HoverOutline() {
  const gl = useThree((s) => s.gl)
  const { quad, quadScene, quadCamera, composite, targets } = useMemo(() => {
    const opts = { type: THREE.HalfFloatType, format: THREE.RGFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }
    const seed = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: true, depthTexture: new THREE.DepthTexture(1, 1) })
    const targets = { seed, a: new THREE.WebGLRenderTarget(1, 1, opts), b: new THREE.WebGLRenderTarget(1, 1, opts) }
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), floodMaterial)
    quad.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(quad)
    const composite = new THREE.ShaderMaterial({
      uniforms: {
        ...shimmer,
        uFlood: { value: null },
        uDepth: { value: seed.depthTexture },
        uRes: { value: new THREE.Vector2() },
        uRim: { value: RIM },
        uBlob: { value: 1 },
        uBase: { value: new THREE.Color('#f04a00') },
        uLift: { value: LIFT },
        uPx: { value: 0 },
        uProj: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
      },
      vertexShader: fullScreen,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFlood;
        uniform sampler2D uDepth;
        uniform vec2 uRes;
        uniform float uRim;
        uniform float uBlob;
        uniform float uTime;
        uniform vec3 uBase;
        uniform vec3 uHot;
        uniform float uLift;
        uniform float uPx;
        uniform mat4 uProj;
        uniform mat4 uInvProj;
        uniform mat4 uCamWorld;
        ${LAVA_GLSL}
        void main() {
          vec2 p = gl_FragCoord.xy;
          vec2 s = texture2D(uFlood, p / uRes).xy;
          if (s.x < 1.0) discard;
          vec2 off = s - 1024.0;
          float d = length(off);
          if (d < 0.5 || d > uRim + 0.5) discard;
          float z = texture2D(uDepth, (p + off) / uRes).r;
          vec4 view = uInvProj * vec4(p / uRes * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
          view.xyz /= view.w;
          vec3 world = (uCamWorld * vec4(view.xyz, 1.0)).xyz;
          // uPx: a pixel's size at unit distance, so this is LIFT rim-widths in world units at the edge's depth
          float lift = uLift * uRim * uPx * -view.z;
          vec4 clip = uProj * vec4(view.xyz * max(0.0, 1.0 - lift / length(view.xyz)), 1.0);
          gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
          gl_FragColor = vec4(mix(uBase, uHot, lavaBlobs(world * uBlob, uTime) * 0.85), 1.0 - smoothstep(uRim - 1.0, uRim + 0.5, d));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    })
    return { quad, quadScene, quadCamera: new THREE.OrthographicCamera(), composite, targets }
  }, [])
  useEffect(() => () => {
    Object.values(targets).forEach((t) => t.dispose())
    composite.dispose()
    quad.geometry.dispose()
  }, [targets, composite, quad])

  const size = useMemo(() => new THREE.Vector2(), [])
  const clear = useMemo(() => new THREE.Color(), [])
  const rim = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite)
    m.frustumCulled = false
    m.renderOrder = 1000
    m.raycast = () => null
    return m
  }, [composite])

  useFrame(({ scene, camera }) => {
    const target = hoverOutline.target
    rim.visible = !!target
    if (!target) return
    gl.getDrawingBufferSize(size)
    const w = Math.max(1, size.x), h = Math.max(1, size.y)
    if (targets.seed.width !== w || targets.seed.height !== h) Object.values(targets).forEach((t) => t.setSize(w, h))

    const prev = { rt: gl.getRenderTarget(), alpha: gl.getClearAlpha(), layers: camera.layers.mask, bg: scene.background, override: scene.overrideMaterial }
    gl.getClearColor(clear)
    camera.updateMatrixWorld()
    // (1) the silhouette, alone on its layer but behind the ground
    gl.setClearColor(0x000000, 0)
    scene.background = null
    gl.setRenderTarget(targets.seed)
    gl.clear(true, true, false)
    const autoClear = gl.autoClear
    gl.autoClear = false
    scene.overrideMaterial = depthOnly
    camera.layers.set(OCCLUDER_LAYER)
    gl.render(scene, camera)
    scene.overrideMaterial = seedMaterial
    camera.layers.set(OUTLINE_LAYER)
    gl.render(scene, camera)
    gl.autoClear = autoClear
    camera.layers.mask = prev.layers
    scene.overrideMaterial = prev.override
    scene.background = prev.bg
    // (2) jump flood: steps of half the reach down to 1, then one more 1 to mop up its rare misses
    const reach = Math.ceil(RIM * gl.getPixelRatio()) + 1
    floodMaterial.uniforms.uRes.value.set(w, h)
    let src = targets.seed, dst = targets.a
    const steps: number[] = []
    for (let s = 2 ** Math.ceil(Math.log2(reach)) / 2; s >= 1; s /= 2) steps.push(s)
    steps.push(1)
    for (const s of steps) {
      floodMaterial.uniforms.uSrc.value = src.texture
      floodMaterial.uniforms.uStep.value = s
      gl.setRenderTarget(dst)
      gl.render(quadScene, quadCamera)
      src = dst
      dst = dst === targets.a ? targets.b : targets.a
    }
    gl.setRenderTarget(prev.rt)
    gl.setClearColor(clear, prev.alpha)
    // (3) the rim, drawn by the main pass
    const u = composite.uniforms
    u.uFlood.value = src.texture
    u.uRes.value.set(w, h)
    u.uRim.value = RIM * gl.getPixelRatio()
    u.uBlob.value = 1 / hoverOutline.blob
    u.uPx.value = 2 / (camera.projectionMatrix.elements[5] * h)
    u.uProj.value.copy(camera.projectionMatrix)
    u.uInvProj.value.copy(camera.projectionMatrixInverse)
    u.uCamWorld.value.copy(camera.matrixWorld)
  })

  return <primitive object={rim} />
}
