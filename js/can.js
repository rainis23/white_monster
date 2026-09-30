// The can: "White Monster 3D Scan" by Laser Design (CC-BY-4.0), converted for
// the web by tools/can/convert.py. One geometry and texture serve both the can
// on the projector and the one in her hand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyReveal } from './reveal.js';

export const CAN_HEIGHT = 2.885; // on the projector, in scene units
export const CAN_REAL_HEIGHT = 0.1575; // the scan, in metres

export async function loadCanAsset({ manager, small = false, anisotropy = 8 }) {
  const [gltf, map] = await Promise.all([
    new GLTFLoader(manager).loadAsync('models/can/can.glb'),
    new THREE.TextureLoader(manager).loadAsync(small ? 'models/can/can_2k.jpg' : 'models/can/can_4k.jpg'),
  ]);
  map.flipY = false; // glTF UV convention
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = anisotropy;
  let geometry = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh) geometry = o.geometry;
  });
  return { geometry, map };
}

// A can standing on its base at the origin, `height` tall, logo facing +z.
export function createCan(asset, { reveal, height = CAN_HEIGHT }) {
  // the scan's colours already carry the print and the brushed aluminium, so
  // the material only adds a lacquer shine on top
  const material = new THREE.MeshPhysicalMaterial({
    map: asset.map,
    roughness: 0.42,
    metalness: 0.25,
    clearcoat: 0.8,
    clearcoatRoughness: 0.14,
  });
  applyReveal(material, reveal);
  const can = new THREE.Mesh(asset.geometry, material);
  can.name = 'can';
  can.scale.setScalar(height / CAN_REAL_HEIGHT);
  return can;
}
