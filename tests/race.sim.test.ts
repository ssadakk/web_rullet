import { describe, it, expect } from 'vitest';
import { Engine } from '../src/game/engine';
import { generateCourse } from '../src/game/course';
import type { BallInit } from '../src/types';

const DT = 1000 / 60;
// 자연 종료 상한(엔진 타임아웃 45s보다 충분히 작게 → 클로깅 회귀를 잡는다)
const NATURAL_LIMIT_MS = 30_000;

function makeInits(n: number): BallInit[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, name: `p${i}`, color: '#fff' }));
}

function runToEnd(n: number): { simMs: number; ranking: number[]; placementsMatch: boolean } {
  const engine = new Engine(makeInits(n), generateCourse());
  let simMs = 0;
  const cap = 50_000;
  while (!engine.isFinished() && simMs < cap) {
    engine.tick(DT);
    simMs += DT;
  }
  const ranking = engine.ranking();
  const byRank = engine.confirmedPlacements()
    .sort((a, b) => a.rank - b.rank)
    .map((p) => p.id);
  const placementsMatch =
    byRank.length === ranking.length && byRank.every((id, i) => id === ranking[i]);
  return { simMs, ranking, placementsMatch };
}

describe('레이스 솔버빌리티 (헤드리스, 랜덤 코스)', () => {
  for (const n of [2, 8, 20]) {
    it(`${n}명: 랜덤 코스에서 전원 완주 + 타임아웃 전 자연 종료`, () => {
      // 비결정적(랜덤 코스/투하) → 4회 반복 모두 통과해야 함
      for (let trial = 0; trial < 4; trial++) {
        const { simMs, ranking, placementsMatch } = runToEnd(n);
        // 전원 완주, id 0..n-1 전부 (중복/누락 없음)
        expect([...ranking].sort((a, b) => a - b)).toEqual(
          Array.from({ length: n }, (_, i) => i),
        );
        // 도착순 = 확정 등수 일치
        expect(placementsMatch).toBe(true);
        // 강제 덤프(45s) 아닌 자연 종료
        expect(simMs).toBeLessThan(NATURAL_LIMIT_MS);
      }
    });
  }
});
