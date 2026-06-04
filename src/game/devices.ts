import Matter from 'matter-js';
import type { BallId, Vec2 } from '../types';
import type { Course } from './course';
import type { PhysicsWorld } from '../physics/world';

const BASE_DT = 1000 / 60;
const TELEPORT_COOLDOWN_MS = 600;
const LAUNCH_COOLDOWN_MS = 500;

export interface DeviceEvent {
  x: number;
  y: number;
  kind: 'teleport' | 'jump' | 'cannon';
}

// 회전 범퍼를 키네마틱하게 회전 (static body 각도 갱신)
export function rotateSpinners(world: PhysicsWorld, deltaMs: number): void {
  const k = deltaMs / BASE_DT;
  for (const s of world.spinners) {
    Matter.Body.setAngle(s.body, s.body.angle + s.speed * k);
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
        Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 2 });
        cooldown.set(id, elapsedMs);
        events.push({ x: t.tx, y: t.ty, kind: 'teleport' });
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
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  if (course.jumppads.length === 0 && course.cannons.length === 0) return events;
  for (const [id, body] of world.bodies) {
    if (elapsedMs - (cooldown.get(id) ?? -Infinity) < LAUNCH_COOLDOWN_MS) continue;
    let fired = false;
    for (const j of course.jumppads) {
      if (inRect(body.position, j.x, j.y, j.w, j.h)) {
        Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 5, y: j.vy });
        cooldown.set(id, elapsedMs);
        events.push({ x: j.x, y: j.y, kind: 'jump' });
        fired = true;
        break;
      }
    }
    if (fired) continue;
    for (const c of course.cannons) {
      if (inRect(body.position, c.x, c.y, c.w, c.h)) {
        Matter.Body.setVelocity(body, { x: c.vx, y: c.vy });
        cooldown.set(id, elapsedMs);
        events.push({ x: c.x, y: c.y, kind: 'cannon' });
        break;
      }
    }
  }
  return events;
}
