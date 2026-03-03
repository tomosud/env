import { Sphere, useCursor } from "@react-three/drei";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { PrimitiveAtom, useAtom, useAtomValue, useSetAtom } from "jotai";
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
} from "../../store";
import { ProceduralScrimLightMaterial } from "./ProceduralScrimLightMaterial";
import { ProceduralUmbrellaLightMaterial } from "./ProceduralUmbrellaLightMaterial";
import { SkyGradientLightMaterial } from "./SkyGradientLightMaterial";
import { TextureLightMaterial } from "./TextureLightMaterial";
import { latlonToPhiTheta } from "../../utils/coordinates";
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

function wrapSignedUnit(value: number) {
  const wrapped = ((((value + 1) % 2) + 2) % 2) - 1;
  return wrapped === 1 ? -1 : wrapped;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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
  const [light, setLight] = useAtom(lightAtom);
  const selectLight = useSetAtom(selectLightAtom);
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
        setLight((l) => {
          const lat = -y / (size.height / 2);
          const lon = x / (size.width / 2);
          return {
            ...l,
            latlon: {
              x: wrapSignedUnit(l.latlon.x + lon),
              y: clamp(l.latlon.y + lat, -1, 1),
            },
          };
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
          setLight((l) => ({
            ...l,
            intensity: Math.max(0, l.intensity + y * 0.001),
          }));
        } else if (metaKey) {
          setLight((l) => ({
            ...l,
            scale: Math.max(0, l.scale + y * 0.001),
          }));
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

    const { phi, theta } = latlonToPhiTheta(light.latlon);

    meshRef.current.position.setFromSphericalCoords(3, phi, theta);

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
