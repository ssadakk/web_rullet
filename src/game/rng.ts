// 시드 기반 난수 (mulberry32). 같은 시드 → 같은 코스·같은 레이스를 재현해
// 결과 공유 링크와 결정성 테스트를 가능하게 한다.
// 주의: matter.js 부동소수 특성상 재현 보장은 "같은 빌드·같은 기기" 범위.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
