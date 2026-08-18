// 2D vector helpers — the math lab's own plumbing.
//
// NOTE (prime directive): these are deliberately 2-D and `{x,y}`-shaped so the
// plane is drawable. They are NOT the curriculum's `cosineSimilarity(a: number[],
// b: number[])` over arbitrary-length embeddings — different signature, different
// shape. The lab builds intuition; it is not a drop-in for any scaffold gap.

export type V2 = { x: number; y: number };

export const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;

/** Magnitude / length of the arrow — ‖a‖ = √(x² + y²). */
export const mag = (a: V2) => Math.hypot(a.x, a.y);

/** Same direction, length forced to exactly 1 (or {0,0} if a has no length). */
export const normalize = (a: V2): V2 => {
  const m = mag(a);
  return m === 0 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
};

/** cos of the angle between a and b: (a·b) / (‖a‖·‖b‖). Range −1…1. */
export const cosine = (a: V2, b: V2) => {
  const d = mag(a) * mag(b);
  return d === 0 ? 0 : dot(a, b) / d;
};

/** Straight-line gap between the two arrow tips — ‖a − b‖. */
export const euclidean = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Angle between a and b, in degrees (0…180). */
export const angleDeg = (a: V2, b: V2) => {
  const c = Math.min(1, Math.max(-1, cosine(a, b)));
  return (Math.acos(c) * 180) / Math.PI;
};

/** Math-space angle of a single vector, in radians (atan2). */
export const heading = (a: V2) => Math.atan2(a.y, a.x);

export const round = (n: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
