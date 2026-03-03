import * as THREE from "three";

export const ENV_SPHERE_RADIUS = 3;
export const ENV_CAPTURE_RESOLUTION = 1024;
export const ENV_CAPTURE_NEAR = 0.01;
export const ENV_CAPTURE_FAR = 100;

export type LatLon = { x: number; y: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function wrapSignedUnit(value: number) {
  const wrapped = ((((value + 1) % 2) + 2) % 2) - 1;
  return wrapped === 1 ? -1 : wrapped;
}

export function normalizeLatLon(latlon: LatLon): LatLon {
  return {
    x: wrapSignedUnit(latlon.x),
    y: clamp(latlon.y, -1, 1),
  };
}

export function latlonToPhiTheta(latlon: LatLon): {
  phi: number;
  theta: number;
} {
  const normalized = normalizeLatLon(latlon);
  const phi = THREE.MathUtils.mapLinear(normalized.y, -1, 1, Math.PI, 0);
  const theta = THREE.MathUtils.mapLinear(
    normalized.x,
    -1,
    1,
    0.5 * Math.PI,
    -1.5 * Math.PI
  );
  return { phi, theta };
}

export function sphericalToLatLon(
  spherical: Pick<THREE.Spherical, "phi" | "theta">
): LatLon {
  const lat = THREE.MathUtils.mapLinear(spherical.phi, 0, Math.PI, 1, -1);
  const lon = THREE.MathUtils.mapLinear(
    spherical.theta,
    0.5 * Math.PI,
    -1.5 * Math.PI,
    -1,
    1
  );
  return normalizeLatLon({ x: lon, y: lat });
}

export function lightPositionFromLatLon(
  latlon: LatLon,
  radius = ENV_SPHERE_RADIUS
) {
  const { phi, theta } = latlonToPhiTheta(latlon);
  return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
}

export function updateLightLatLonByScreenDelta(
  latlon: LatLon,
  deltaX: number,
  deltaY: number,
  width: number,
  height: number
): LatLon {
  const lat = -deltaY / (height / 2);
  const lon = deltaX / (width / 2);
  return normalizeLatLon({
    x: latlon.x + lon,
    y: latlon.y + lat,
  });
}
