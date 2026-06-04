import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/game/course';

describe('generateCourse 불변식', () => {
  it('여러 번 생성해도 경계·결승선·워프·슬로프 규칙을 지킨다', () => {
    for (let trial = 0; trial < 30; trial++) {
      const c = generateCourse();

      expect(c.finishY).toBeGreaterThan(c.startY);
      expect(c.height).toBeGreaterThan(c.finishY);
      expect(c.pegs.length).toBeGreaterThan(0);

      const inBoundsX = (x: number) => x >= 0 && x <= c.width;
      const inCourseY = (y: number) => y >= c.startY - 20 && y <= c.height;

      for (const p of c.pegs) {
        expect(inBoundsX(p.x)).toBe(true);
        expect(inCourseY(p.y)).toBe(true);
      }
      for (const s of c.spinners) {
        expect(inBoundsX(s.x)).toBe(true);
        expect(inCourseY(s.y)).toBe(true);
      }
      for (const b of c.boosters) {
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(c.wallThickness);
        expect(b.x + b.w / 2).toBeLessThanOrEqual(c.width - c.wallThickness);
      }
      for (const t of c.teleports) {
        // 출구는 입구보다 아래(순진행), 둘 다 벽 안
        expect(t.ty).toBeGreaterThan(t.ey);
        expect(t.ty).toBeLessThan(c.finishY);
        for (const x of [t.ex, t.tx]) {
          expect(x).toBeGreaterThanOrEqual(c.wallThickness);
          expect(x).toBeLessThanOrEqual(c.width - c.wallThickness);
        }
      }
      for (const s of c.slopes) {
        // 슬로프 폭이 안쪽 폭보다 좁아 통로가 남는다
        expect(s.w).toBeLessThan(c.width - 2 * c.wallThickness);
      }
    }
  });
});
