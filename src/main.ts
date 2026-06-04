import './style.css';
import { mountUI } from './ui/controls';
import { Engine } from './game/engine';
import { generateCourse } from './game/course';
import { render } from './render/renderer';
import { Camera } from './render/camera';
import { assignColors } from './colors';
import type { BallInit, ResultMode } from './types';

const ui = mountUI(document.querySelector<HTMLDivElement>('#app')!);
const ctx = ui.canvas.getContext('2d')!;
const viewW = ui.canvas.width;
const viewH = ui.canvas.height;

const FIXED_DT = 1000 / 60;
const SLOWMO_DIST = 240;
const SLOWMO_SCALE = 0.45;
const CELEBRATE_MS = 4200;
const CONFETTI_COLORS = ['#ff3df0', '#39d0ff', '#5affa3', '#ff9b3d', '#ffe14d', '#b46bff'];

interface Confetto { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; size: number }

const cam = new Camera();
let engine: Engine | null = null;
let raf = 0;
let last = 0;
let acc = 0;
let currentMode: ResultMode = 'ranking';
let confetti: Confetto[] = [];
let celebrateUntil = 0;

function spawnConfetti(): Confetto[] {
  const pieces: Confetto[] = [];
  for (let i = 0; i < 170; i++) {
    pieces.push({
      x: Math.random() * viewW,
      y: -Math.random() * viewH * 0.6,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3.5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 5 + Math.random() * 6,
    });
  }
  return pieces;
}

function drawConfetti(deltaMs: number): void {
  const dt = deltaMs / FIXED_DT;
  for (const c of confetti) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vy += 0.05 * dt;
    c.rot += c.vr * dt;
    if (c.y > viewH + 20) c.y = -20; // 순환
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
    ctx.restore();
  }
}

ui.onStart((cfg) => {
  cancelAnimationFrame(raf);
  currentMode = cfg.mode;
  confetti = [];
  celebrateUntil = 0;

  const course = generateCourse();
  const colors = assignColors(cfg.names.length);
  const inits: BallInit[] = cfg.names.map((name, i) => ({ id: i, name, color: colors[i] }));
  const idToName = new Map(inits.map((b) => [b.id, b.name]));

  engine = new Engine(inits, course, {
    onFinish: () => {
      const placements = engine!.confirmedPlacements().map((p) => ({
        rank: p.rank,
        name: idToName.get(p.id)!,
      }));
      ui.setLiveStandings(placements);
    },
    onComplete: (ranking) => {
      ui.showResult(ranking.map((id) => idToName.get(id)!), currentMode);
      confetti = spawnConfetti();
      celebrateUntil = performance.now() + CELEBRATE_MS;
    },
  });

  cam.reset(course.startY, viewH, course.height);
  acc = 0;
  last = performance.now();
  const loop = (now: number) => {
    let frame = now - last;
    last = now;
    if (frame > 250) frame = 250;

    const e = engine!;
    if (!e.isFinished()) {
      const nearFinish = e.leaderY() > e.course.finishY - SLOWMO_DIST;
      acc += frame * (nearFinish ? SLOWMO_SCALE : 1);
      let steps = 0;
      while (acc >= FIXED_DT && steps < 4 && !e.isFinished()) {
        e.tick(FIXED_DT);
        acc -= FIXED_DT;
        steps++;
      }
      if (acc > FIXED_DT * 4) acc = FIXED_DT * 4;
    }

    cam.addShake(e.takeShake());
    cam.update({
      leaderY: e.leaderY(),
      leaderVY: e.leaderVY(),
      spreadY: e.spreadY(),
      finishY: e.course.finishY,
      viewH,
      courseH: e.course.height,
    });
    render(ctx, e, cam);
    if (celebrateUntil) drawConfetti(frame);

    const celebrating = celebrateUntil && now < celebrateUntil;
    if (!e.isFinished() || celebrating) {
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
});
