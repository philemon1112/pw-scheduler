/** mulberry32: small, fast, and the same sequence for the same seed everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A different, well-mixed seed for each iteration of one run. */
export const iterationSeed = (seed: number, iteration: number) => (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(iteration + 1, 0xc2b2ae35)) >>> 0;
