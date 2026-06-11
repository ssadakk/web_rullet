import Matter from 'matter-js';
import type { BallId, BallInit, Vec2 } from '../types';
import { createWorld, spawnBall, removeBall, step, type PhysicsWorld, type Hit } from '../physics/world';
import { rotateSpinners, applyBoosters, applyTeleports, applyLaunchers, applyPops, applySpinnerKicks, type DeviceEvent } from './devices';
import type { Course } from './course';
import type { Ball } from './ball';
import { mulberry32, type Rng } from './rng';
import { Particles } from '../render/particles';

const EVENT_COLOR: Record<DeviceEvent['kind'], string> = {
  teleport: '#b46bff',
  jump: '#41f5a3',
  cannon: '#ff9b3d',
  pop: '#ff5d8f',
};

export interface EngineCallbacks {
  onFinish?: (id: BallId, finishOrder: BallId[]) => void;
  onComplete?: (ranking: BallId[]) => void;
  onDeviceEvent?: (events: DeviceEvent[]) => void; // 장치 발동 (SFX·킬피드)
  onHits?: (hits: Hit[]) => void;                  // 공-장애물 충돌 (타격 SFX)
}

const MAX_RUN_MS = 45_000;
const TRAIL_LEN = 10;
const OVERTAKE_CD_MS = 2000; // 역전 연출 최소 간격 (스크럼 스팸 방지)

export class Engine {
  readonly course: Course;
  private world: PhysicsWorld;
  readonly balls: Map<BallId, Ball> = new Map();
  private finishOrder: BallId[] = [];
  private teleportCd: Map<BallId, number> = new Map();
  private launchCd: Map<BallId, number> = new Map();
  private popCd: Map<BallId, number> = new Map();
  private kickCd: Map<BallId, number> = new Map();
  private progress: Map<BallId, { bestY: number; sinceMs: number }> = new Map();
  private elapsed = 0;
  private finished = false;
  private lastLeaderY = 0;
  private lastTailY = 0;
  private leader: BallId | null = null;
  private overtakeEvt: BallId | null = null;
  private lastOvertakeMs = -Infinity;
  private cbs: EngineCallbacks;
  readonly particles = new Particles();
  private shakeImpulse = 0;
  // 런타임 난수(스폰·anti-stuck·장치). 코스 시드에서 파생해 단일 시드로 전부 재현.
  private rng: Rng;

  constructor(inits: BallInit[], course: Course, cbs: EngineCallbacks = {}) {
    this.course = course;
    this.world = createWorld(course);
    this.cbs = cbs;
    this.lastLeaderY = course.startY;
    this.lastTailY = course.startY;
    this.rng = mulberry32((course.seed ^ 0x9e3779b9) >>> 0);

    const left = course.wallThickness + 30;
    const right = course.width - course.wallThickness - 30;
    for (const init of inits) {
      this.balls.set(init.id, {
        id: init.id, name: init.name, color: init.color, finished: false, trail: [],
      });
      const x = left + this.rng() * (right - left);
      spawnBall(this.world, init.id, { x, y: course.startY }, (this.rng() - 0.5) * 2, course.ballRadius);
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

  // 꼴찌(가장 위) 공의 y — 벌칙 모드 꼴찌 캠용. 전부 도착했으면 마지막 값 유지.
  tailY(): number {
    let mn = Infinity;
    for (const body of this.world.bodies.values()) {
      if (body.position.y < mn) mn = body.position.y;
    }
    if (mn < Infinity) this.lastTailY = mn;
    return this.lastTailY;
  }

  // 꼴찌 공의 수직 속도
  tailVY(): number {
    let mn = Infinity, vy = 0;
    for (const body of this.world.bodies.values()) {
      if (body.position.y < mn) { mn = body.position.y; vy = body.velocity.y; }
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
          x: (this.rng() - 0.5) * mag,
          y: Math.max(body.velocity.y, 0) + 1.2,
        });
      }
    }
  }

  private finishBall(id: BallId): void {
    const ball = this.balls.get(id);
    if (!ball || ball.finished) return;
    const pos = this.world.bodies.get(id)?.position;
    if (pos) this.particles.burst(pos.x, this.course.finishY, ball.color, 20, 6);
    this.shakeImpulse = Math.max(this.shakeImpulse, 9);
    ball.finished = true;
    ball.trail = [];
    this.progress.delete(id);
    this.finishOrder.push(id);
    removeBall(this.world, id);
    this.cbs.onFinish?.(id, [...this.finishOrder]);
  }

  // 역전 강화(고무줄): 뒤처진 공은 아래로 가속, 선두는 살짝 끌어 막판까지 붙인다.
  // 진행도에 비례해 감쇠 — 중반 리드가 의미를 갖고, 그랜드 퍼널부터는 순수 물리로 굳는다.
  private rubberBand(): void {
    if (this.world.bodies.size < 2) return;
    const leaderY = this.leaderY();
    const funnelY = this.funnelY();
    if (leaderY >= funnelY) return;
    const progress = Math.max(0, Math.min(1,
      (leaderY - this.course.startY) / (funnelY - this.course.startY)));
    const boostScale = 1 - progress * 0.85;
    const brakeScale = 1 - progress;
    for (const body of this.world.bodies.values()) {
      const behind = leaderY - body.position.y; // 양수 = 뒤처짐
      if (behind > 70) {
        const boost = Math.min(behind / 700, 1) * 0.0017 * body.mass * boostScale;
        Matter.Body.applyForce(body, body.position, { x: 0, y: boost });
      } else if (behind < 24) {
        Matter.Body.applyForce(body, body.position, { x: 0, y: -0.00045 * body.mass * brakeScale });
      }
    }
  }

  // 그랜드 퍼널(마지막 섹션) 시작 y — 이 지점부터 고무줄 보정 없음
  private funnelY(): number {
    const last = this.course.sections[this.course.sections.length - 1];
    return last ? last.y0 : this.course.finishY;
  }

  // 카메라가 소비할 화면 흔들림 세기 (소비 후 0)
  takeShake(): number {
    const s = this.shakeImpulse;
    this.shakeImpulse = 0;
    return s;
  }

  tick(deltaMs: number): void {
    if (this.finished) return;
    this.elapsed += deltaMs;

    rotateSpinners(this.world, deltaMs);
    applyBoosters(this.world, this.course);
    const events: DeviceEvent[] = [
      ...applyTeleports(this.world, this.course, this.teleportCd, this.elapsed, this.rng),
      ...applyLaunchers(this.world, this.course, this.launchCd, this.elapsed, this.rng),
      ...applyPops(this.world, this.course, this.popCd, this.elapsed),
      ...applySpinnerKicks(this.world, this.course, this.kickCd, this.elapsed),
    ];
    this.rubberBand();
    this.antiStuck();
    step(this.world, deltaMs);

    // 타격음: 이번 스텝의 공-장애물 충돌 (소비 후 비움)
    if (this.world.hits.length) {
      this.cbs.onHits?.(this.world.hits);
      this.world.hits.length = 0;
    }
    if (events.length) this.cbs.onDeviceEvent?.(events);

    // 장치 이벤트 → 파티클 + 화면 흔들림
    for (const e of events) {
      this.particles.burst(e.x, e.y, EVENT_COLOR[e.kind], e.kind === 'teleport' ? 12 : 16, 5);
      if (e.kind === 'cannon') this.shakeImpulse = Math.max(this.shakeImpulse, 11);
      else if (e.kind === 'jump') this.shakeImpulse = Math.max(this.shakeImpulse, 7);
      else if (e.kind === 'pop') this.shakeImpulse = Math.max(this.shakeImpulse, 6);
    }
    this.particles.update(deltaMs);

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

    // 선두 추적 + 역전 감지 (왕관·역전 연출용)
    this.trackLeader();

    // 타임아웃 가드: 남은 공을 현재 깊이 순으로 강제 도착
    if (this.elapsed > MAX_RUN_MS && this.world.bodies.size > 0) this.forceFinish();

    if (!this.finished && this.world.bodies.size === 0) {
      this.finished = true;
      this.cbs.onComplete?.([...this.finishOrder]);
    }
  }

  // 남은 공을 현재 깊이 순으로 즉시 도착 처리 (타임아웃 가드·건너뛰기 공용)
  forceFinish(): void {
    const remaining = [...this.world.bodies.entries()]
      .sort((a, b) => b[1].position.y - a[1].position.y)
      .map(([id]) => id);
    for (const id of remaining) this.finishBall(id);
    if (!this.finished && this.world.bodies.size === 0) {
      this.finished = true;
      this.cbs.onComplete?.([...this.finishOrder]);
    }
  }

  // 선두 교체 감지: 직전 선두가 아직 달리는 중일 때만 '역전'으로 친다 (도착으로 인한 승계 제외)
  private trackLeader(): void {
    let best = -Infinity;
    let lead: BallId | null = null;
    for (const [id, body] of this.world.bodies) {
      if (body.position.y > best) { best = body.position.y; lead = id; }
    }
    if (lead === null) return;
    if (this.leader !== null && lead !== this.leader && this.world.bodies.has(this.leader)
        && this.elapsed - this.lastOvertakeMs > OVERTAKE_CD_MS) {
      this.lastOvertakeMs = this.elapsed;
      this.overtakeEvt = lead;
      const pos = this.world.bodies.get(lead)!.position;
      this.particles.burst(pos.x, pos.y, '#ffd700', 14, 4);
    }
    this.leader = lead;
  }

  // 현재 선두 공 id (왕관 표시용). 전부 도착했으면 null.
  leaderId(): BallId | null {
    return this.leader !== null && this.world.bodies.has(this.leader) ? this.leader : null;
  }

  // 이번 틱 발생한 역전의 새 선두 id. 소비 후 null.
  takeOvertake(): BallId | null {
    const o = this.overtakeEvt;
    this.overtakeEvt = null;
    return o;
  }

  // 이미 도착한 공들의 확정 등수 (도착 순서 = 등수)
  confirmedPlacements(): { id: BallId; rank: number }[] {
    return this.finishOrder.map((id, i) => ({ id, rank: i + 1 }));
  }

  ranking(): BallId[] {
    return [...this.finishOrder];
  }
}
