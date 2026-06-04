import type { Engine } from '../game/engine';
import type { Course } from '../game/course';

const BG = '#06080f';
const WALL_COLOR = '#161a2b';
const PEG_COLOR = '#39d0ff';
const FINISH_COLOR = '#ff3df0';
const SPINNER_COLOR = '#ff9b3d';
const BOOSTER_COLOR = '#41f5a3';
const TELE_IN = '#b46bff';
const TELE_OUT = '#6bc6ff';
const JUMP_COLOR = '#5affa3';
const CANNON_COLOR = '#ff6a3d';
const SPLITTER_COLOR = '#9a8aff';
const LABEL = '#ffffff';

function truncate(name: string, max = 7): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
}

export interface CameraView {
  top: number;
  zoom: number;
  offX: number;
  offY: number;
}

export function render(ctx: CanvasRenderingContext2D, engine: Engine, cam: CameraView): void {
  const course = engine.course;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const z = cam.zoom;
  const top = cam.top;
  const bottom = cam.top + h / z; // 줌 적용 시 보이는 월드 높이
  const visible = (y: number, pad = 80) => y >= top - pad && y <= bottom + pad;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  // 가로는 코스 중앙 기준으로 줌, 세로는 카메라 top 기준 스크롤(+흔들림 오프셋)
  ctx.translate(w / 2 + cam.offX, cam.offY);
  ctx.scale(z, z);
  ctx.translate(-course.width / 2, -top);

  drawWalls(ctx, course);
  drawFinish(ctx, course, visible);
  drawSlopes(ctx, course, visible);
  drawSplitters(ctx, course, visible);
  drawBoosters(ctx, course, visible);
  drawJumpPads(ctx, course, visible);
  drawCannons(ctx, course, visible);
  drawTeleports(ctx, course, visible);
  drawPegs(ctx, course, visible);
  drawSpinners(ctx, engine, course, visible);
  drawBalls(ctx, engine, visible);
  drawParticles(ctx, engine, visible);

  ctx.restore();
}

function drawWalls(ctx: CanvasRenderingContext2D, course: Course): void {
  ctx.fillStyle = WALL_COLOR;
  ctx.fillRect(0, 0, course.wallThickness, course.height);
  ctx.fillRect(course.width - course.wallThickness, 0, course.wallThickness, course.height);
}

function drawFinish(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  if (!visible(course.finishY)) return;
  glow(ctx, FINISH_COLOR, 18);
  ctx.strokeStyle = FINISH_COLOR;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(course.wallThickness, course.finishY);
  ctx.lineTo(course.width - course.wallThickness, course.finishY);
  ctx.stroke();
  clearGlow(ctx);
  ctx.fillStyle = FINISH_COLOR;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FINISH', course.width / 2, course.finishY - 12);
}

function drawPegs(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  // 핀은 수가 많아 shadowBlur 글로우가 비싸다 → 저비용 2겹 원(헤일로+코어)으로 대체.
  for (const p of course.pegs) {
    if (!visible(p.y)) continue;
    ctx.fillStyle = 'rgba(57,208,255,0.16)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PEG_COLOR;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSlopes(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  glow(ctx, '#8aa0ff', 10);
  ctx.fillStyle = '#3a4474';
  for (const s of course.slopes) {
    if (!visible(s.y)) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.beginPath();
    ctx.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, 6);
    ctx.fill();
    ctx.restore();
  }
  clearGlow(ctx);
}

function drawSpinners(ctx: CanvasRenderingContext2D, engine: Engine, course: Course, visible: (y: number) => boolean): void {
  const angles = engine.spinnerAngles();
  glow(ctx, SPINNER_COLOR, 14);
  ctx.fillStyle = SPINNER_COLOR;
  course.spinners.forEach((sp, i) => {
    if (!visible(sp.y)) return;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(angles[i] ?? sp.angle);
    ctx.beginPath();
    ctx.roundRect(-sp.length / 2, -sp.thickness / 2, sp.length, sp.thickness, 6);
    ctx.fill();
    ctx.restore();
  });
  clearGlow(ctx);
  // 회전축 점
  ctx.fillStyle = '#fff';
  course.spinners.forEach((sp) => {
    if (!visible(sp.y)) return;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBoosters(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  for (const b of course.boosters) {
    if (!visible(b.y)) continue;
    glow(ctx, BOOSTER_COLOR, 14);
    ctx.fillStyle = 'rgba(65,245,163,0.25)';
    ctx.strokeStyle = BOOSTER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 6);
    ctx.fill();
    ctx.stroke();
    clearGlow(ctx);
    // 아래 방향 셰브론 (세 겹 세로로 쌓아 가속감 표현)
    ctx.strokeStyle = BOOSTER_COLOR;
    ctx.lineWidth = 3;
    for (let k = -1; k <= 1; k++) {
      const oy = k * 6;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y - 4 + oy);
      ctx.lineTo(b.x, b.y + 6 + oy);
      ctx.lineTo(b.x + 10, b.y - 4 + oy);
      ctx.stroke();
    }
  }
}

function drawTeleports(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  for (const t of course.teleports) {
    const showIn = visible(t.ey);
    const showOut = visible(t.ty);
    if (!showIn && !showOut) continue;
    if (showIn) ring(ctx, t.ex, t.ey, t.er, TELE_IN);
    if (showOut) ring(ctx, t.tx, t.ty, t.er, TELE_OUT);
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  glow(ctx, color, 14);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  clearGlow(ctx);
}

function drawJumpPads(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  for (const j of course.jumppads) {
    if (!visible(j.y)) continue;
    glow(ctx, JUMP_COLOR, 14);
    ctx.fillStyle = 'rgba(90,255,163,0.22)';
    ctx.strokeStyle = JUMP_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(j.x - j.w / 2, j.y - j.h / 2, j.w, j.h, 6);
    ctx.fill();
    ctx.stroke();
    clearGlow(ctx);
    // 위 방향 셰브론 3겹
    ctx.strokeStyle = JUMP_COLOR;
    ctx.lineWidth = 3;
    for (let k = -1; k <= 1; k++) {
      const oy = k * 6;
      ctx.beginPath();
      ctx.moveTo(j.x - 10, j.y + 4 + oy);
      ctx.lineTo(j.x, j.y - 6 + oy);
      ctx.lineTo(j.x + 10, j.y + 4 + oy);
      ctx.stroke();
    }
  }
}

function drawCannons(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  for (const c of course.cannons) {
    if (!visible(c.y)) continue;
    const dir = Math.sign(c.vx) || 1;
    glow(ctx, CANNON_COLOR, 16);
    ctx.fillStyle = 'rgba(255,106,61,0.28)';
    ctx.strokeStyle = CANNON_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, 8);
    ctx.fill();
    ctx.stroke();
    clearGlow(ctx);
    // 발사 방향 화살표(대각 아래)
    ctx.strokeStyle = CANNON_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.x - dir * 12, c.y - 6);
    ctx.lineTo(c.x + dir * 12, c.y + 8);
    ctx.moveTo(c.x + dir * 12, c.y + 8);
    ctx.lineTo(c.x + dir * 2, c.y + 8);
    ctx.moveTo(c.x + dir * 12, c.y + 8);
    ctx.lineTo(c.x + dir * 12, c.y - 2);
    ctx.stroke();
  }
}

function drawSplitters(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  glow(ctx, SPLITTER_COLOR, 12);
  ctx.fillStyle = '#4a4480';
  for (const s of course.splitters) {
    if (!visible(s.y)) continue;
    const r = s.radius;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r);          // 꼭짓점 위
    ctx.lineTo(s.x - r * 0.9, s.y + r * 0.7);
    ctx.lineTo(s.x + r * 0.9, s.y + r * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  clearGlow(ctx);
}

function drawParticles(ctx: CanvasRenderingContext2D, engine: Engine, visible: (y: number) => boolean): void {
  for (const p of engine.particles.list) {
    if (!visible(p.y)) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBalls(ctx: CanvasRenderingContext2D, engine: Engine, visible: (y: number) => boolean): void {
  const r = engine.course.ballRadius;
  for (const ball of engine.balls.values()) {
    if (ball.finished) continue;
    const pos = engine.bodyPos(ball.id);
    if (!pos || !visible(pos.y)) continue;

    // 트레일
    if (ball.trail.length > 1) {
      ctx.strokeStyle = ball.color;
      ctx.lineWidth = r * 0.8;
      ctx.lineCap = 'round';
      for (let i = 1; i < ball.trail.length; i++) {
        ctx.globalAlpha = (i / ball.trail.length) * 0.5;
        ctx.beginPath();
        ctx.moveTo(ball.trail[i - 1].x, ball.trail[i - 1].y);
        ctx.lineTo(ball.trail[i].x, ball.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 공
    glow(ctx, ball.color, 14);
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    clearGlow(ctx);

    // 이름
    ctx.fillStyle = LABEL;
    ctx.font = `bold ${Math.round(r * 0.95)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncate(ball.name), pos.x, pos.y - r - 7);
  }
}
