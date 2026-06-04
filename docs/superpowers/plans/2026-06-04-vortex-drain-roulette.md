# 소용돌이 배수구 룰렛 Implementation Plan

> ⚠️ **폐기됨(SUPERSEDED).** 컨셉이 네온 낙하 레이스로 변경됨. 기록용 보존.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **커밋 정책(유저 규칙):** 유저가 명시적으로 "커밋"이라 말할 때까지 절대 `git commit` 하지 않는다. 각 태스크 끝의 "Checkpoint" 스텝에서는 `git add`로 스테이징만 하고 멈춘다. 커밋 명령은 유저 요청 시 한 번에 실행한다.

**Goal:** 이름들이 공이 되어 소용돌이치다 중앙 배수구로 하나씩 빠지고, 빠지는 순서로 전체 순위를 정하는 한 사이클짜리 웹 룰렛 게임.

**Architecture:** Vite + TypeScript 정적 웹앱. matter.js로 중력 0 탑다운 물리, 매 스텝 중심 인력으로 공을 안으로 수렴시킴. 순수 로직(파싱/순위/색/인력)은 vitest로 TDD, 물리·렌더·UI는 구현 후 브라우저 수동 검증. 파일은 책임 단위로 분리.

**Tech Stack:** Vite, TypeScript, matter-js, Canvas 2D, vitest.

---

## 파일 구조

```
package.json
tsconfig.json
vite.config.ts
index.html
src/
  types.ts            공유 타입
  input.ts            parseNames (순수)
  ranking.ts          deriveRanking (순수)
  colors.ts           assignColors (순수)
  physics/force.ts    inwardForce 수학 (순수)
  physics/world.ts    matter.js 엔진 래퍼
  game/ball.ts        Ball 엔티티
  game/drain.ts       보울 지오메트리 + 빠짐 판정 + 종료 보장
  game/engine.ts      게임 루프, 빠짐 순서 기록, 종료/결과
  render/renderer.ts  캔버스 드로잉
  ui/controls.ts      DOM 입력·설정·결과·실시간 순위
  main.ts             배선
tests/
  input.test.ts
  ranking.test.ts
  colors.test.ts
  force.test.ts
```

---

## Task 1: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "vortex-drain-roulette",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "matter-js": "^0.20.0"
  },
  "devDependencies": {
    "@types/matter-js": "^0.19.7",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: vite.config.ts 작성**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: index.html 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>소용돌이 배수구 룰렛</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: src/main.ts 임시 작성**

```ts
document.querySelector<HTMLDivElement>('#app')!.textContent = '소용돌이 배수구 룰렛';
```

- [ ] **Step 6: .gitignore 작성**

```
node_modules
dist
```

- [ ] **Step 7: 설치 + 검증**

Run: `npm install`
Expected: 의존성 설치 성공, 에러 없음.

Run: `npm run test`
Expected: "No test files found" 또는 0 테스트 통과 (vitest 동작 확인). 실패 아님.

- [ ] **Step 8: Checkpoint**

```bash
git add -A
# 커밋은 유저 요청 시에만
```

---

## Task 2: 공유 타입

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: 타입 정의**

```ts
export type BallId = number;

export interface Vec2 {
  x: number;
  y: number;
}

export interface BallInit {
  id: BallId;
  name: string;
  color: string;
}

// 'last-out' = 마지막에 빠진 공이 1등 (기본)
// 'first-out' = 먼저 빠진 공이 1등
export type WinnerRule = 'last-out' | 'first-out';

export type ResultMode = 'winner' | 'penalty' | 'ranking';
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Checkpoint**

```bash
git add src/types.ts
```

---

## Task 3: 이름 파싱 (TDD)

**Files:**
- Create: `src/input.ts`
- Test: `tests/input.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// tests/input.test.ts
import { describe, it, expect } from 'vitest';
import { parseNames } from '../src/input';

describe('parseNames', () => {
  it('줄 단위로 이름을 분리한다', () => {
    expect(parseNames('철수\n영희\n민수')).toEqual(['철수', '영희', '민수']);
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(parseNames('  철수  \n 영희 ')).toEqual(['철수', '영희']);
  });

  it('빈 줄을 무시한다', () => {
    expect(parseNames('철수\n\n  \n영희')).toEqual(['철수', '영희']);
  });

  it('중복 이름을 허용한다', () => {
    expect(parseNames('철수\n철수')).toEqual(['철수', '철수']);
  });

  it('빈 입력은 빈 배열', () => {
    expect(parseNames('')).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/input.test.ts`
Expected: FAIL — `parseNames` 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/input.ts
export function parseNames(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/input.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Checkpoint**

```bash
git add src/input.ts tests/input.test.ts
```

---

## Task 4: 순위 도출 (TDD)

**Files:**
- Create: `src/ranking.ts`
- Test: `tests/ranking.test.ts`

빠짐 순서 배열(index 0 = 가장 먼저 빠진 공)과 1등 기준을 받아 1등→꼴찌 순서 배열을 만든다.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// tests/ranking.test.ts
import { describe, it, expect } from 'vitest';
import { deriveRanking } from '../src/ranking';

describe('deriveRanking', () => {
  // 빠진 순서: 10(먼저) -> 20 -> 30(마지막)
  const drainOrder = [10, 20, 30];

  it('last-out: 마지막에 빠진 공이 1등', () => {
    expect(deriveRanking(drainOrder, 'last-out')).toEqual([30, 20, 10]);
  });

  it('first-out: 먼저 빠진 공이 1등', () => {
    expect(deriveRanking(drainOrder, 'first-out')).toEqual([10, 20, 30]);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const copy = [...drainOrder];
    deriveRanking(drainOrder, 'last-out');
    expect(drainOrder).toEqual(copy);
  });

  it('빈 배열도 처리', () => {
    expect(deriveRanking([], 'last-out')).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/ranking.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/ranking.ts
import type { BallId, WinnerRule } from './types';

export function deriveRanking(drainOrder: BallId[], rule: WinnerRule): BallId[] {
  return rule === 'first-out' ? [...drainOrder] : [...drainOrder].reverse();
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/ranking.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint**

```bash
git add src/ranking.ts tests/ranking.test.ts
```

---

## Task 5: 색 배정 (TDD)

**Files:**
- Create: `src/colors.ts`
- Test: `tests/colors.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// tests/colors.test.ts
import { describe, it, expect } from 'vitest';
import { assignColors, PALETTE } from '../src/colors';

describe('assignColors', () => {
  it('요청한 개수만큼 반환한다', () => {
    expect(assignColors(5)).toHaveLength(5);
  });

  it('팔레트 크기 이하면 모두 다른 색', () => {
    const colors = assignColors(PALETTE.length);
    expect(new Set(colors).size).toBe(PALETTE.length);
  });

  it('팔레트보다 많으면 순환한다', () => {
    const colors = assignColors(PALETTE.length + 2);
    expect(colors[PALETTE.length]).toBe(PALETTE[0]);
    expect(colors[PALETTE.length + 1]).toBe(PALETTE[1]);
  });

  it('0개면 빈 배열', () => {
    expect(assignColors(0)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/colors.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/colors.ts
export const PALETTE: readonly string[] = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#a9a9a9', '#ff6b6b', '#1abc9c',
];

export function assignColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => PALETTE[i % PALETTE.length]);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/colors.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint**

```bash
git add src/colors.ts tests/colors.test.ts
```

---

## Task 6: 중심 인력 수학 (TDD)

**Files:**
- Create: `src/physics/force.ts`
- Test: `tests/force.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// tests/force.test.ts
import { describe, it, expect } from 'vitest';
import { inwardForce } from '../src/physics/force';

const center = { x: 0, y: 0 };

describe('inwardForce', () => {
  it('오른쪽에 있으면 왼쪽(중심)으로 향한다', () => {
    const f = inwardForce({ x: 10, y: 0 }, center, 5);
    expect(f.x).toBeCloseTo(-5);
    expect(f.y).toBeCloseTo(0);
  });

  it('위에 있으면 아래(중심)로 향한다', () => {
    const f = inwardForce({ x: 0, y: -10 }, center, 5);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(5);
  });

  it('벡터 크기는 strength와 같다', () => {
    const f = inwardForce({ x: 3, y: 4 }, center, 10);
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(10);
  });

  it('중심에 있으면 0 벡터 (0 나누기 가드)', () => {
    const f = inwardForce({ x: 0, y: 0 }, center, 5);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/force.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// src/physics/force.ts
import type { Vec2 } from '../types';

export function inwardForce(pos: Vec2, center: Vec2, strength: number): Vec2 {
  const dx = center.x - pos.x;
  const dy = center.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };
  return { x: (dx / dist) * strength, y: (dy / dist) * strength };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/force.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 전체 테스트 확인**

Run: `npm run test`
Expected: 4개 파일 전부 PASS.

- [ ] **Step 6: Checkpoint**

```bash
git add src/physics/force.ts tests/force.test.ts
```

---

## Task 7: 물리 월드 래퍼

**Files:**
- Create: `src/physics/world.ts`

matter.js 엔진을 감싼다. 중력 0, 공 추가/제거/스텝, 인력 적용.

- [ ] **Step 1: 구현**

```ts
// src/physics/world.ts
import Matter from 'matter-js';
import type { BallId, Vec2 } from '../types';
import { inwardForce } from './force';

export interface PhysicsWorld {
  engine: Matter.Engine;
  bodies: Map<BallId, Matter.Body>;
  center: Vec2;
}

export interface SpawnSpec {
  id: BallId;
  pos: Vec2;
  velocity: Vec2;
  radius: number;
}

export function createWorld(center: Vec2): PhysicsWorld {
  const engine = Matter.Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;
  return { engine, bodies: new Map(), center };
}

export function spawnBall(world: PhysicsWorld, spec: SpawnSpec): void {
  const body = Matter.Bodies.circle(spec.pos.x, spec.pos.y, spec.radius, {
    restitution: 0.85,
    frictionAir: 0.001,
    friction: 0,
  });
  Matter.Body.setVelocity(body, spec.velocity);
  Matter.Composite.add(world.engine.world, body);
  world.bodies.set(spec.id, body);
}

export function removeBall(world: PhysicsWorld, id: BallId): void {
  const body = world.bodies.get(id);
  if (!body) return;
  Matter.Composite.remove(world.engine.world, body);
  world.bodies.delete(id);
}

// 모든 공에 중심 인력 적용 후 한 스텝 진행
export function step(world: PhysicsWorld, strength: number, deltaMs: number): void {
  for (const body of world.bodies.values()) {
    const f = inwardForce(body.position, world.center, strength);
    Matter.Body.applyForce(body, body.position, f);
  }
  Matter.Engine.update(world.engine, deltaMs);
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Checkpoint**

```bash
git add src/physics/world.ts
```

---

## Task 8: 보울 지오메트리 + 초기 배치 + 빠짐 판정

**Files:**
- Create: `src/game/drain.ts`

보울 반경/배수구 반경/공 반경 등 상수, 매판 랜덤 초기 배치 생성, 빠짐 판정, 인력 램프.

- [ ] **Step 1: 구현**

```ts
// src/game/drain.ts
import type { BallId, Vec2 } from '../types';
import type { PhysicsWorld, SpawnSpec } from '../physics/world';

export interface BowlConfig {
  center: Vec2;
  bowlRadius: number;   // 공이 노는 영역 반경
  drainRadius: number;  // 중앙 구멍 반경 (이 안에 들면 빠짐)
  ballRadius: number;
}

export function makeBowlConfig(center: Vec2, viewRadius: number): BowlConfig {
  return {
    center,
    bowlRadius: viewRadius * 0.92,
    drainRadius: viewRadius * 0.06,
    ballRadius: Math.max(8, viewRadius * 0.035),
  };
}

// 매판 랜덤: 중간 링에 고르게 흩뿌리고 접선 속도 부여
export function makeSpawnSpecs(ids: BallId[], cfg: BowlConfig): SpawnSpec[] {
  const { center, bowlRadius, ballRadius } = cfg;
  const innerStart = bowlRadius * 0.45;
  const outerEnd = bowlRadius * 0.85;
  return ids.map((id) => {
    const angle = Math.random() * Math.PI * 2;
    const r = innerStart + Math.random() * (outerEnd - innerStart);
    const pos: Vec2 = {
      x: center.x + Math.cos(angle) * r,
      y: center.y + Math.sin(angle) * r,
    };
    // 접선 방향(반지름에 수직) + 약간의 랜덤
    const speed = 4 + Math.random() * 3;
    const dir = Math.random() < 0.5 ? 1 : -1; // 회전 방향 랜덤 (판마다 통일하려면 바깥에서 고정)
    const velocity: Vec2 = {
      x: -Math.sin(angle) * speed * dir + (Math.random() - 0.5),
      y: Math.cos(angle) * speed * dir + (Math.random() - 0.5),
    };
    return { id, pos, velocity, radius: ballRadius };
  });
}

// 중심에서 drainRadius 안에 든 공 id 목록 (가까운 순)
export function detectDrained(world: PhysicsWorld, cfg: BowlConfig): BallId[] {
  const hits: { id: BallId; dist: number }[] = [];
  for (const [id, body] of world.bodies) {
    const dx = body.position.x - cfg.center.x;
    const dy = body.position.y - cfg.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < cfg.drainRadius) hits.push({ id, dist });
  }
  return hits.sort((a, b) => a.dist - b.dist).map((h) => h.id);
}

// 시간 경과로 인력 증가 (수렴 보장). elapsedMs 기준 선형 램프.
export function strengthAt(elapsedMs: number): number {
  const base = 0.00018;
  const ramp = 0.00018 * (elapsedMs / 8000); // 8초마다 base만큼 가중
  return base + ramp;
}
```

참고: `applyForce`는 질량에 비례하므로 strength 값은 작다(0.0002 스케일). 실제 손맛은 수동 튜닝 단계(Task 12)에서 조정한다.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Checkpoint**

```bash
git add src/game/drain.ts
```

---

## Task 9: 게임 엔진 (루프·빠짐 순서·종료·결과)

**Files:**
- Create: `src/game/ball.ts`, `src/game/engine.ts`

- [ ] **Step 1: ball.ts 작성**

```ts
// src/game/ball.ts
import type { BallId } from '../types';

export interface Ball {
  id: BallId;
  name: string;
  color: string;
  draining: boolean;   // 빠짐 애니메이션 중
  drainProgress: number; // 0..1 (1이면 완전히 사라짐)
}
```

- [ ] **Step 2: engine.ts 작성**

```ts
// src/game/engine.ts
import type { BallId, BallInit, Vec2, WinnerRule } from '../types';
import { createWorld, spawnBall, removeBall, step, type PhysicsWorld } from '../physics/world';
import {
  makeBowlConfig, makeSpawnSpecs, detectDrained, strengthAt, type BowlConfig,
} from './drain';
import type { Ball } from './ball';
import { deriveRanking } from '../ranking';

export interface EngineCallbacks {
  onDrain?: (id: BallId, drainOrder: BallId[]) => void;
  onFinish?: (ranking: BallId[]) => void;
}

const MAX_RUN_MS = 60_000; // 종료 보장 타임아웃
const DRAIN_ANIM_MS = 350;

export class Engine {
  readonly cfg: BowlConfig;
  private world: PhysicsWorld;
  readonly balls: Map<BallId, Ball> = new Map();
  private drainOrder: BallId[] = [];
  private elapsed = 0;
  private finished = false;
  private rule: WinnerRule;
  private cbs: EngineCallbacks;

  constructor(
    inits: BallInit[],
    center: Vec2,
    viewRadius: number,
    rule: WinnerRule,
    cbs: EngineCallbacks = {},
  ) {
    this.cfg = makeBowlConfig(center, viewRadius);
    this.world = createWorld(center);
    this.rule = rule;
    this.cbs = cbs;
    for (const init of inits) {
      this.balls.set(init.id, {
        id: init.id, name: init.name, color: init.color,
        draining: false, drainProgress: 0,
      });
    }
    const specs = makeSpawnSpecs(inits.map((b) => b.id), this.cfg);
    for (const spec of specs) spawnBall(this.world, spec);
  }

  bodyPos(id: BallId): Vec2 | undefined {
    return this.world.bodies.get(id)?.position;
  }

  isFinished(): boolean {
    return this.finished;
  }

  // deltaMs 진행. 빠짐/종료 처리.
  tick(deltaMs: number): void {
    if (this.finished) return;
    this.elapsed += deltaMs;

    step(this.world, strengthAt(this.elapsed), deltaMs);

    // 빠짐 애니메이션 진행
    for (const ball of this.balls.values()) {
      if (ball.draining) {
        ball.drainProgress = Math.min(1, ball.drainProgress + deltaMs / DRAIN_ANIM_MS);
      }
    }

    // 새로 구멍에 든 공 처리
    for (const id of detectDrained(this.world, this.cfg)) {
      const ball = this.balls.get(id);
      if (ball && !ball.draining) {
        ball.draining = true;
        this.drainOrder.push(id);
        removeBall(this.world, id); // 물리에서 제거 (애니는 렌더가 처리)
        this.cbs.onDrain?.(id, [...this.drainOrder]);
      }
    }

    // 타임아웃 가드: 남은 공 강제 정리(중심 가까운 순)
    if (this.elapsed > MAX_RUN_MS) {
      const remaining = [...this.world.bodies.keys()].sort((a, b) => {
        const pa = this.world.bodies.get(a)!.position;
        const pb = this.world.bodies.get(b)!.position;
        const da = Math.hypot(pa.x - this.cfg.center.x, pa.y - this.cfg.center.y);
        const db = Math.hypot(pb.x - this.cfg.center.x, pb.y - this.cfg.center.y);
        return da - db;
      });
      for (const id of remaining) {
        const ball = this.balls.get(id)!;
        ball.draining = true;
        this.drainOrder.push(id);
        removeBall(this.world, id);
        this.cbs.onDrain?.(id, [...this.drainOrder]);
      }
    }

    // 종료 판정: 물리 바디 전부 비고 애니메이션도 끝남
    if (this.world.bodies.size === 0) {
      const animating = [...this.balls.values()].some(
        (b) => b.draining && b.drainProgress < 1,
      );
      if (!animating) {
        this.finished = true;
        this.cbs.onFinish?.(deriveRanking(this.drainOrder, this.rule));
      }
    }
  }

  ranking(): BallId[] {
    return deriveRanking(this.drainOrder, this.rule);
  }
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Checkpoint**

```bash
git add src/game/ball.ts src/game/engine.ts
```

---

## Task 10: 렌더러

**Files:**
- Create: `src/render/renderer.ts`

보울 링, 중앙 구멍, 공(이름 라벨), 빠짐 시 축소 애니메이션을 캔버스에 그린다.

- [ ] **Step 1: 구현**

```ts
// src/render/renderer.ts
import type { Engine } from '../game/engine';

const BG = '#0f1117';
const RING = '#2a2f3a';
const HOLE = '#05070b';
const LABEL = '#ffffff';

function truncate(name: string, max = 8): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

export function render(ctx: CanvasRenderingContext2D, engine: Engine): void {
  const { center, bowlRadius, drainRadius, ballRadius } = engine.cfg;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // 보울 링
  ctx.strokeStyle = RING;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, bowlRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 중앙 구멍
  ctx.fillStyle = HOLE;
  ctx.beginPath();
  ctx.arc(center.x, center.y, drainRadius, 0, Math.PI * 2);
  ctx.fill();

  // 공
  for (const ball of engine.balls.values()) {
    if (ball.draining && ball.drainProgress >= 1) continue;

    let pos = engine.bodyPos(ball.id);
    // 빠짐 애니메이션 중이면 물리 바디가 없으니 중심으로 수렴 표시
    if (!pos) pos = center;

    const scale = ball.draining ? 1 - ball.drainProgress : 1;
    const r = ballRadius * scale;
    if (r <= 0.5) continue;

    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (!ball.draining) {
      ctx.fillStyle = LABEL;
      ctx.font = `${Math.round(ballRadius * 0.7)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncate(ball.name), pos.x, pos.y);
    }
  }
}
```

참고: 빠짐 애니 중 위치 보간이 더 자연스러우려면 제거 직전 위치를 ball에 저장해 쓰는 개선이 가능(Task 12 튜닝). MVP는 중심 수렴으로 충분.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Checkpoint**

```bash
git add src/render/renderer.ts
```

---

## Task 11: UI 컨트롤

**Files:**
- Create: `src/ui/controls.ts`

입력 패널(이름·시작·결과모드·1등기준), 캔버스, 실시간 순위, 결과 오버레이 DOM을 만들고 콜백을 노출한다.

- [ ] **Step 1: 구현**

```ts
// src/ui/controls.ts
import type { ResultMode, WinnerRule } from '../types';

export interface StartConfig {
  names: string[];
  rule: WinnerRule;
  mode: ResultMode;
}

export interface UI {
  canvas: HTMLCanvasElement;
  onStart(handler: (cfg: StartConfig) => void): void;
  setLiveRanking(names: string[]): void;
  showResult(ranking: string[], mode: ResultMode): void;
  reset(): void;
}

export function mountUI(root: HTMLElement): UI {
  root.innerHTML = `
    <div class="layout">
      <aside class="panel">
        <h1>소용돌이 배수구 룰렛</h1>
        <textarea id="names" rows="10" placeholder="한 줄에 한 명"></textarea>
        <label>1등 기준
          <select id="rule">
            <option value="last-out">마지막에 빠진 사람</option>
            <option value="first-out">먼저 빠진 사람</option>
          </select>
        </label>
        <label>결과 모드
          <select id="mode">
            <option value="ranking">전체 순위</option>
            <option value="winner">당첨 1명</option>
            <option value="penalty">벌칙 1명</option>
          </select>
        </label>
        <button id="start">시작</button>
        <p id="hint"></p>
        <ol id="live"></ol>
      </aside>
      <main class="stage">
        <canvas id="canvas" width="640" height="640"></canvas>
        <div id="overlay" class="overlay hidden"></div>
      </main>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const namesEl = $<HTMLTextAreaElement>('#names');
  const ruleEl = $<HTMLSelectElement>('#rule');
  const modeEl = $<HTMLSelectElement>('#mode');
  const startEl = $<HTMLButtonElement>('#start');
  const hintEl = $<HTMLParagraphElement>('#hint');
  const liveEl = $<HTMLOListElement>('#live');
  const overlayEl = $<HTMLDivElement>('#overlay');
  const canvas = $<HTMLCanvasElement>('#canvas');

  let startHandler: ((cfg: StartConfig) => void) | null = null;

  startEl.addEventListener('click', () => {
    const names = namesEl.value
      .split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    if (names.length < 2) {
      hintEl.textContent = '최소 2명 이상 입력하세요.';
      return;
    }
    hintEl.textContent = '';
    overlayEl.classList.add('hidden');
    liveEl.innerHTML = '';
    startHandler?.({
      names,
      rule: ruleEl.value as WinnerRule,
      mode: modeEl.value as ResultMode,
    });
  });

  return {
    canvas,
    onStart(handler) { startHandler = handler; },
    setLiveRanking(names) {
      liveEl.innerHTML = names.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    },
    showResult(ranking, mode) {
      overlayEl.classList.remove('hidden');
      overlayEl.innerHTML = renderResult(ranking, mode);
    },
    reset() {
      overlayEl.classList.add('hidden');
      liveEl.innerHTML = '';
    },
  };
}

function renderResult(ranking: string[], mode: ResultMode): string {
  if (ranking.length === 0) return '';
  if (mode === 'winner') {
    return `<div class="result"><h2>🎉 당첨</h2><p class="big">${escapeHtml(ranking[0])}</p></div>`;
  }
  if (mode === 'penalty') {
    const last = ranking[ranking.length - 1];
    return `<div class="result"><h2>💀 벌칙</h2><p class="big">${escapeHtml(last)}</p></div>`;
  }
  const items = ranking.map((n, i) => `<li>${i + 1}. ${escapeHtml(n)}</li>`).join('');
  return `<div class="result"><h2>최종 순위</h2><ol>${items}</ol></div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Checkpoint**

```bash
git add src/ui/controls.ts
```

---

## Task 12: 배선 + 스타일 + 브라우저 수동 검증/튜닝

**Files:**
- Create: `src/style.css`
- Modify: `src/main.ts`, `index.html`

- [ ] **Step 1: style.css 작성**

```css
/* src/style.css */
* { box-sizing: border-box; }
body { margin: 0; font-family: sans-serif; background: #0f1117; color: #e6e6e6; }
.layout { display: flex; height: 100vh; }
.panel { width: 280px; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #161922; overflow-y: auto; }
.panel h1 { font-size: 18px; margin: 0 0 8px; }
.panel textarea { width: 100%; resize: vertical; background: #0f1117; color: #e6e6e6; border: 1px solid #2a2f3a; border-radius: 6px; padding: 8px; }
.panel label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.panel select { padding: 6px; background: #0f1117; color: #e6e6e6; border: 1px solid #2a2f3a; border-radius: 6px; }
.panel button { padding: 10px; font-size: 15px; font-weight: bold; background: #4363d8; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
.panel button:hover { background: #5474e9; }
#hint { color: #ff6b6b; font-size: 13px; min-height: 16px; margin: 0; }
#live { font-size: 13px; padding-left: 20px; }
.stage { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); }
.overlay.hidden { display: none; }
.result { background: #161922; padding: 24px 40px; border-radius: 12px; text-align: center; max-height: 80vh; overflow-y: auto; }
.result .big { font-size: 32px; font-weight: bold; }
.result ol { text-align: left; }
```

- [ ] **Step 2: main.ts 작성 (배선 + 애니메이션 루프)**

```ts
// src/main.ts
import './style.css';
import { mountUI } from './ui/controls';
import { Engine } from './game/engine';
import { render } from './render/renderer';
import { assignColors } from './colors';
import type { BallInit, ResultMode } from './types';

const ui = mountUI(document.querySelector<HTMLDivElement>('#app')!);
const ctx = ui.canvas.getContext('2d')!;
const center = { x: ui.canvas.width / 2, y: ui.canvas.height / 2 };
const viewRadius = Math.min(ui.canvas.width, ui.canvas.height) / 2;

let engine: Engine | null = null;
let raf = 0;
let last = 0;
let currentMode: ResultMode = 'ranking';

ui.onStart((cfg) => {
  cancelAnimationFrame(raf);
  currentMode = cfg.mode;

  const colors = assignColors(cfg.names.length);
  const inits: BallInit[] = cfg.names.map((name, i) => ({ id: i, name, color: colors[i] }));
  const idToName = new Map(inits.map((b) => [b.id, b.name]));

  engine = new Engine(inits, center, viewRadius, cfg.rule, {
    onDrain: () => {
      // 실시간 순위: 현재까지 확정된 순위를 1등 기준에 맞춰 표시
      const ranked = engine!.ranking().map((id) => idToName.get(id)!);
      ui.setLiveRanking(ranked);
    },
    onFinish: (ranking) => {
      ui.showResult(ranking.map((id) => idToName.get(id)!), currentMode);
    },
  });

  last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(now - last, 40); // 큰 점프 방지
    last = now;
    engine!.tick(dt);
    render(ctx, engine!);
    if (!engine!.isFinished()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
});
```

참고: `onDrain`의 실시간 순위는 "확정된 순위"만 보이도록 엔진 ranking()이 아직 안 빠진 공도 포함하는 점에 주의. MVP에서는 단순화를 위해 전체 ranking()을 갱신 표시한다. 더 정확히 "빠진 사람만 순차 표시"가 필요하면 튜닝 단계에서 drainOrder 기반 부분 리스트로 교체.

- [ ] **Step 3: 빌드 + 타입 체크**

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음.

- [ ] **Step 4: 개발 서버 수동 검증**

Run: `npm run dev`
브라우저에서 확인할 것:
1. 이름 5개 입력 → 시작 → 공들이 소용돌이치며 중앙 구멍으로 하나씩 빠지는가.
2. 전원 빠지면 결과 오버레이가 뜨는가.
3. "1등 기준" 토글(먼저/마지막)에 따라 결과 순위가 뒤집히는가.
4. 결과 모드(당첨/벌칙/순위) 표시가 맞는가.
5. 1명만 입력 시 "최소 2명" 힌트가 뜨고 시작 안 되는가.
6. 60초 안에 반드시 끝나는가(무한 궤도 없음).

- [ ] **Step 5: 손맛 튜닝**

검증 중 다음을 조정한다(값만 수정, 구조 변경 금지):
- `strengthAt`의 base/ramp: 너무 빨리 빨려들면 base 낮추고, 안 빨려들면 높인다.
- `makeSpawnSpecs`의 speed: 소용돌이 속도감.
- `restitution`/`frictionAir`(world.ts): 통통거림.
- `makeBowlConfig`의 drainRadius/ballRadius 비율.

조정 후 Step 4 재확인. 목표: 10~30초 내 카오스하게 수렴, 막판 1~2개 남았을 때 긴장감.

- [ ] **Step 6: Checkpoint**

```bash
git add -A
```

---

## 완료 기준

- `npm run test` 전부 통과(input, ranking, colors, force).
- `npm run build` 성공.
- 브라우저에서 한 사이클 룰렛이 동작: 입력 → 소용돌이 → 전원 빠짐 → 순위/당첨/벌칙 표시.
- 1등 기준·결과 모드 토글 동작.
- 2명 미만 가드 동작.
- 60초 타임아웃 종료 보장.

## 비범위 (이번 plan 제외)

- 싸움/아이템, 다중 배수구/포켓, 맵 생성, 21명+ 최적화, 진짜 균등확률 연출 모드.
