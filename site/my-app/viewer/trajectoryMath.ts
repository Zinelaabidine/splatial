/**
 * Math utilities for camera trajectory interpolation.
 * All matrices are column-major 16-element arrays (WebGL convention,
 * matching viewer.js exactly).
 */

/** Invert a 4×4 column-major matrix. Returns null if singular. */
export function invert4(a: number[]): number[] | null {
  const b00 = a[0] * a[5] - a[1] * a[4];
  const b01 = a[0] * a[6] - a[2] * a[4];
  const b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5];
  const b04 = a[1] * a[7] - a[3] * a[5];
  const b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12];
  const b07 = a[8] * a[14] - a[10] * a[12];
  const b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13];
  const b10 = a[9] * a[15] - a[11] * a[13];
  const b11 = a[10] * a[15] - a[11] * a[14];
  const det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  return [
    (a[5] * b11 - a[6] * b10 + a[7] * b09) / det,
    (a[2] * b10 - a[1] * b11 - a[3] * b09) / det,
    (a[13] * b05 - a[14] * b04 + a[15] * b03) / det,
    (a[10] * b04 - a[9] * b05 - a[11] * b03) / det,
    (a[6] * b08 - a[4] * b11 - a[7] * b07) / det,
    (a[0] * b11 - a[2] * b08 + a[3] * b07) / det,
    (a[14] * b02 - a[12] * b05 - a[15] * b01) / det,
    (a[8] * b05 - a[10] * b02 + a[11] * b01) / det,
    (a[4] * b10 - a[5] * b08 + a[7] * b06) / det,
    (a[1] * b08 - a[0] * b10 - a[3] * b06) / det,
    (a[12] * b04 - a[13] * b02 + a[15] * b00) / det,
    (a[9] * b02 - a[8] * b04 - a[11] * b00) / det,
    (a[5] * b07 - a[4] * b09 - a[6] * b06) / det,
    (a[0] * b09 - a[1] * b07 + a[2] * b06) / det,
    (a[13] * b01 - a[12] * b03 - a[14] * b00) / det,
    (a[8] * b03 - a[9] * b01 + a[10] * b00) / det,
  ];
}

type Vec3 = [number, number, number];
type Quat = [number, number, number, number]; // [w, x, y, z]

/** Extract translation [x,y,z] from a column-major 4×4 matrix. */
function extractTranslation(m: number[]): Vec3 {
  return [m[12], m[13], m[14]];
}

/**
 * Extract a unit quaternion [w,x,y,z] from the 3×3 rotation block of a
 * column-major 4×4 matrix via Shepperd's method.
 */
function matToQuat(m: number[]): Quat {
  // Column-major layout → row-major element names:
  //   R[row][col]: R00=m[0], R10=m[1], R20=m[2]
  //                R01=m[4], R11=m[5], R21=m[6]
  //                R02=m[8], R12=m[9], R22=m[10]
  const m00 = m[0],  m10 = m[1],  m20 = m[2];
  const m01 = m[4],  m11 = m[5],  m21 = m[6];
  const m02 = m[8],  m12 = m[9],  m22 = m[10];

  const trace = m00 + m11 + m22;
  let w: number, x: number, y: number, z: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }

  const len = Math.sqrt(w * w + x * x + y * y + z * z);
  return [w / len, x / len, y / len, z / len];
}

/** Build a column-major 4×4 matrix from quaternion [w,x,y,z] and translation. */
function quatAndTransToMatrix(q: Quat, t: Vec3): number[] {
  const [w, x, y, z] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    1 - (yy + zz), xy + wz,       xz - wy,       0,
    xy - wz,       1 - (xx + zz), yz + wx,        0,
    xz + wy,       yz - wx,       1 - (xx + yy),  0,
    t[0],          t[1],          t[2],            1,
  ];
}

/** Linear interpolation of two 3-vectors. */
function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Spherical linear interpolation of two unit quaternions (shortest arc). */
function slerp(q1: Quat, q2: Quat, t: number): Quat {
  const [w1, x1, y1, z1] = q1;
  let [w2, x2, y2, z2] = q2;

  let dot = w1 * w2 + x1 * x2 + y1 * y2 + z1 * z2;
  // Take the shorter arc
  if (dot < 0) { w2 = -w2; x2 = -x2; y2 = -y2; z2 = -z2; dot = -dot; }

  if (dot > 0.9995) {
    // Nearly parallel — fall back to normalized lerp
    const w = w1 + (w2 - w1) * t;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const z = z1 + (z2 - z1) * t;
    const len = Math.sqrt(w * w + x * x + y * y + z * z);
    return [w / len, x / len, y / len, z / len];
  }

  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s1 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s2 = sinTheta / sinTheta0;

  return [
    s1 * w1 + s2 * w2,
    s1 * x1 + s2 * x2,
    s1 * y1 + s2 * y2,
    s1 * z1 + s2 * z2,
  ];
}

/**
 * Interpolate between two column-major view matrices at t ∈ [0, 1].
 *
 * Each view matrix is inverted to obtain camera-to-world, then decomposed
 * into translation + quaternion.  The components are interpolated separately
 * (lerp for position, slerp for rotation) and recomposed into a new
 * camera-to-world matrix which is finally inverted back to a view matrix.
 *
 * Returns null if either matrix is singular.
 */
export function interpolateViewMatrix(
  vm1: number[],
  vm2: number[],
  t: number,
): number[] | null {
  const ctw1 = invert4(vm1);
  const ctw2 = invert4(vm2);
  if (!ctw1 || !ctw2) return null;

  const pos = lerpVec3(extractTranslation(ctw1), extractTranslation(ctw2), t);
  const q   = slerp(matToQuat(ctw1), matToQuat(ctw2), t);
  const ctw = quatAndTransToMatrix(q, pos);

  return invert4(ctw); // camera-to-world → view matrix
}
