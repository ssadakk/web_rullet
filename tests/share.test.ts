import { describe, it, expect } from 'vitest';
import { encodeShare, decodeShare } from '../src/share';
import { generateCourse } from '../src/game/course';
import { Engine } from '../src/game/engine';
import type { BallInit } from '../src/types';

describe('공유 인코딩 왕복', () => {
  it('시드·명단·모드를 인코딩 후 디코딩하면 동일', () => {
    const data = { seed: 123456789, names: ['철수', '영희', '민수'], mode: 'penalty' as const };
    const round = decodeShare(encodeShare(data));
    expect(round).toEqual(data);
  });

  it('빈 해시는 빈 객체', () => {
    expect(decodeShare('')).toEqual({});
    expect(decodeShare('#')).toEqual({});
  });

  it('이름에 공백/빈 줄은 정리된다', () => {
    const round = decodeShare(encodeShare({ names: ['  철수 ', '', '영희'] }));
    expect(round.names).toEqual(['철수', '영희']);
  });

  it('잘못된 모드는 무시', () => {
    expect(decodeShare('#m=bogus').mode).toBeUndefined();
  });
});

describe('시드 결정성', () => {
  const DT = 1000 / 60;
  function runRanking(seed: number): number[] {
    const course = generateCourse(seed);
    const inits: BallInit[] = Array.from({ length: 8 }, (_, i) => ({ id: i, name: `p${i}`, color: '#fff' }));
    const engine = new Engine(inits, course);
    let ms = 0;
    while (!engine.isFinished() && ms < 50_000) { engine.tick(DT); ms += DT; }
    return engine.ranking();
  }

  it('같은 시드 → 같은 코스 시드 + 같은 도착 순위', () => {
    const a = generateCourse(42);
    const b = generateCourse(42);
    expect(a.seed).toBe(42);
    expect(b.seed).toBe(42);
    expect(a.pegs.length).toBe(b.pegs.length);
    expect(a.sections.map((s) => s.name)).toEqual(b.sections.map((s) => s.name));
    // 전체 레이스 재현 (스폰·물리·장치 모두 시드 고정)
    expect(runRanking(42)).toEqual(runRanking(42));
  });

  it('다른 시드 → 다른 코스', () => {
    const a = generateCourse(1);
    const b = generateCourse(2);
    // 핀 좌표가 완전히 동일할 확률은 사실상 0
    const same = a.pegs.length === b.pegs.length
      && a.pegs.every((p, i) => p.x === b.pegs[i].x && p.y === b.pegs[i].y);
    expect(same).toBe(false);
  });
});
