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
const viewH = ui.canvas.height;

const FIXED_DT = 1000 / 60;
const SLOWMO_DIST = 240;   // 선두가 결승선 이만큼 이내면 슬로모
const SLOWMO_SCALE = 0.45;

const cam = new Camera();
let engine: Engine | null = null;
let raf = 0;
let last = 0;
let acc = 0;
let currentMode: ResultMode = 'ranking';

ui.onStart((cfg) => {
  cancelAnimationFrame(raf);
  currentMode = cfg.mode;

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
    },
  });

  cam.reset(course.startY, viewH, course.height);
  acc = 0;
  last = performance.now();
  const loop = (now: number) => {
    let frame = now - last;
    last = now;
    if (frame > 250) frame = 250;

    // 결승선 근처에선 시간을 늦춰 막판 클로즈업 연출
    const e = engine!;
    const nearFinish = e.leaderY() > e.course.finishY - SLOWMO_DIST;
    acc += frame * (nearFinish ? SLOWMO_SCALE : 1);

    // 프레임당 물리 틱 수 제한 → 렌더가 느린 프레임에 sim이 빨리 감기는 것 방지
    let steps = 0;
    while (acc >= FIXED_DT && steps < 4 && !e.isFinished()) {
      e.tick(FIXED_DT);
      acc -= FIXED_DT;
      steps++;
    }
    if (acc > FIXED_DT * 4) acc = FIXED_DT * 4;

    cam.update({
      leaderY: e.leaderY(),
      leaderVY: e.leaderVY(),
      spreadY: e.spreadY(),
      finishY: e.course.finishY,
      viewH,
      courseH: e.course.height,
    });
    render(ctx, e, cam);

    if (!e.isFinished()) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
});
