import * as THREE from 'three'

// The hover outline's look: the accent (International Orange, --orange in styles.css) with pale blobs of hot light drifting
// over it like a lava lamp, in world space so they run across a model without a seam. `LAVA_GLSL` is shared with the models'
// screen-space outline (HoverOutline.tsx); `hullMaterial` paints it on the park outlines' ribbons.
export const shimmer = { uTime: { value: 0 }, uHot: { value: new THREE.Color('#ffc492') } }

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
export const LAVA_GLSL = `
vec3 lavaMod(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lavaMod(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lavaPermute(vec4 x) { return lavaMod(((x * 34.0) + 1.0) * x); }
float lavaNoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - 0.5;
  i = lavaMod(i);
  vec4 p = lavaPermute(lavaPermute(lavaPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec4 j = p - 49.0 * floor(p * (1.0 / 49.0));
  vec4 x_ = floor(j * (1.0 / 7.0));
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = (x_ * 2.0 + 0.5) / 7.0 - 1.0;
  vec4 y = (y_ * 2.0 + 0.5) / 7.0 - 1.0;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 g0 = vec3(a0.xy, h.x), g1 = vec3(a0.zw, h.y), g2 = vec3(a1.xy, h.z), g3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(g0, g0), dot(g1, g1), dot(g2, g2), dot(g3, g3)));
  g0 *= norm.x; g1 *= norm.y; g2 *= norm.z; g3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3)));
}
// two layers of noise drifting upward at different speeds (and the finer one sideways): where their sum crosses the
// threshold is a blob's edge, so blobs swell, pinch off and run together as the layers slide past each other. q is the
// world position over the blob spacing; returns 0 (accent) to 1 (blob)
float lavaBlobs(vec3 q, float t) {
  float lava = lavaNoise(q * vec3(1.0, 0.7, 1.0) - vec3(0.0, t * 0.22, t * 0.05)) * 0.7
             + lavaNoise(q * 1.7 + vec3(t * 0.11, -t * 0.37, 0.0)) * 0.3;
  float edge = fwidth(lava) * 0.75 + 0.01;
  return smoothstep(0.2 - edge, 0.2 + edge, lava);
}
`

// `blob` is the blobs' spacing in world units: small landmarks pass a short one so several blobs drift over them instead
// of one blob as big as the whole model (the program is shared, the spacing is a uniform per material)
export const hullMaterial = (opts: THREE.MeshBasicMaterialParameters, blob = 1.75) => {
  const m = new THREE.MeshBasicMaterial({ color: '#f04a00', side: THREE.BackSide, ...opts })
  const uBlob = { value: 1 / blob }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shimmer, { uBlob })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShimmerPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShimmerPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uBlob;\nuniform vec3 uHot;\nvarying vec3 vShimmerPos;\n' + LAVA_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uHot, lavaBlobs(vShimmerPos * uBlob, uTime) * 0.85);`,
      )
  }
  return m
}
