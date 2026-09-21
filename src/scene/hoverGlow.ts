import * as THREE from 'three'

// Hover outline for landmarks: an inverted hull in the accent (International Orange, --orange in styles.css) with a
// band of hot light sweeping diagonally through world space. A second, wider and translucent hull is the glow.
export const shimmer = { uTime: { value: 0 }, uHot: { value: new THREE.Color('#ffc492') } }
export const hullMaterial = (opts: THREE.MeshBasicMaterialParameters) => {
  const m = new THREE.MeshBasicMaterial({ color: '#f04a00', side: THREE.BackSide, ...opts })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shimmer)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShimmerPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShimmerPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uHot;\nvarying vec3 vShimmerPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float band = sin(dot(vShimmerPos, vec3(1.0, 1.6, 1.0)) * 1.7 - uTime * 3.4);
        float breath = 0.5 + 0.5 * sin(uTime * 2.1);
        diffuseColor.rgb = mix(diffuseColor.rgb, uHot, smoothstep(0.5, 1.0, band) * 0.85 + breath * 0.08);
        diffuseColor.a *= 0.75 + 0.25 * breath;`,
      )
  }
  return m
}
