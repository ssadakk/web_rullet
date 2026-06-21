import Matter from 'matter-js';
import type { BallId, Vec2 } from '../types';
import type { Course } from './course';
import type { Rng } from './rng';
import type { PhysicsWorld } from '../physics/world';

const BASE_DT = 1000 / 60;
const TELEPORT_COOLDOWN_MS = 600;
const LAUNCH_COOLDOWN_MS = 500;
const POP_COOLDOWN_MS = 450;
const KICK_COOLDOWN_MS = 500;

export interface DeviceEvent {
  x: number;
  y: number;
  kind: 'teleport' | 'jump' | 'cannon' | 'pop' | 'trampoline';
  ballId: BallId;
}

// 회전 범퍼를 키네마틱하게 회전 (static body 각도 갱신)
export function rotateSpinners(world: PhysicsWorld, deltaMs: number): void {
  const k = deltaMs / BASE_DT;
  for (const s of world.spinners) {
    Matter.Body.setAngle(s.body, s.body.angle + s.speed * k);
  }
}

// 시소: 판자 위 공들의 레버암 합 → 각가속 → 각속도 적분(감쇠·상한) → 각도 클램프.
// constraint 없이 코드로 구동해 스피너와 같은 결정론 패턴을 유지한다.
const SEESAW_TILT = 1.6e-5;   // 레버암 px당 각가속 (rad/frame²) — 공 1개로 ~0.7s 내 덤프
const SEESAW_RETURN = 0.002;  // 빈 판자 휴지 각도 복원 스프링
const SEESAW_DAMP = 0.95;     // 프레임당 각속도 감쇠
const SEESAW_MAX_W = 0.045;   // 각속도 상한 — 판자 끝 선속도 ≈ 6px/frame < 터널링 한계

export function updateSeesaws(world: PhysicsWorld, course: Course, deltaMs: number): void {
  const k = deltaMs / BASE_DT;
  for (let i = 0; i < course.seesaws.length; i++) {
    const spec = course.seesaws[i];
    const sw = world.seesaws[i];
    if (!sw) continue;
    const angle = sw.body.angle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let accel = 0;
    let loaded = false;
    for (const body of world.bodies.values()) {
      const rx = body.position.x - spec.x;
      const ry = body.position.y - spec.y;
      const along = rx * dirX + ry * dirY;  // 판자 축 방향 레버암
      const perp = -rx * dirY + ry * dirX;  // 축 직각 (음수 = 판자 위쪽)
      if (Math.abs(along) > spec.length / 2 + course.ballRadius) continue;
      if (perp > 0 || perp < -(spec.thickness / 2 + course.ballRadius + 6)) continue;
      accel += along * SEESAW_TILT;
      loaded = true;
    }
    if (!loaded) accel = (spec.angle - angle) * SEESAW_RETURN; // 빈 판자: 휴지 바이어스로 복원
    sw.angularVel = (sw.angularVel + accel * k) * Math.pow(SEESAW_DAMP, k);
    sw.angularVel = Math.max(-SEESAW_MAX_W, Math.min(SEESAW_MAX_W, sw.angularVel));
    let next = angle + sw.angularVel * k;
    if (next > spec.maxAngle) { next = spec.maxAngle; sw.angularVel = 0; }
    else if (next < -spec.maxAngle) { next = -spec.maxAngle; sw.angularVel = 0; }
    Matter.Body.setAngle(sw.body, next);
  }
}

function inRect(p: Vec2, x: number, y: number, w: number, h: number): boolean {
  return p.x >= x - w / 2 && p.x <= x + w / 2 && p.y >= y - h / 2 && p.y <= y + h / 2;
}

// 부스터 패드: 영역 안의 공에 임펄스 (가속·역전)
export function applyBoosters(world: PhysicsWorld, course: Course): void {
  if (course.boosters.length === 0) return;
  for (const body of world.bodies.values()) {
    for (const b of course.boosters) {
      if (inRect(body.position, b.x, b.y, b.w, b.h)) {
        Matter.Body.applyForce(body, body.position, { x: b.fx, y: b.fy });
      }
    }
  }
}

// 순간이동: 입구 원 안에 들면 출구로 이동
export function applyTeleports(
  world: PhysicsWorld,
  course: Course,
  cooldown: Map<BallId, number>,
  elapsedMs: number,
  rng: Rng,
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  if (course.teleports.length === 0) return events;
  for (const [id, body] of world.bodies) {
    if (elapsedMs - (cooldown.get(id) ?? -Infinity) < TELEPORT_COOLDOWN_MS) continue;
    for (const t of course.teleports) {
      const dx = body.position.x - t.ex;
      const dy = body.position.y - t.ey;
      if (dx * dx + dy * dy <= t.er * t.er) {
        Matter.Body.setPosition(body, { x: t.tx, y: t.ty });
        Matter.Body.setVelocity(body, { x: (rng() - 0.5) * 2, y: 2 });
        cooldown.set(id, elapsedMs);
        events.push({ x: t.tx, y: t.ty, kind: 'teleport', ballId: id });
        break;
      }
    }
  }
  return events;
}

// 점프대(위로 발사) + 대포(강하게 발사). 쿨다운으로 즉시 재발동 방지.
export function applyLaunchers(
  world: PhysicsWorld,
  course: Course,
  cooldown: Map<BallId, number>,
  elapsedMs: number,
  rng: Rng,
  stuck: Set<BallId>,
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  if (course.jumppads.length === 0 && course.cannons.length === 0) return events;
  for (const [id, body] of world.bodies) {
    if (elapsedMs - (cooldown.get(id) ?? -Infinity) < LAUNCH_COOLDOWN_MS) continue;
    if (stuck.has(id)) continue; // 정체 공은 런처가 양보 — antiStuck이 끌어내리게
    let fired = false;
    for (const j of course.jumppads) {
      if (inRect(body.position, j.x, j.y, j.w, j.h)) {
        Matter.Body.setVelocity(body, { x: (rng() - 0.5) * 5, y: j.vy });
        cooldown.set(id, elapsedMs);
        events.push({ x: j.x, y: j.y, kind: 'jump', ballId: id });
        fired = true;
        break;
      }
    }
    if (fired) continue;
    for (const c of course.cannons) {
      if (inRect(body.position, c.x, c.y, c.w, c.h)) {
        Matter.Body.setVelocity(body, { x: c.vx, y: c.vy });
        cooldown.set(id, elapsedMs);
        events.push({ x: c.x, y: c.y, kind: 'cannon', ballId: id });
        break;
      }
    }
  }
  return events;
}

// 트램펄린(고무줄 반동): 위에서 닿으면 점프대보다 강하게 위로 튕긴다. 쿨다운으로 재발동 방지.
export function applyTrampolines(
  world: PhysicsWorld,
  course: Course,
  cooldown: Map<BallId, number>,
  elapsedMs: number,
  rng: Rng,
  stuck: Set<BallId>,
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  if (course.trampolines.length === 0) return events;
  for (const [id, body] of world.bodies) {
    if (elapsedMs - (cooldown.get(id) ?? -Infinity) < LAUNCH_COOLDOWN_MS) continue;
    if (stuck.has(id)) continue; // 정체 공은 런처가 양보 — antiStuck이 끌어내리게
    for (const t of course.trampolines) {
      // 윗면 접촉대만 발동 — 아래/옆에서 스치는 공은 일반 물리에 맡긴다
      if (body.position.x < t.x - t.w / 2 || body.position.x > t.x + t.w / 2) continue;
      const dy = body.position.y - t.y;
      if (dy < -(t.h / 2 + course.ballRadius + 4) || dy > t.h / 2 + course.ballRadius) continue;
      // 부호만 랜덤·크기는 보장된 수평 킥 — 매 발사가 패드를 확실히 벗어나 수직 핑퐁 클로깅을 깬다.
      // (vy를 낮게 잡아 속도 클램프가 수평 성분을 먹지 않게 함 → 한 번에 패드 밖으로)
      const kick = (rng() < 0.5 ? -1 : 1) * (5 + rng() * 3);
      Matter.Body.setVelocity(body, { x: kick, y: t.vy });
      cooldown.set(id, elapsedMs);
      events.push({ x: t.x, y: t.y, kind: 'trampoline', ballId: id });
      break;
    }
  }
  return events;
}

// 팝 범퍼: 닿으면 중심 반대 방향으로 강타(+상향 바이어스). 위에서 맞으면 위로 솟구친다.
export function applyPops(
  world: PhysicsWorld,
  course: Course,
  cooldown: Map<BallId, number>,
  elapsedMs: number,
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  if (course.pops.length === 0) return events;
  for (const [id, body] of world.bodies) {
    if (elapsedMs - (cooldown.get(id) ?? -Infinity) < POP_COOLDOWN_MS) continue;
    for (const p of course.pops) {
      const dx = body.position.x - p.x;
      const dy = body.position.y - p.y;
      const reach = p.r + course.ballRadius + 2;
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2) || 1;
      Matter.Body.setVelocity(body, { x: (dx / d) * 8, y: (dy / d) * 8 - 2 });
      cooldown.set(id, elapsedMs);
      events.push({ x: p.x, y: p.y, kind: 'pop', ballId: id });
      break;
    }
  }
  return events;
}

// 배팅 스피너: kick 플래그 스피너의 블레이드에 닿은 공을 접점 탄젠셜 방향으로 쳐낸다.
// 위로 쳐올리는 방향일 때만 발동(반전 연출) — 아래로 칠 때는 일반 충돌 물리에 맡긴다.
export function applySpinnerKicks(
  world: PhysicsWorld,
  course: Course,
  cooldown: Map<BallId, number>,
  elapsedMs: number,
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  for (let i = 0; i < course.spinners.length; i++) {
    const sp = course.spinners[i];
    if (!sp.kick) continue;
    const angle = world.spinners[i]?.body.angle ?? sp.angle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    for (const [id, body] of world.bodies) {
      if (elapsedMs - (cooldown.get(id) ?? -Infinity) < KICK_COOLDOWN_MS) continue;
      const rx = body.position.x - sp.x;
      const ry = body.position.y - sp.y;
      const along = rx * dirX + ry * dirY;  // 블레이드 축 방향 성분
      const perp = -rx * dirY + ry * dirX;  // 축 직각 성분
      if (Math.abs(along) > sp.length / 2 + course.ballRadius) continue;
      if (Math.abs(perp) > sp.thickness / 2 + course.ballRadius + 3) continue;
      // 접점 탄젠셜 속도 v = ω×r 를 증폭 (회전이 빠르고 끝쪽일수록 강하게)
      const K = 3.2;
      const vx = -sp.speed * ry * K;
      const vy = sp.speed * rx * K;
      if (vy > -2) continue; // 위로 충분히 쳐올릴 때만
      Matter.Body.setVelocity(body, { x: vx, y: vy });
      cooldown.set(id, elapsedMs);
      events.push({ x: body.position.x, y: body.position.y, kind: 'pop', ballId: id });
    }
  }
  return events;
}
