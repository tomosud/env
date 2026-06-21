// Shared model for the energy-preserving blur used by the procedural Circle
// (disc) and Square (rect) lights.
//
// The shape is a gaussian-convolved hard edge (erf), so widening it is a true
// blur. Two things make it behave like an actual image blur:
//
//  1. Padding (padForBlur): the light quad is enlarged as the blur grows so the
//     soft tail is NOT clipped by the quad's rectangular border. The shader
//     evaluates the shape in a padded coordinate (s = p * pad) so the *core*
//     stays the same apparent size while the quad gains margin for the tail.
//
//  2. Energy preservation (uEnergyScale): blurring lowers the peak, but the
//     integral over the plane (the emitted energy) is kept constant by dividing
//     the coverage by its integral over the padded plane. That integral is
//     computed here in JS once per `blur` change and passed to the shader.
//
// The GLSL functions below mirror these JS functions exactly so the analytic
// normalization matches what is rasterized.

export const DISC_CORE_RADIUS = 0.75;
export const RECT_CORE_HALF = 0.75;
export const BLUR_SIGMA_MIN = 0.012;
export const BLUR_SIGMA_SCALE = 0.14;

// How many sigmas of tail the padded quad must contain (3.5 captures ~99.95%).
const PAD_SIGMAS = 4;

const SQRT2 = Math.SQRT2;

export function sigmaForBlur(blur: number) {
  return BLUR_SIGMA_MIN + Math.max(blur, 0) * BLUR_SIGMA_SCALE;
}

// Half-extent of the padded coordinate space. The quad mesh is scaled by this
// factor; >= 1 so blur=0 keeps the original size.
export function padForBlur(blur: number) {
  const reach = Math.max(DISC_CORE_RADIUS, RECT_CORE_HALF) + PAD_SIGMAS * sigmaForBlur(blur);
  return Math.max(1, reach);
}

// Abramowitz & Stegun 7.1.26 — matches the GLSL implementation below.
function erf(x: number) {
  const s = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return s * y;
}

function discCoverage(d: number, sigma: number) {
  return 0.5 * (1 - erf((d - DISC_CORE_RADIUS) / (sigma * SQRT2)));
}

function rectAxis(t: number, sigma: number) {
  const k = sigma * SQRT2;
  return 0.5 * (erf((RECT_CORE_HALF - t) / k) + erf((RECT_CORE_HALF + t) / k));
}

// Integral of coverage over one quadrant [0, pad]^2 of the padded plane. The
// constant quadrant->full-plane factor cancels in the energy-scale ratio.
function discIntegral(blur: number) {
  const sigma = sigmaForBlur(blur);
  const pad = padForBlur(blur);
  const N = 192;
  const h = pad / N;
  let sum = 0;
  for (let i = 0; i < N; i += 1) {
    const x = (i + 0.5) * h;
    for (let j = 0; j < N; j += 1) {
      const y = (j + 0.5) * h;
      sum += discCoverage(Math.hypot(x, y), sigma);
    }
  }
  return sum * h * h;
}

// Separable, so the quadrant integral is (1D axis integral over [0, pad])^2.
function rectAxisIntegral(blur: number) {
  const sigma = sigmaForBlur(blur);
  const pad = padForBlur(blur);
  const N = 256;
  const h = pad / N;
  let sum = 0;
  for (let i = 0; i < N; i += 1) {
    sum += rectAxis((i + 0.5) * h, sigma);
  }
  return sum * h;
}

const DISC_BASE = discIntegral(0);
const RECT_BASE_AXIS = rectAxisIntegral(0);

// Scale that keeps total emitted energy equal to the un-blurred (blur=0) shape.
export function discEnergyScale(blur: number) {
  return DISC_BASE / discIntegral(blur);
}

export function rectEnergyScale(blur: number) {
  const axis = rectAxisIntegral(blur);
  return (RECT_BASE_AXIS * RECT_BASE_AXIS) / (axis * axis);
}

export const GLSL_ERF = /* glsl */ `
  float erf(float x) {
    float s = sign(x);
    float ax = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * ax);
    float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t) * exp(-ax * ax);
    return s * y;
  }
`;

// GLSL snippet computing `sigma` from the `uBlur` uniform (kept in sync with
// sigmaForBlur above).
export const GLSL_SIGMA = /* glsl */ `
  float sigma = ${BLUR_SIGMA_MIN.toFixed(5)} + max(uBlur, 0.0) * ${BLUR_SIGMA_SCALE.toFixed(
  5
)};
`;

export const GLSL_DISC_RADIUS = DISC_CORE_RADIUS.toFixed(5);
export const GLSL_RECT_HALF = RECT_CORE_HALF.toFixed(5);
