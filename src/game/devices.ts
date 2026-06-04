import Matter from 'matter-js';
import type { BallId } from '../types';
import type { Course } from './course';
import type { PhysicsWorld } from '../physics/world';

const BASE_DT = 1000 / 60;
const TELEPORT_COOLDOWN_MS = 600;

// 회전 범퍼를 키네마틱하게 회전 (static body 각도 갱신)
export function rotateSpinners(world: PhysicsWorld, deltaMs: number): void {
  const k = deltaMs / BASE_DT;
  for (const s of world.spinners) {
    Matter.Body.setAngle(s.body, s.body.angle + s.speed * k);
  }
}

// 부스터 패드: 영역 안의 공에 임펄스 (가속·역전)
export function applyBoosters(world: PhysicsWorld, course: Course): void {
  if (course.boosters.length === 0) return;
  for (const body of world.bodies.values()) {
    for (const b of course.boosters) {
      if (
        body.position.x >= b.x - b.w / 2 && body.position.x <= b.x + b.w / 2 &&
        body.position.y >= b.y - b.h / 2 && body.position.y <= b.y + b.h / 2
      ) {
        Matter.Body.applyForce(body, body.position, { x: b.fx, y: b.fy });
      }
    }
  }
}

// 순간이동: 입구 원 안에 들면 출구로 이동 (쿨다운으로 즉시 재발동 방지)
export function applyTeleports(
  world: PhysicsWorld,
  course: Course,
  cooldown: Map<BallId, number>,
  elapsedMs: number,
): void {
  if (course.teleports.length === 0) return;
  for (const [id, body] of world.bodies) {
    if (elapsedMs - (cooldown.get(id) ?? -Infinity) < TELEPORT_COOLDOWN_MS) continue;
    for (const t of course.teleports) {
      const dx = body.position.x - t.ex;
      const dy = body.position.y - t.ey;
      if (dx * dx + dy * dy <= t.er * t.er) {
        Matter.Body.setPosition(body, { x: t.tx, y: t.ty });
        Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 2 });
        cooldown.set(id, elapsedMs);
        break;
      }
    }
  }
}
