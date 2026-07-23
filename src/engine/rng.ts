export interface SeededRng {
  next: () => number;
  int: (maxExclusive: number) => number;
  fork: (salt: string) => SeededRng;
}

function xmur3(input: string) {
  let hash = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed: string): SeededRng {
  const seedHash = xmur3(seed)();
  const random = mulberry32(seedHash);
  return {
    next: random,
    int: (maxExclusive) => Math.floor(random() * maxExclusive),
    fork: (salt) => createSeededRng(`${seed}::${salt}`),
  };
}

export function createRandomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0].toString(36)}${values[1].toString(36)}`.slice(0, 12);
}

export function weightedPick<T>(
  items: T[],
  weights: number[],
  rng: SeededRng,
): T | undefined {
  if (items.length === 0) return undefined;
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return items[rng.int(items.length)];
  let cursor = rng.next() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

export function softmaxPick<T>(
  items: T[],
  scores: number[],
  temperature: number,
  rng: SeededRng,
): T | undefined {
  if (items.length === 0) return undefined;
  const safeTemperature = Math.max(0.01, temperature);
  const maxScore = Math.max(...scores);
  const weights = scores.map((score) =>
    Math.exp((score - maxScore) / safeTemperature),
  );
  return weightedPick(items, weights, rng);
}

