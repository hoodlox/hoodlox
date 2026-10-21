// Ground sampling shared by animals and the player: cast a ray straight down and accept the hit only
// when the first thing struck is floor, so nothing stands on (or under) a mountain or rock.
import * as THREE from 'three';

const down = new THREE.Vector3(0, -1, 0);
const ray = new THREE.Raycaster();

export function groundProbe(floor, blockers) {
  const isFloor = new Set(floor);
  const all = floor.concat(blockers);
  return (x, z) => {
    ray.set(new THREE.Vector3(x, 1e6, z), down);
    const hit = ray.intersectObjects(all, false);
    return hit.length && isFloor.has(hit[0].object) ? hit[0].point.y : null;
  };
}
