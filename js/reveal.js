// "Hologram print" effect shared by every material in the scene.
// Fragments above uReveal (world y, with a little noise) are discarded, and a
// glowing seam is drawn right at the cut. uGlow washes the whole object in the
// seam colour, which is how the can "charges up" before it transforms.
import * as THREE from 'three';

export function makeReveal() {
  return {
    uReveal: { value: 1e4 },
    uGlow: { value: 0 },
    uEdgeColor: { value: new THREE.Color(0.86, 0.78, 1.0) },
  };
}

const NOISE = /* glsl */ `
  varying vec3 vRevealWorld;
  uniform float uReveal;
  uniform float uGlow;
  uniform vec3 uEdgeColor;
  float revealHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float revealNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(revealHash(i), revealHash(i + vec3(1, 0, 0)), f.x),
          mix(revealHash(i + vec3(0, 1, 0)), revealHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(revealHash(i + vec3(0, 0, 1)), revealHash(i + vec3(1, 0, 1)), f.x),
          mix(revealHash(i + vec3(0, 1, 1)), revealHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

export function applyReveal(material, uniforms) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();

  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRevealWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 revealWorld = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          revealWorld = instanceMatrix * revealWorld;
        #endif
        vRevealWorld = ( modelMatrix * revealWorld ).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float revealDist = uReveal + ( revealNoise( vRevealWorld * 16.0 ) - 0.5 ) * 0.1 - vRevealWorld.y;
        if ( revealDist < 0.0 ) discard;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float revealSeam = 1.0 - smoothstep( 0.0, 0.08, revealDist );
        gl_FragColor.rgb += uEdgeColor * ( revealSeam * 7.0 + uGlow );`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|reveal`;
  return material;
}
