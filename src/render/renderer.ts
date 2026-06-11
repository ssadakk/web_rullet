import type { Engine } from '../game/engine';
import type { Course, SectionZone } from '../game/course';

function hueAtY(sections: SectionZone[], y: number): number {
  for (const s of sections) if (y >= s.y0 && y < s.y1) return s.hue;
  return 190;
}

const BG = '#06080f';
const WALL_COLOR = '#161a2b';
const FINISH_COLOR = '#ff3df0';
const SPINNER_COLOR = '#ff9b3d';
const KICKER_COLOR = '#ff4d6d';
const BOOSTER_COLOR = '#41f5a3';
const UPDRAFT_COLOR = '#5ad7ff';
const POP_COLOR = '#ff5d8f';
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

// 공 글로우 헤일로를 색상별 스프라이트로 1회 구워 재사용 — shadowBlur(공 최대 20개,
// DPR 2배면 픽셀 4배)를 프레임 경로에서 제거한다. ball.color는 #rrggbb(6자리) 가정.
const glowCache = new Map<string, HTMLCanvasElement>();
function ballGlow(color: string, r: number): HTMLCanvasElement {
  const cached = glowCache.get(color);
  if (cached) return cached;
  const pad = Math.ceil(r * 2.6);
  const size = pad * 2;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const o = off.getContext('2d')!;
  const g = o.createRadialGradient(pad, pad, r * 0.2, pad, pad, pad);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + 'cc');
  g.addColorStop(1, color + '00');
  o.fillStyle = g;
  o.fillRect(0, 0, size, size);
  glowCache.set(color, off);
  return off;
}

export interface CameraView {
  top: number;
  zoom: number;
  offX: number;
  offY: number;
}

export function render(ctx: CanvasRenderingContext2D, engine: Engine, cam: CameraView, viewW: number, viewH: number): void {
  const course = engine.course;
  const w = viewW;
  const h = viewH;
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

  drawSectionBands(ctx, course, top, bottom);
  drawWalls(ctx, course);
  drawFinish(ctx, course, visible);
  drawSlopes(ctx, course, visible);
  drawSplitters(ctx, course, visible);
  drawBoosters(ctx, course, visible);
  drawJumpPads(ctx, course, visible);
  drawCannons(ctx, course, visible);
  drawTeleports(ctx, course, visible);
  drawBumpers(ctx, course, visible);
  drawPops(ctx, course, visible);
  drawPegs(ctx, course, visible);
  drawSpinners(ctx, engine, course, visible);
  drawSectionDividers(ctx, course, visible);
  drawBalls(ctx, engine, visible);
  drawBasin(ctx, engine, visible);
  drawParticles(ctx, engine, visible);

  ctx.restore();
}

// 결승 수조: 도착한 공이 사라지지 않고 결승선 아래에 등수 뱃지를 달고 쌓인다.
function drawBasin(ctx: CanvasRenderingContext2D, engine: Engine, visible: (y: number) => boolean): void {
  const order = engine.ranking();
  if (order.length === 0) return;
  const course = engine.course;
  const r = course.ballRadius;
  const innerW = course.width - course.wallThickness * 2 - 44;
  const cell = r * 2.5;
  const cols = Math.max(1, Math.floor(innerW / cell));
  const y0 = course.finishY + r + 18;
  order.forEach((id, i) => {
    const ball = engine.balls.get(id);
    if (!ball) return;
    // 각 행을 그 행의 실제 공 개수로 코스 중앙 정렬 (마지막 부분 행 치우침 방지)
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, order.length - row * cols);
    const rowW = inRow * cell;
    const x = course.width / 2 - rowW / 2 + r + (i % cols) * cell;
    const y = y0 + row * (r * 2.6);
    if (!visible(y)) return;
    const sprite = ballGlow(ball.color, r);
    const half = sprite.width / 2;
    ctx.drawImage(sprite, x - half, y - half);
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // 등수 뱃지 (공 위 어두운 숫자)
    ctx.fillStyle = '#06080f';
    ctx.font = `bold ${Math.round(r * 0.95)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y + 0.5);
  });
}

// 구간별 옅은 색 밴드 (여정감·진행감)
function drawSectionBands(ctx: CanvasRenderingContext2D, course: Course, top: number, bottom: number): void {
  for (const s of course.sections) {
    if (s.y1 < top || s.y0 > bottom) continue;
    ctx.fillStyle = `hsla(${s.hue}, 70%, 50%, 0.08)`;
    ctx.fillRect(course.wallThickness, s.y0, course.width - course.wallThickness * 2, s.y1 - s.y0);
  }
}

// 구간 경계 네온 라인 + 이름 라벨
function drawSectionDividers(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  for (const s of course.sections) {
    if (!visible(s.y0)) continue;
    ctx.strokeStyle = `hsla(${s.hue}, 90%, 65%, 0.5)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(course.wallThickness, s.y0);
    ctx.lineTo(course.width - course.wallThickness, s.y0);
    ctx.stroke();
    ctx.fillStyle = `hsla(${s.hue}, 90%, 70%, 0.85)`;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(s.name, course.wallThickness + 8, s.y0 + 5);
  }
}

function drawBumpers(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  glow(ctx, '#ffe14d', 14);
  for (const b of course.bumpers) {
    if (!visible(b.y)) continue;
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7c2';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  clearGlow(ctx);
}

// 팝 범퍼: 일반 범퍼와 구분되는 핑크 + 외곽 링 (닿으면 강타)
function drawPops(ctx: CanvasRenderingContext2D, course: Course, visible: (y: number) => boolean): void {
  glow(ctx, POP_COLOR, 14);
  for (const p of course.pops) {
    if (!visible(p.y)) continue;
    ctx.fillStyle = POP_COLOR;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd2e0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd2e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  clearGlow(ctx);
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
  // 핀은 수가 많아 shadowBlur 글로우가 비싸다 → 저비용 2겹 원(헤일로+코어).
  // 색은 구간 hue로 칠해 '내가 어느 구간인지' 진행감을 준다.
  for (const p of course.pegs) {
    if (!visible(p.y)) continue;
    const hue = hueAtY(course.sections, p.y);
    ctx.fillStyle = `hsla(${hue}, 90%, 60%, 0.16)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsl(${hue}, 90%, 64%)`;
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
  course.spinners.forEach((sp, i) => {
    if (!visible(sp.y)) return;
    const color = sp.kick ? KICKER_COLOR : SPINNER_COLOR; // 배팅 스피너는 색으로 구분
    glow(ctx, color, 14);
    ctx.fillStyle = color;
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
    // 상승 기류(fy<0)는 색·셰브론 방향을 반대로
    const up = b.fy < 0;
    const color = up ? UPDRAFT_COLOR : BOOSTER_COLOR;
    glow(ctx, color, 14);
    ctx.fillStyle = up ? 'rgba(90,215,255,0.18)' : 'rgba(65,245,163,0.25)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 6);
    ctx.fill();
    ctx.stroke();
    clearGlow(ctx);
    // 진행 방향 셰브론 (세 겹 세로로 쌓아 가속감 표현)
    const dir = up ? -1 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    for (let k = -1; k <= 1; k++) {
      const oy = k * 6 * dir;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y - 4 * dir + oy);
      ctx.lineTo(b.x, b.y + 6 * dir + oy);
      ctx.lineTo(b.x + 10, b.y - 4 * dir + oy);
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

export interface HudToast { text: string; alpha: number }

// 화면 고정 HUD: 우측 미니맵(전체 코스 + 공 위치 + 카메라 범위) + 상단 진행바 + 역전 토스트.
export function drawHud(ctx: CanvasRenderingContext2D, engine: Engine, cam: CameraView, viewW: number, viewH: number, toast?: HudToast | null): void {
  const course = engine.course;
  const w = viewW;
  const h = viewH;

  // 상단 진행바
  const prog = Math.max(0, Math.min(1, (engine.leaderY() - course.startY) / (course.finishY - course.startY)));
  const pbX = 14, pbW = w - 28, pbY = 12, pbH = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(pbX, pbY, pbW, pbH, 3);
  ctx.fill();
  ctx.fillStyle = prog > 0.85 ? '#ff3df0' : '#39d0ff';
  ctx.beginPath();
  ctx.roundRect(pbX, pbY, pbW * prog, pbH, 3);
  ctx.fill();

  // 우측 미니맵
  const mmX = w - 12;
  const mmTop = 36;
  const mmH = h - 60;
  const span = course.height - course.startY;
  const toMM = (y: number) => mmTop + Math.max(0, Math.min(1, (y - course.startY) / span)) * mmH;

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mmX, mmTop);
  ctx.lineTo(mmX, mmTop + mmH);
  ctx.stroke();

  // 카메라 가시 범위
  const camTopY = toMM(cam.top);
  const camBotY = toMM(cam.top + h / cam.zoom);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX - 5, camTopY, 10, Math.max(3, camBotY - camTopY));

  // 결승선 표식
  ctx.fillStyle = '#ff3df0';
  ctx.fillRect(mmX - 5, toMM(course.finishY) - 1, 10, 2);

  // 공 점
  for (const ball of engine.balls.values()) {
    if (ball.finished) continue;
    const pos = engine.bodyPos(ball.id);
    if (!pos) continue;
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(mmX, toMM(pos.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 역전 토스트
  if (toast) {
    ctx.globalAlpha = Math.max(0, Math.min(1, toast.alpha));
    glow(ctx, '#ffd700', 12);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(toast.text, w / 2, 30, w - 160); // maxWidth: 스킵 버튼·미니맵 침범 방지
    clearGlow(ctx);
    ctx.globalAlpha = 1;
  }
}

export interface FeedItem { text: string; until: number }

// 이벤트 킬피드: 장치 발동을 좌하단 자막으로 (화면 밖 역전·워프를 서사로 전달).
export function drawKillfeed(ctx: CanvasRenderingContext2D, feed: FeedItem[], now: number, viewH: number): void {
  let y = viewH - 18;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let i = feed.length - 1; i >= 0; i--) {
    const remain = feed[i].until - now;
    if (remain <= 0) continue;
    ctx.globalAlpha = Math.min(1, remain / 400);
    ctx.fillStyle = '#ffd86b';
    ctx.fillText(feed[i].text, 16, y);
    y -= 20;
  }
  ctx.globalAlpha = 1;
}

// 벌칙 모드 긴장 비네트 (화면 가장자리 적색). alpha 0~1.
export function drawVignette(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, alpha: number): void {
  if (alpha <= 0) return;
  const g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.28, viewW / 2, viewH / 2, viewH * 0.72);
  g.addColorStop(0, 'rgba(255,30,60,0)');
  g.addColorStop(1, `rgba(255,30,60,${Math.min(0.55, alpha)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
}

// 최후의 1인 배너 (벌칙 모드 마지막 공). pulse 0~1로 크기 맥동.
export function drawLastOneBanner(ctx: CanvasRenderingContext2D, viewW: number, name: string, pulse: number): void {
  const scale = 1 + pulse * 0.08;
  ctx.save();
  ctx.translate(viewW / 2, 80);
  ctx.scale(scale, scale);
  glow(ctx, '#ff3b5c', 16);
  ctx.fillStyle = '#ff3b5c';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💀 최후의 1인', 0, 0);
  clearGlow(ctx);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(truncate(name, 10), 0, 28);
  ctx.restore();
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
  const leaderId = engine.leaderId();
  for (const ball of engine.balls.values()) {
    if (ball.finished) continue;
    const pos = engine.bodyPos(ball.id);
    if (!pos || !visible(pos.y)) continue;
    const isLeader = ball.id === leaderId;

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

    // 공: 글로우 헤일로 스프라이트 + 선명한 코어
    const sprite = ballGlow(ball.color, r);
    const half = sprite.width / 2;
    ctx.drawImage(sprite, pos.x - half, pos.y - half);
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();

    // 선두 왕관
    if (isLeader) drawCrown(ctx, pos.x, pos.y - r - 10);

    // 이름 (선두는 왕관 위로 올림)
    ctx.fillStyle = LABEL;
    ctx.font = `bold ${Math.round(r * 0.95)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncate(ball.name), pos.x, pos.y - r - (isLeader ? 20 : 7));
  }
}

// 선두 표시 왕관 (금색 3-스파이크)
function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 3);
  ctx.lineTo(x - 7, y - 3);
  ctx.lineTo(x - 3.5, y + 0.5);
  ctx.lineTo(x, y - 5);
  ctx.lineTo(x + 3.5, y + 0.5);
  ctx.lineTo(x + 7, y - 3);
  ctx.lineTo(x + 7, y + 3);
  ctx.closePath();
  ctx.fill();
}
