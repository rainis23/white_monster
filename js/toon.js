// A small MToon-style cel shader for the avatar: two-tone lighting with a
// tinted shade colour, a crisp rim light, an optional toon specular band, and
// inverted-hull outlines. It includes the reveal effect and supports vertex
// sway for hair, skirts and anything else built with an aT (0 root -> 1 tip)
// attribute.
import * as THREE from 'three';
import { REVEAL_PARS, REVEAL_DISCARD, REVEAL_SEAM } from './reveal.js';

// shared by every toon material; main.js keeps these in sync with the key light
export const toonLight = {
  uLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() }, // view space, pointing at the light
  uLightColor: { value: new THREE.Color(1, 0.97, 0.95) },
  uAmbient: { value: new THREE.Color(0.19, 0.16, 0.25) },
  uTime: { value: 0 },
};

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying vec3 vRevealWorld;
  uniform mat3 uUvTransform;
  #ifdef SWAY
    attribute float aT;
    attribute float aPhase;
    uniform float uTime;
    uniform float uSway;
  #endif
  #ifdef OUTLINE
    uniform float uOutline;
  #endif

  void main() {
    vec3 transformed = position;
    vec3 objectNormal = normal;
    #ifdef SWAY
      float swayK = aT * aT * uSway;
      transformed.x += sin( uTime * 1.3 + aPhase ) * 0.03 * swayK;
      transformed.z += sin( uTime * 0.9 + aPhase * 1.7 ) * 0.02 * swayK;
    #endif
    vec4 local = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      objectNormal = mat3( instanceMatrix ) * objectNormal;
    #endif
    vec4 world = modelMatrix * local;
    vec4 mvPosition = viewMatrix * world;
    vec3 n = normalize( normalMatrix * objectNormal );
    #ifdef OUTLINE
      // thickness roughly constant on screen, but never absurd up close or far away
      mvPosition.xyz += n * uOutline * clamp( -mvPosition.z, 2.0, 14.0 );
    #endif
    vRevealWorld = world.xyz;
    vNormalV = n;
    vViewPos = -mvPosition.xyz;
    vUv = ( uUvTransform * vec3( uv, 1.0 ) ).xy;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  ${REVEAL_PARS}
  uniform vec3 uColor;
  uniform float uOpacity;
  #ifdef USE_TOON_MAP
    uniform sampler2D uMap;
  #endif
  #ifndef OUTLINE
    uniform vec3 uShade;
    uniform vec3 uLightDir;
    uniform vec3 uLightColor;
    uniform vec3 uAmbient;
    uniform float uShadeShift;
    uniform float uShadeSoft;
    uniform vec3 uRimColor;
    uniform float uRimWidth;
    uniform vec3 uEmissive;
    uniform float uSpec;
    uniform float uSpecSize;
    uniform float uAlphaTest;
  #endif
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec2 vUv;

  void main() {
    ${REVEAL_DISCARD}
    #ifdef OUTLINE
      gl_FragColor = vec4( uColor, uOpacity );
    #else
      vec4 base = vec4( uColor, uOpacity );
      #ifdef USE_TOON_MAP
        base *= texture2D( uMap, vUv );
      #endif
      if ( base.a < uAlphaTest ) discard;

      vec3 N = normalize( vNormalV );
      N = gl_FrontFacing ? N : -N;
      vec3 V = normalize( vViewPos );
      float ndl = dot( N, uLightDir );
      float lit = smoothstep( uShadeShift - uShadeSoft, uShadeShift + uShadeSoft, ndl );
      vec3 col = mix( base.rgb * uShade, base.rgb, lit ) * uLightColor + base.rgb * uAmbient;

      float fres = 1.0 - clamp( dot( N, V ), 0.0, 1.0 );
      col += uRimColor * smoothstep( 1.0 - uRimWidth, 1.0 - uRimWidth + 0.12, fres ) * ( 0.35 + 0.65 * lit );

      float nh = dot( N, normalize( uLightDir + V ) );
      col += uLightColor * uSpec * smoothstep( 1.0 - uSpecSize, 1.0 - uSpecSize + 0.012, nh );
      col += uEmissive;
      gl_FragColor = vec4( col, base.a );
    #endif
    ${REVEAL_SEAM}
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const color = (c) => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c));

export function toonMaterial(opts, reveal) {
  const {
    color: base = 0xffffff,
    shade = [0.72, 0.62, 0.8],
    map = null,
    shadeShift = 0.02,
    shadeSoft = 0.05,
    rim = 0x9a7bff,
    rimStrength = 0.35,
    rimWidth = 0.32,
    emissive = 0x000000,
    emissiveStrength = 1,
    spec = 0,
    specSize = 0.05,
    sway = null,
    side = THREE.FrontSide,
    transparent = false,
    depthWrite = true,
    alphaTest = 0,
    opacity = 1,
  } = opts;

  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uColor: { value: color(base) },
    uOpacity: { value: opacity },
    uMap: { value: map },
    uUvTransform: { value: new THREE.Matrix3() },
    uShade: { value: new THREE.Color(...shade) },
    uShadeShift: { value: shadeShift },
    uShadeSoft: { value: shadeSoft },
    uRimColor: { value: color(rim).multiplyScalar(rimStrength) },
    uRimWidth: { value: rimWidth },
    uEmissive: { value: color(emissive).multiplyScalar(emissiveStrength) },
    uSpec: { value: spec },
    uSpecSize: { value: specSize },
    uAlphaTest: { value: alphaTest },
    uLightDir: toonLight.uLightDir,
    uLightColor: toonLight.uLightColor,
    uAmbient: toonLight.uAmbient,
    uTime: toonLight.uTime,
    uSway: sway || { value: 0 },
    ...reveal,
  };
  if (map) {
    map.updateMatrix();
    uniforms.uUvTransform.value.copy(map.matrix);
  }
  const defines = {};
  if (map) defines.USE_TOON_MAP = '';
  if (sway) defines.SWAY = '';

  const material = new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader,
    fragmentShader,
    fog: true,
    side,
    transparent,
    depthWrite,
  });
  material.userData.toon = true;
  return material;
}

export function outlineMaterial({ color: c = 0x1a1224, width = 0.0011, sway = null } = {}, reveal) {
  const defines = { OUTLINE: '' };
  if (sway) defines.SWAY = '';
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: color(c) },
      uOpacity: { value: 1 },
      uOutline: { value: width },
      uUvTransform: { value: new THREE.Matrix3() },
      uTime: toonLight.uTime,
      uSway: sway || { value: 0 },
      ...reveal,
    },
    defines,
    vertexShader,
    fragmentShader,
    fog: true,
    side: THREE.BackSide,
  });
}

// Inverted-hull outline that follows the mesh (and its sway) exactly.
export function addOutline(mesh, material) {
  const hull = new THREE.Mesh(mesh.geometry, material);
  hull.userData.sample = false;
  hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}
