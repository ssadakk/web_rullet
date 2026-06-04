import Matter from 'matter-js';
import type { BallId, BallInit, Vec2 } from '../types';
import { createWorld, spawnBall, removeBall, step, type PhysicsWorld } from '../physics/world';
import { rotateSpinners, applyBoosters, applyTeleports } from './devices';
import type { Course } from './course';
import type { Ball } from './ball';

export interface EngineCallbacks {
  onFinish?: (id: BallId, finishOrder: BallId[]) => void;
  onComplete?: (ranking: BallId[]) => void;
}

const MAX_RUN_MS = 45_000;
const TRAIL_LEN = 10;

export class Engine {
  readonly course: Course;
  private world: PhysicsWorld;
  readonly balls: Map<BallId, Ball> = new Map();
  private finishOrder: BallId[] = [];
  private teleportCd: Map<BallId, number> = new Map();
  private progress: Map<BallId, { bestY: number; sinceMs: number }> = new Map();
  private elapsed = 0;
  private finished = false;
  private lastLeaderY = 0;
  private cbs: EngineCallbacks;

  constructor(inits: BallInit[], course: Course, cbs: EngineCallbacks = {}) {
    this.course = course;
    this.world = createWorld(course);
    this.cbs = cbs;
    this.lastLeaderY = course.startY;

    const left = course.wallThickness + 30;
    const right = course.width - course.wallThickness - 30;
    for (const init of inits) {
      this.balls.set(init.id, {
        id: init.id, name: init.name, color: init.color, finished: false, trail: [],
      });
      const x = left + Math.random() * (right - left);
      spawnBall(this.world, init.id, { x, y: course.startY }, (Math.random() - 0.5) * 2, course.ballRadius);
    }
  }

  isFinished(): boolean {
    return this.finished;
  }

  bodyPos(id: BallId): Vec2 | undefined {
    return this.world.bodies.get(id)?.position;
  }

  // 코스 순서대로 회전 범퍼의 현재 각도
  spinnerAngles(): number[] {
    return this.world.spinners.map((s) => s.body.angle);
  }

  // 선두(가장 아래) 공의 y. 전부 도착했으면 마지막 값 유지.
  leaderY(): number {
    let maxY = -Infinity;
    for (const body of this.world.bodies.values()) {
      if (body.position.y > maxY) maxY = body.position.y;
    }
    if (maxY > -Infinity) this.lastLeaderY = maxY;
    return this.lastLeaderY;
  }

  // 선두 공의 수직 속도 (카메라 look-ahead용)
  leaderVY(): number {
    let maxY = -Infinity, vy = 0;
    for (const body of this.world.bodies.values()) {
      if (body.position.y > maxY) { maxY = body.position.y; vy = body.velocity.y; }
    }
    return vy;
  }

  // 활성 공들의 수직 산포(최대-최소 y). 카메라 줌 조절용.
  spreadY(): number {
    let mn = Infinity, mx = -Infinity;
    for (const body of this.world.bodies.values()) {
      if (body.position.y < mn) mn = body.position.y;
      if (body.position.y > mx) mx = body.position.y;
    }
    return mx > mn ? mx - mn : 0;
  }

  activeCount(): number {
    return this.world.bodies.size;
  }

  // 아래로 진행이 멈춘 공을 정체 시간에 비례해 점점 세게 쳐서 반드시 풀어준다.
  private antiStuck(): void {
    for (const [id, body] of this.world.bodies) {
      let p = this.progress.get(id);
      if (!p) {
        p = { bestY: body.position.y, sinceMs: this.elapsed };
        this.progress.set(id, p);
        continue;
      }
      if (body.position.y > p.bestY + 2) {
        p.bestY = body.position.y;
        p.sinceMs = this.elapsed;
        continue;
      }
      const stall = this.elapsed - p.sinceMs;
      if (stall > 350) {
        const mag = 2 + Math.min(8, stall / 250); // 오래 막힐수록 강하게
        Matter.Body.setVelocity(body, {
          x: (Math.random() - 0.5) * mag,
          y: Math.max(body.velocity.y, 0) + 1.2,
        });
      }
    }
  }

  private finishBall(id: BallId): void {
    const ball = this.balls.get(id);
    if (!ball || ball.finished) return;
    ball.finished = true;
    ball.trail = [];
    this.progress.delete(id);
    this.finishOrder.push(id);
    removeBall(this.world, id);
    this.cbs.onFinish?.(id, [...this.finishOrder]);
  }

  tick(deltaMs: number): void {
    if (this.finished) return;
    this.elapsed += deltaMs;

    rotateSpinners(this.world, deltaMs);
    applyBoosters(this.world, this.course);
    applyTeleports(this.world, this.course, this.teleportCd, this.elapsed);
    this.antiStuck();
    step(this.world, deltaMs);

    // 트레일 갱신
    for (const [id, body] of this.world.bodies) {
      const ball = this.balls.get(id)!;
      ball.trail.push({ x: body.position.x, y: body.position.y });
      if (ball.trail.length > TRAIL_LEN) ball.trail.shift();
    }

    // 결승선 통과 처리 (여러 개면 더 아래쪽부터)
    const crossed: { id: BallId; y: number }[] = [];
    for (const [id, body] of this.world.bodies) {
      if (body.position.y >= this.course.finishY) crossed.push({ id, y: body.position.y });
    }
    crossed.sort((a, b) => b.y - a.y);
    for (const c of crossed) this.finishBall(c.id);

    // 타임아웃 가드: 남은 공을 현재 깊이 순으로 강제 도착
    if (this.elapsed > MAX_RUN_MS && this.world.bodies.size > 0) {
      const remaining = [...this.world.bodies.entries()]
        .sort((a, b) => b[1].position.y - a[1].position.y)
        .map(([id]) => id);
      for (const id of remaining) this.finishBall(id);
    }

    if (this.world.bodies.size === 0) {
      this.finished = true;
      this.cbs.onComplete?.([...this.finishOrder]);
    }
  }

  // 이미 도착한 공들의 확정 등수 (도착 순서 = 등수)
  confirmedPlacements(): { id: BallId; rank: number }[] {
    return this.finishOrder.map((id, i) => ({ id, rank: i + 1 }));
  }

  ranking(): BallId[] {
    return [...this.finishOrder];
  }
}
