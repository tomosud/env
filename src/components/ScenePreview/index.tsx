import { BoltIcon } from "@heroicons/react/24/solid";
import { Environment, PerformanceMonitor } from "@react-three/drei";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { useAtomValue, useSetAtom } from "jotai";
import { PointerEvent, Suspense, useCallback } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import {
  isLightPaintingAtom,
  modelUrlAtom,
  pointerAtom,
  updateSelectedLightsPlacementAtom,
} from "../../store";
import {
  ENV_CAPTURE_FAR,
  ENV_CAPTURE_NEAR,
  ENV_PREVIEW_CAPTURE_RESOLUTION,
  sphericalToLatLon,
} from "../../utils/coordinates";
import { Env } from "../Env";
import { InvalidateOnEnvironmentChange } from "../Env/InvalidateOnEnvironmentChange";
import { OnDemandCubemapCapture } from "../Env/OnDemandCubemapCapture";
import { Model } from "../Model";
import { Cameras } from "./Cameras";
import { Controls } from "./Controls";
import { Debug } from "./Debug";
import { Lights } from "./Lights";
import { StableBvh } from "./StableBvh";

const plusZ = new THREE.Vector3(0, 0, 1);
const spherical = new THREE.Spherical();

export function ScenePreview() {
  const updateSelectedLightsPlacement = useSetAtom(
    updateSelectedLightsPlacementAtom
  );
  const isLightPainting = useAtomValue(isLightPaintingAtom);
  const modelUrl = useAtomValue(modelUrlAtom);

  const handleModelClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      if (!isLightPainting) {
        return;
      }

      const cameraPosition = e.camera.position.clone();
      const point = e.point.clone();
      const normal =
        e.face?.normal?.clone()?.transformDirection(e.object.matrixWorld) ??
        plusZ;

      // Reflect the camera position across the normal so that the
      // light is visible in the reflection.
      const cameraToPoint = point.clone().sub(cameraPosition).normalize();
      const reflected = cameraToPoint.reflect(normal);

      spherical.setFromVector3(reflected);

      const latlon = sphericalToLatLon(spherical);

      const { x, y, z } = point;
      updateSelectedLightsPlacement({
        target: { x, y, z },
        latlon,
      });
    },
    [updateSelectedLightsPlacement, isLightPainting]
  );

  const setPointer = useSetAtom(pointerAtom);
  const handleModelPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      if (!isLightPainting) {
        return;
      }

      const point = e.point.clone();
      const normal =
        e.face?.normal?.clone()?.transformDirection(e.object.matrixWorld) ??
        plusZ;

      setPointer({ point, normal });
    },
    [setPointer, isLightPainting]
  );

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop="demand"
      gl={{
        preserveDrawingBuffer: true, // for screenshot
        logarithmicDepthBuffer: true,
        antialias: true,
      }}
      style={{ touchAction: "none" }}
    >
      <PerformanceMonitor
        threshold={0.3}
        factor={0.1}
        flipflops={3}
        onFallback={() => {
          toast("Switching to low performance mode", {
            description:
              "This will reduce the quality of the preview, but will improve performance.",
            icon: <BoltIcon className="w-4 h-4" />,
          });
        }}
      >
        <InvalidateOnEnvironmentChange />
        <Cameras />
        <Lights ambientLightIntensity={0.2} />

        <Suspense fallback={null}>
          <StableBvh firstHitOnly rebuildKey={modelUrl}>
            <Model
              debugMaterial={false}
              onClick={handleModelClick}
              onPointerMove={handleModelPointerMove}
            />
          </StableBvh>
        </Suspense>

        <Suspense fallback={null}>
          <Environment
            resolution={ENV_PREVIEW_CAPTURE_RESOLUTION}
            far={ENV_CAPTURE_FAR}
            near={ENV_CAPTURE_NEAR}
            frames={0}
            background
          >
            <Env />
            <OnDemandCubemapCapture />
          </Environment>
        </Suspense>

        {/* <Effects /> */}

        <Debug />

        <Controls autoRotate={false} />
      </PerformanceMonitor>
    </Canvas>
  );
}
