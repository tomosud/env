import * as THREE from "three";
import { RenderCubeTexture } from "@react-three/drei";
import { ComputeFunction, useFrame, useThree } from "@react-three/fiber";
import { Env } from "../Env";
import { CubeMaterial } from "./CubeMaterial";
import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { envMapTextureAtom, sceneRendererAtom } from "../../store";
import {
  ENV_CAPTURE_FAR,
  ENV_CAPTURE_NEAR,
  ENV_CAPTURE_RESOLUTION,
} from "../../utils/coordinates";

const zero = new THREE.Vector3(0, 0, 0);
const dir = new THREE.Vector3(0, 0, 0);

function getEventOffsets(event: Event) {
  const pointerEvent = event as Event &
    Partial<Pick<MouseEvent, "clientX" | "clientY" | "offsetX" | "offsetY">> & {
      currentTarget?: EventTarget | null;
      target?: EventTarget | null;
    };
  const eventTarget =
    pointerEvent.currentTarget ?? pointerEvent.target ?? undefined;
  const element =
    eventTarget instanceof Element ? (eventTarget as HTMLElement) : undefined;
  const rect = element?.getBoundingClientRect?.();

  if (
    rect &&
    typeof pointerEvent.clientX === "number" &&
    typeof pointerEvent.clientY === "number"
  ) {
    return {
      x: pointerEvent.clientX - rect.left,
      y: pointerEvent.clientY - rect.top,
    };
  }

  return {
    x: pointerEvent.offsetX ?? 0,
    y: pointerEvent.offsetY ?? 0,
  };
}

export function EnvMapPlane() {
  const ref = useRef<THREE.Mesh>(null!);
  const lastTextureRef = useRef<THREE.CubeTexture | null>(null);
  const viewport = useThree((state) => state.viewport);
  const renderer = useThree((state) => state.gl);
  const setTexture = useSetAtom(envMapTextureAtom);
  const setRenderer = useSetAtom(sceneRendererAtom);

  useEffect(() => {
    setRenderer(renderer);
    return () => {
      setRenderer(null);
      setTexture(null);
      lastTextureRef.current = null;
    };
  }, [renderer, setRenderer, setTexture]);

  useFrame(() => {
    const material = ref.current?.material as THREE.ShaderMaterial | undefined;
    const map = material?.uniforms?.map?.value as
      | THREE.CubeTexture
      | undefined;

    if (map?.isCubeTexture && map !== lastTextureRef.current) {
      lastTextureRef.current = map;
      setTexture(map);
    }
  });

  const compute: ComputeFunction = (event, state) => {
    const { x, y } = getEventOffsets(event);
    state.pointer.set(
      (x / state.size.width) * 2 - 1,
      -(y / state.size.height) * 2 + 1
    );
    state.raycaster.setFromCamera(state.pointer, state.camera);

    const [intersection] = state.raycaster.intersectObject(ref.current);

    if (!intersection) {
      return false;
    }

    const { uv } = intersection;

    if (!uv) {
      return false;
    }

    // Convert UV to lat/lon (invert x to match texture)
    const longitude = (1 - uv.x) * 2 * Math.PI - Math.PI + Math.PI / 2;
    const latitude = uv.y * Math.PI;

    // Convert lat/lon to direction
    dir.set(
      -Math.sin(longitude) * Math.sin(latitude),
      Math.cos(latitude),
      -Math.cos(longitude) * Math.sin(latitude)
    );

    state.raycaster.set(zero, dir);

    return undefined;
  };

  return (
    <>
      <mesh
        ref={ref}
        scale={[viewport.width, viewport.height, 1]}
        rotation={[Math.PI, 0, 0]}
      >
        <planeGeometry />
        <CubeMaterial>
          <RenderCubeTexture
            attach="map"
            compute={compute}
            frames={Infinity}
            resolution={ENV_CAPTURE_RESOLUTION}
            near={ENV_CAPTURE_NEAR}
            far={ENV_CAPTURE_FAR}
          >
            <Env enableEvents />
          </RenderCubeTexture>
        </CubeMaterial>
      </mesh>
    </>
  );
}
