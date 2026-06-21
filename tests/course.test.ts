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
      const innerWidth = c.width - 2 * c.wallThickness;
      for (const s of c.slopes) {
        // 슬로프 폭이 안쪽 폭보다 좁아 통로가 남는다
        expect(s.w).toBeLessThan(innerWidth);
        // 완만한 가로 경사판 금지 — 지루한 막대 회귀 가드.
        // 깔때기 벽(|angle|≳0.4)과 수직 칸막이·슈트 벽(w≤16)은 조건에 안 걸린다.
        if (Math.abs(s.angle) < 0.3 && s.w > 20) {
          expect(s.w).toBeLessThanOrEqual(0.55 * innerWidth);
        }
      }

      // 시소: 벽 안 + 기울기 상한 (덤프는 되되 수직 낙하 슬로프화 방지)
      const innerW2 = c.width - 2 * c.wallThickness;
      for (const s of c.seesaws) {
        expect(s.x - s.length / 2).toBeGreaterThanOrEqual(c.wallThickness);
        expect(s.x + s.length / 2).toBeLessThanOrEqual(c.width - c.wallThickness);
        expect(s.length).toBeLessThanOrEqual(innerW2);
        expect(s.maxAngle).toBeLessThanOrEqual(0.6);
        expect(Math.abs(s.angle)).toBeLessThan(s.maxAngle);
      }

      // 트램펄린: 캡(≤4) + 벽 안 + 위로 튕김(vy<0) + 결승 한참 위
      expect(c.trampolines.length).toBeLessThanOrEqual(4);
      for (const t of c.trampolines) {
        expect(t.x - t.w / 2).toBeGreaterThanOrEqual(c.wallThickness);
        expect(t.x + t.w / 2).toBeLessThanOrEqual(c.width - c.wallThickness);
        expect(t.vy).toBeLessThan(0);
        expect(t.y).toBeLessThan(c.finishY - 150);
      }

      // 풍차 바(ROTOR): 축이 벽(오프센터)에 있고 두꺼운 막대(WHEEL 16과 구분).
      // 팔이 코스 폭을 다 덮지 않아 반대쪽에 통로가 남는다(reach=0.8*innerW).
      const rotors = c.spinners.filter((s) => s.thickness >= 24);
      for (const s of rotors) {
        expect(inBoundsX(s.x)).toBe(true);
        // 피벗이 한쪽 벽에 위치 (코스 중앙이 아님)
        const nearWall = Math.min(s.x, c.width - s.x) <= c.wallThickness + 1;
        expect(nearWall).toBe(true);
        expect(s.length / 2).toBeLessThan(innerW2); // 팔 reach가 내부폭 미만 → 통로 유지
      }

      // 섹션 분산: 인접 중복 없음, 8종 모두 등장 (셔플 백이 보장)
      const names = c.sections.map((s) => s.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i]).not.toBe(names[i - 1]);
      }
      for (const n of ['PINS', 'CHAOS', 'DROP', 'WHEEL', 'LANES', 'SEESAW', 'ROTOR', 'TRAMPO']) {
        expect(names).toContain(n);
      }

      // 반전 요소 예산 캡 (race.sim 30초 가드의 전제)
      expect(c.jumppads.length).toBeLessThanOrEqual(3);
      expect(c.pops.length).toBeLessThanOrEqual(4);
      expect(c.boosters.filter((b) => b.fy < 0).length).toBeLessThanOrEqual(1);
      expect(c.spinners.filter((s) => s.kick).length).toBeLessThanOrEqual(2);

      // 점프패드·팝은 벽 안 + 결승 한참 위
      for (const j of c.jumppads) {
        expect(j.x - j.w / 2).toBeGreaterThanOrEqual(c.wallThickness);
        expect(j.x + j.w / 2).toBeLessThanOrEqual(c.width - c.wallThickness);
        expect(j.y).toBeLessThan(c.finishY - 150);
      }
      for (const p of c.pops) {
        expect(p.x - p.r).toBeGreaterThanOrEqual(c.wallThickness);
        expect(p.x + p.r).toBeLessThanOrEqual(c.width - c.wallThickness);
        expect(p.y).toBeLessThan(c.finishY - 150);
      }

      // 범퍼 클러스터 해체: 서로 60px 이상 떨어져 분산
      for (let i = 0; i < c.bumpers.length; i++) {
        for (let j = i + 1; j < c.bumpers.length; j++) {
          const d = Math.hypot(c.bumpers[i].x - c.bumpers[j].x, c.bumpers[i].y - c.bumpers[j].y);
          expect(d).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });
});
