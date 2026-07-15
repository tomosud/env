import { ThreeElements, useThree } from "@react-three/fiber";
import {
  ForwardedRef,
  ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import {
  MeshBVHOptions,
  SAH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

type StableBvhProps = Omit<ThreeElements["group"], "ref"> & {
  children: ReactNode;
  enabled?: boolean;
  firstHitOnly?: boolean;
  rebuildKey?: unknown;
  strategy?: MeshBVHOptions["strategy"];
  verbose?: boolean;
  setBoundingBox?: boolean;
  maxDepth?: number;
  maxLeafTris?: number;
};

function StableBvhImpl(
  {
    children,
    enabled = true,
    firstHitOnly = false,
    rebuildKey,
    strategy = SAH,
    verbose = false,
    setBoundingBox = true,
    maxDepth = 40,
    maxLeafTris = 10,
    ...groupProps
  }: StableBvhProps,
  forwardedRef: ForwardedRef<THREE.Group>
) {
  const groupRef = useRef<THREE.Group>(null!);
  const raycaster = useThree((state) => state.raycaster);

  useImperativeHandle(forwardedRef, () => groupRef.current, []);

  useEffect(() => {
    if (!enabled || !groupRef.current) {
      return;
    }

    raycaster.firstHitOnly = firstHitOnly;
    const options: MeshBVHOptions = {
      strategy,
      verbose,
      setBoundingBox,
      maxDepth,
      maxLeafTris,
    };

    groupRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const geometry = child.geometry;
      if (!geometry.boundsTree) {
        geometry.computeBoundsTree = computeBoundsTree;
        geometry.disposeBoundsTree = disposeBoundsTree;
        geometry.computeBoundsTree(options);
      }

      // Reuse the cached tree across React renders and StrictMode's effect
      // replay. The GLTF cache owns these geometries for the page lifetime.
      child.raycast = acceleratedRaycast;
    });

    return () => {
      delete raycaster.firstHitOnly;
      // Intentionally keep geometry.boundsTree. Disposing here would make
      // StrictMode and later remounts rebuild the same static model.
    };
  }, [
    enabled,
    firstHitOnly,
    maxDepth,
    maxLeafTris,
    raycaster,
    rebuildKey,
    setBoundingBox,
    strategy,
    verbose,
  ]);

  return (
    <group ref={groupRef} {...groupProps}>
      {children}
    </group>
  );
}

export const StableBvh = forwardRef(StableBvhImpl);
