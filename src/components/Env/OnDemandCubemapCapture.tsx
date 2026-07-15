import { useFrame, useThree } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { RefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { environmentRenderStateAtom } from "../../store";

type CubeCaptureHandle = {
  camera: THREE.CubeCamera;
};

type OnDemandCubemapCaptureProps = {
  cameraRef?: RefObject<CubeCaptureHandle>;
};

const CAPTURE_INTERVAL_MS = 1000 / 30;

/** Runs inside an Environment/RenderCubeTexture portal. */
export function OnDemandCubemapCapture({
  cameraRef,
}: OnDemandCubemapCaptureProps) {
  const environmentState = useAtomValue(environmentRenderStateAtom);
  const invalidate = useThree((state) => state.invalidate);
  const pendingRef = useRef(true);
  const lastCaptureRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    pendingRef.current = true;

    const invalidateNow = () => {
      timerRef.current = null;
      invalidate();
    };
    const remaining =
      CAPTURE_INTERVAL_MS - (performance.now() - lastCaptureRef.current);

    if (remaining <= 0) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      invalidateNow();
    } else if (timerRef.current === null) {
      timerRef.current = window.setTimeout(invalidateNow, remaining);
    }
  }, [environmentState, invalidate]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  useFrame((state) => {
    if (!pendingRef.current) {
      return;
    }

    // Pointer events and controls can independently wake a demand Canvas.
    // Do not let those frames bypass the capture throttle.
    if (performance.now() - lastCaptureRef.current < CAPTURE_INTERVAL_MS) {
      return;
    }

    const camera =
      cameraRef?.current?.camera ??
      (state.scene.children.find(
        (child) => child instanceof THREE.CubeCamera
      ) as THREE.CubeCamera | undefined);

    if (!camera) {
      invalidate();
      return;
    }

    pendingRef.current = false;
    lastCaptureRef.current = performance.now();
    camera.update(state.gl, state.scene);
  }, -1);

  return null;
}
