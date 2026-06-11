import Matter from 'matter-js';
import type { BallId, Vec2 } from '../types';
import type { Course } from '../game/course';

export interface SpinnerBody {
  body: Matter.Body;
  speed: number;
}

export interface Hit { x: number; y: number; speed: number }

export interface PhysicsWorld {
  engine: Matter.Engine;
  bodies: Map<BallId, Matter.Body>;
  spinners: SpinnerBody[];
  hits: Hit[]; // 이번 스텝의 공-장애물 충돌 (SFX용, 매 틱 소비)
}

export function createWorld(course: Course): PhysicsWorld {
  const engine = Matter.Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 1;

  const { width, height, wallThickness: wt } = course;
  const statics: Matter.Body[] = [];

  // 좌우 벽 + 바닥 받침(결승선 아래)
  statics.push(Matter.Bodies.rectangle(wt / 2, height / 2, wt, height, { isStatic: true }));
  statics.push(Matter.Bodies.rectangle(width - wt / 2, height / 2, wt, height, { isStatic: true }));
  statics.push(Matter.Bodies.rectangle(width / 2, height + 40, width, 80, { isStatic: true }));

  for (const p of course.pegs) {
    statics.push(Matter.Bodies.circle(p.x, p.y, p.r, { isStatic: true, restitution: 0.6, friction: 0 }));
  }
  for (const b of course.bumpers) {
    statics.push(Matter.Bodies.circle(b.x, b.y, b.r, { isStatic: true, restitution: 0.82, friction: 0 }));
  }
  // 팝 범퍼: 실제 강타는 devices.ts applyPops가 처리, 바디는 터널링 방지용
  for (const p of course.pops) {
    statics.push(Matter.Bodies.circle(p.x, p.y, p.r, { isStatic: true, restitution: 0.5, friction: 0 }));
  }
  for (const s of course.slopes) {
    statics.push(Matter.Bodies.rectangle(s.x, s.y, s.w, s.h, {
      isStatic: true, angle: s.angle, restitution: 0.4, friction: 0, chamfer: { radius: 4 },
    }));
  }

  for (const s of course.splitters) {
    statics.push(Matter.Bodies.polygon(s.x, s.y, 3, s.radius, {
      isStatic: true, angle: s.angle, restitution: 0.5, friction: 0, chamfer: { radius: 3 },
    }));
  }

  const spinners: SpinnerBody[] = [];
  for (const sp of course.spinners) {
    const body = Matter.Bodies.rectangle(sp.x, sp.y, sp.length, sp.thickness, {
      isStatic: true, angle: sp.angle, restitution: 0.5, chamfer: { radius: 6 },
    });
    spinners.push({ body, speed: sp.speed });
    statics.push(body);
  }

  Matter.Composite.add(engine.world, statics);

  const world: PhysicsWorld = { engine, bodies: new Map(), spinners, hits: [] };

  // 공-장애물 충돌을 수집 (SFX 타격음용). 물리엔 영향 없음 — 읽기만.
  Matter.Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      const ball = a.label === 'ball' ? a : b.label === 'ball' ? b : null;
      const other = ball === a ? b : a;
      if (!ball || other.label === 'ball') continue; // 공-공 충돌은 제외
      const v = ball.velocity;
      world.hits.push({ x: ball.position.x, y: ball.position.y, speed: Math.hypot(v.x, v.y) });
    }
  });

  return world;
}

export function spawnBall(world: PhysicsWorld, id: BallId, pos: Vec2, vx: number, radius: number): void {
  const body = Matter.Bodies.circle(pos.x, pos.y, radius, {
    label: 'ball',
    restitution: 0.42,
    friction: 0,
    frictionAir: 0.004,
  });
  Matter.Body.setVelocity(body, { x: vx, y: 0 });
  Matter.Composite.add(world.engine.world, body);
  world.bodies.set(id, body);
}

export function removeBall(world: PhysicsWorld, id: BallId): void {
  const body = world.bodies.get(id);
  if (!body) return;
  Matter.Composite.remove(world.engine.world, body);
  world.bodies.delete(id);
}

// 가장 얇은 정적 장애물(벽/슬로프/스피너)보다 프레임당 이동이 작도록 공 속도를 제한.
// 터널링(슬로프 관통·벽 탈출)과 부스터 과가속을 함께 막는다.
const MAX_BALL_SPEED = 11;

export function step(world: PhysicsWorld, deltaMs: number): void {
  Matter.Engine.update(world.engine, deltaMs);
  for (const body of world.bodies.values()) {
    const v = body.velocity;
    const sp = Math.hypot(v.x, v.y);
    if (sp > MAX_BALL_SPEED) {
      Matter.Body.setVelocity(body, { x: (v.x / sp) * MAX_BALL_SPEED, y: (v.y / sp) * MAX_BALL_SPEED });
    }
  }
}
