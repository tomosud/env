import { Sphere, useCursor } from "@react-three/drei";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { useRef, useState } from "react";
import * as THREE from "three";
import {
  Light,
  ProceduralScrimLight,
  ProceduralUmbrellaLight,
  SkyGradientLight,
  TextureLight,
  lightsAtom,
  selectLightAtom,
  updateLightByIdAtom,
} from "../../store";
import { ProceduralScrimLightMaterial } from "./ProceduralScrimLightMaterial";
import { ProceduralUmbrellaLightMaterial } from "./ProceduralUmbrellaLightMaterial";
import { SkyGradientLightMaterial } from "./SkyGradientLightMaterial";
import { TextureLightMaterial } from "./TextureLightMaterial";
import {
  ENV_SPHERE_RADIUS,
  lightPositionFromLatLon,
  updateLightLatLonByScreenDelta,
} from "../../utils/coordinates";
import { useGesture } from "@use-gesture/react";

const SKY_GRADIENT_PICK_DISTANCE_OFFSET = 1_000_000;

const defaultRaycast = THREE.Mesh.prototype.raycast;
const disableRaycast: THREE.Mesh["raycast"] = () => undefined;

const deprioritizedSkyGradientRaycast: THREE.Mesh["raycast"] = function (
  this: THREE.Mesh,
  raycaster,
  intersects
) {
  const startIndex = intersects.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);

  for (let i = startIndex; i < intersects.length; i += 1) {
    intersects[i].distance += SKY_GRADIENT_PICK_DISTANCE_OFFSET;
  }
};

export function LightRenderer({
  index,
  lightAtom,
  enableEvents = false,
}: {
  index: number;
  lightAtom: PrimitiveAtom<Light>;
  enableEvents?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const light = useAtomValue(lightAtom);
  const selectLight = useSetAtom(selectLightAtom);
  const updateLightById = useSetAtom(updateLightByIdAtom);
  const lights = useAtomValue(lightsAtom);
  const selectedLightId = lights.find((l) => l.selected)?.id;
  const isSolo = lights.some((candidate) => candidate.solo);
  const isLightVisible = (candidate: Light) =>
    isSolo ? candidate.solo : candidate.visible;
  const visibleLightIds = new Set(
    lights
      .filter((candidate) => isLightVisible(candidate))
      .map((candidate) => candidate.id)
  );
  const effectiveVisible = isLightVisible(light);

  const [hovered, setHovered] = useState(false);
  useCursor(hovered, "move", "default");

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!enableEvents || !effectiveVisible) {
      return;
    }

    const hitLightIds = Array.from(
      new Set(
        e.intersections
          .map((intersection) => intersection.object.userData?.lightId)
          .filter(
            (id): id is string =>
              typeof id === "string" && visibleLightIds.has(id)
          )
      )
    );

    if (hitLightIds.length === 0) {
      return;
    }

    if (hitLightIds.length === 1 && hitLightIds[0] === light.id) {
      e.stopPropagation();
      selectLight(light.id);
      return;
    }

    const selectedHitIndex = selectedLightId
      ? hitLightIds.indexOf(selectedLightId)
      : -1;
    const nextLightId =
      selectedHitIndex >= 0
        ? hitLightIds[(selectedHitIndex + 1) % hitLightIds.length]
        : hitLightIds[0];

    if (nextLightId !== light.id) {
      return;
    }

    e.stopPropagation();
    selectLight(nextLightId);
  };

  const size = useThree((state) => state.size);
  const bind = useGesture(
    {
      onHover: ({ hovering }) => {
        setHovered(hovering ?? false);
      },
      onDrag: ({ delta: [x, y], event }) => {
        event.stopPropagation();
        updateLightById({
          lightId: light.id,
          updater: (current) => ({
            ...current,
            latlon: updateLightLatLonByScreenDelta(
              current.latlon,
              x,
              y,
              size.width,
              size.height
            ),
          }),
        });
      },
      onDragEnd: ({ event }) => {
        event.stopPropagation();
        selectLight(light.id);
      },
      onWheel: ({ delta: [_, y], event }) => {
        event.stopPropagation();

        const { altKey, metaKey } = event;
        if (!enableEvents) {
          return;
        }

        if (!light.selected) {
          return;
        }

        if (altKey) {
          updateLightById({
            lightId: light.id,
            updater: (current) => ({
              ...current,
              intensity: Math.max(0, current.intensity + y * 0.001),
            }),
          });
        } else if (metaKey) {
          updateLightById({
            lightId: light.id,
            updater: (current) => ({
              ...current,
              scale: Math.max(0, current.scale + y * 0.001),
            }),
          });
        }
      },
    },
    {
      enabled: enableEvents,
      wheel: { axis: "y", eventOptions: { passive: true } },
    }
  );

  useFrame(() => {
    if (!meshRef.current) {
      return;
    }

    meshRef.current.position.copy(lightPositionFromLatLon(light.latlon, ENV_SPHERE_RADIUS));

    meshRef.current.scale.setX(light.scale * light.scaleX);
    meshRef.current.scale.setY(light.scale * light.scaleY);
    meshRef.current.scale.setZ(light.scale);

    meshRef.current.lookAt(light.target.x, light.target.y, light.target.z);
    meshRef.current.rotateZ(light.rotation);
    meshRef.current.updateMatrix();
  });

  if (light.type === "sky_gradient") {
    return (
      <Sphere
        userData={{ lightId: light.id }}
        visible={effectiveVisible}
        args={[100, 64, 64]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={index}
        raycast={
          effectiveVisible ? deprioritizedSkyGradientRaycast : disableRaycast
        }
        onClick={handleClick}
      >
        <SkyGradientLightMaterial
          lightAtom={lightAtom as PrimitiveAtom<SkyGradientLight>}
        />
      </Sphere>
    );
  }

  return (
    <mesh
      {...(bind() as any)}
      ref={meshRef}
      userData={{ lightId: light.id }}
      visible={effectiveVisible}
      castShadow={false}
      receiveShadow={false}
      renderOrder={index}
      raycast={effectiveVisible ? defaultRaycast : disableRaycast}
      onClick={handleClick}
    >
      <planeGeometry args={[1, 1, 1, 1]} />
      {light.type === "procedural_scrim" && (
        <ProceduralScrimLightMaterial
          lightAtom={lightAtom as PrimitiveAtom<ProceduralScrimLight>}
        />
      )}
      {light.type === "texture" && (
        <TextureLightMaterial
          lightAtom={lightAtom as PrimitiveAtom<TextureLight>}
        />
      )}
      {light.type === "procedural_umbrella" && (
        <ProceduralUmbrellaLightMaterial
          lightAtom={lightAtom as PrimitiveAtom<ProceduralUmbrellaLight>}
        />
      )}
    </mesh>
  );
}
