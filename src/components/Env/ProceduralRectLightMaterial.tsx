import { shaderMaterial } from "@react-three/drei";
import {
  MaterialNode,
  ThreeElements,
  extend,
  useFrame,
} from "@react-three/fiber";
import { PrimitiveAtom, useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ProceduralRectLight } from "../../store";
import {
  GLSL_ERF,
  GLSL_RECT_HALF,
  GLSL_SIGMA,
  padForBlur,
  rectEnergyScale,
} from "../../utils/proceduralBlur";

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uBlur;
  uniform float uEnergyScale;
  uniform float uPad;

  varying vec2 vUv;

  ${GLSL_ERF}

  float axisCoverage(float t, float sigma) {
    float k = sigma * 1.41421356;
    return 0.5 * (erf((${GLSL_RECT_HALF} - t) / k) + erf((${GLSL_RECT_HALF} + t) / k));
  }

  void main() {
    // uPad enlarges the evaluation space so the soft tail isn't clipped by the
    // quad border (the mesh is scaled by uPad to match).
    vec2 p = (2.0 * vUv - 1.0) * uPad;

    ${GLSL_SIGMA}

    // Separable gaussian-convolved box -> a true soft square. uEnergyScale
    // keeps the integral over the plane constant as the blur widens.
    float cov = axisCoverage(p.x, sigma) * axisCoverage(p.y, sigma);
    cov *= uEnergyScale;

    vec3 rgb = uColor * uIntensity;
    gl_FragColor = vec4(rgb, clamp(cov * uOpacity, 0.0, 1.0));
  }
`;

const ProceduralRectLightShaderMaterial = shaderMaterial(
  {
    uOpacity: 1,
    uColor: new THREE.Color(0xffffff),
    uIntensity: 1,
    uBlur: 0.1,
    uEnergyScale: 1,
    uPad: 1,
  },
  vertexShader,
  fragmentShader
);

extend({ ProceduralRectLightShaderMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    proceduralRectLightShaderMaterial: MaterialNode<
      any,
      typeof ProceduralRectLightShaderMaterial
    >;
  }
}

export function ProceduralRectLightMaterial({
  lightAtom,
}: {
  lightAtom: PrimitiveAtom<ProceduralRectLight>;
}) {
  const light = useAtomValue(lightAtom);
  const ref = useRef<ThreeElements["proceduralRectLightShaderMaterial"]>(null!);

  const [color] = useState(() => new THREE.Color(0xffffff));

  // Recomputed only when blur changes (numerical integral), not per frame.
  const energyScale = useMemo(() => rectEnergyScale(light.blur), [light.blur]);
  const pad = useMemo(() => padForBlur(light.blur), [light.blur]);

  useFrame(() => {
    ref.current.uniforms.uOpacity.value = light.opacity;
    ref.current.uniforms.uIntensity.value = light.intensity;
    ref.current.uniforms.uColor.value = color.set(light.color);
    ref.current.uniforms.uBlur.value = light.blur;
    ref.current.uniforms.uEnergyScale.value = energyScale;
    ref.current.uniforms.uPad.value = pad;
  });

  return (
    <proceduralRectLightShaderMaterial
      ref={ref}
      transparent={true}
      blending={light.additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      depthFunc={THREE.AlwaysDepth}
    />
  );
}

// Reload on HMR
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    window.location.reload();
  });
}
