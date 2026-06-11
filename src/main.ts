import './style.css';
import { mountUI } from './ui/controls';
import { Engine } from './game/engine';
import { generateCourse } from './game/course';
import { randomSeed } from './game/rng';
import { encodeShare } from './share';
import { Sfx } from './audio/sfx';
import { Recorder } from './recorder';
import { render, drawHud, drawVignette, drawLastOneBanner, drawKillfeed, type FeedItem } from './render/renderer';
import { Camera } from './render/camera';
import { assignColors } from './colors';
import type { BallInit, ResultMode } from './types';

const ui = mountUI(document.querySelector<HTMLDivElement>('#app')!);

// 논리 좌표는 600x760 고정(게임 로직 무수정). 백킹 버퍼만 DPR배로 키워 네온을 선명하게.
const LOGICAL_W = 600;
const LOGICAL_H = 760;
const viewW = LOGICAL_W;
const viewH = LOGICAL_H;
const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2배 캡(저가 폰 픽셀 폭증 방지)
ui.canvas.width = LOGICAL_W * dpr;
ui.canvas.height = LOGICAL_H * dpr;
const ctx = ui.canvas.getContext('2d', { alpha: false })!;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 모든 그리기는 논리 좌표

const FIXED_DT = 1000 / 60;
const SLOWMO_DIST = 240;
const SLOWMO_SCALE = 0.45;
const CELEBRATE_MS = 4200;
const CONFETTI_COLORS = ['#ff3df0', '#39d0ff', '#5affa3', '#ff9b3d', '#ffe14d', '#b46bff'];
const DEVICE_LABEL: Record<'teleport' | 'jump' | 'cannon' | 'pop', string> = {
  cannon: '✦ 대포 발사!', jump: '↑ 점프대!', teleport: '⊹ 순간이동!', pop: '★ 팝 강타!',
};

interface Confetto { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; size: number }

const cam = new Camera();
let engine: Engine | null = null;
let raf = 0;
let last = 0;
let acc = 0;
let currentMode: ResultMode = 'ranking';
let confetti: Confetto[] = [];
let celebrateUntil = 0;
let lastSeed = 0;        // 직전 레이스 시드 (공유 링크용)
let lastNames: string[] = [];

const sfx = new Sfx();
ui.onToggleMute((m) => sfx.setMuted(m)); // controls가 등록 즉시 초기값으로 1회 호출

const recorder = new Recorder();
let recordOn = false;
let lastVideo: Blob | null = null;
ui.onToggleRecord((on) => { recordOn = on; });
function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

ui.onSaveVideo(() => {
  if (!lastVideo) return;
  const blob = lastVideo;
  const file = new File([blob], `race-${lastSeed >>> 0}.${recorder.ext()}`, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    nav.share?.({ files: [file], title: '네온 낙하 레이스' }).catch((e: { name?: string }) => {
      if (e?.name !== 'AbortError') downloadBlob(blob, file.name); // 취소가 아닌 실패는 다운로드로 폴백
    });
  } else {
    downloadBlob(blob, file.name);
  }
});

// 직전 레이스를 재현하는 공유 링크를 클립보드에 복사
ui.onShare(() => {
  const hash = encodeShare({ seed: lastSeed, names: lastNames, mode: currentMode });
  const url = location.origin + location.pathname + hash;
  navigator.clipboard?.writeText(url)
    .then(() => ui.flashShare('복사됨! 같은 코스로 재현돼요'))
    .catch(() => {
      location.hash = hash;
      ui.flashShare('주소창 링크가 갱신됐어요');
    });
});

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

ui.onSkip(() => engine?.forceFinish());

ui.onStart((cfg) => {
  cancelAnimationFrame(raf);
  sfx.ensure(); // 시작 클릭 = 오디오 활성화 제스처
  lastVideo = null; // 이전 미완 녹화는 recorder.start()가 동기 정리
  currentMode = cfg.mode;
  confetti = [];
  celebrateUntil = 0;

  const seed = cfg.seed ?? randomSeed();
  lastSeed = seed;
  lastNames = cfg.names;
  const course = generateCourse(seed);
  const colors = assignColors(cfg.names.length);
  const inits: BallInit[] = cfg.names.map((name, i) => ({ id: i, name, color: colors[i] }));
  const idToName = new Map(inits.map((b) => [b.id, b.name]));

  let announced = false; // winner 모드 조기 발표 여부
  let killfeed: FeedItem[] = []; // 장치 이벤트 자막
  let recordingThisRace = false; // 이 레이스 실제 녹화 여부 (start 성공 시 true)
  const announce = (ranking: string[]) => {
    ui.showResult(ranking, currentMode);
    confetti = spawnConfetti();
    celebrateUntil = performance.now() + CELEBRATE_MS;
    // 발표 시점에 녹화 종료 (winner는 1등 도착, ranking/penalty는 전원 도착)
    if (recordingThisRace && recorder.isRecording()) {
      void recorder.stop().then((blob) => {
        lastVideo = blob;
        ui.setVideoReady(blob ? 'ready' : 'failed');
      });
    }
  };

  // 확정 도착자 + 달리는 공(깊이순)을 합친 실시간 순위
  const pushStandings = () => {
    const e = engine!;
    const confirmed = e.confirmedPlacements().map((p) => ({
      rank: p.rank, name: idToName.get(p.id)!, color: e.balls.get(p.id)!.color,
    }));
    const running = [...e.balls.values()]
      .filter((b) => !b.finished)
      .map((b) => ({ ball: b, y: e.bodyPos(b.id)?.y ?? -Infinity }))
      .sort((a, b) => b.y - a.y)
      .map((x, i) => ({
        rank: confirmed.length + i + 1, name: x.ball.name, color: x.ball.color, running: true,
      }));
    ui.setLiveStandings([...confirmed, ...running]);
  };

  engine = new Engine(inits, course, {
    onFinish: (_id, order) => {
      pushStandings(); // 도착 즉시 확정 순위 반영 (스로틀 공백 방지)
      sfx.finish(order.length, inits.length); // 도착 음 (등수 낮을수록 낮은 피치)
      // 당첨 모드: 1등 도착 즉시 발표 (나머지는 배경에서 계속 떨어짐)
      if (currentMode === 'winner' && !announced && order.length === 1) {
        announced = true;
        const rest = inits.filter((b) => b.id !== order[0]).map((b) => b.name);
        announce([idToName.get(order[0])!, ...rest]);
      }
    },
    onComplete: (ranking) => {
      if (!announced) announce(ranking.map((id) => idToName.get(id)!)); // 녹화 종료는 announce가 처리
      pushStandings();
    },
    onDeviceEvent: (events) => {
      for (const e of events) {
        sfx.device(e.kind);
        if (!announced) {
          killfeed.push({ text: `${idToName.get(e.ballId)} ${DEVICE_LABEL[e.kind]}`, until: performance.now() + 2000 });
        }
      }
      if (killfeed.length > 4) killfeed = killfeed.slice(-4);
    },
    onHits: (hits) => {
      // 한 스텝에 다수 충돌 → 가장 센 것 하나만 (rate-limit과 별개로 비용 절감)
      let mx = hits[0];
      for (const h of hits) if (h.speed > mx.speed) mx = h;
      sfx.hit(mx.speed, performance.now());
    },
  });

  // 녹화 시작 (오디오 트랙 포함, 음소거면 무음). start 성공 여부로 실제 녹화 확정.
  if (recordOn) recordingThisRace = recorder.start(ui.canvas, 30, sfx.captureStream());
  ui.setVideoRecorded(recordingThisRace);

  cam.reset(course.startY, viewH, course.height);
  acc = 0;
  last = performance.now();
  let lastStandings = 0;
  let toastText = '';
  let toastUntil = 0;
  const loop = (now: number) => {
    let frame = now - last;
    last = now;
    if (frame > 250) frame = 250;

    const e = engine!;
    if (!e.isFinished()) {
      const lone = e.activeCount() === 1;
      // 슬로모는 결승 직전 박빙 연출용 — 마지막 공 혼자면 벌칙 모드(꼴찌 도착이 드라마)에만 유지.
      // 발표 후 배경 레이스는 슬로모 없이 빠르게 정리.
      const nearFinish = !announced && (!lone || currentMode === 'penalty')
        && e.leaderY() > e.course.finishY - SLOWMO_DIST;
      // 마지막 공 혼자 남으면 2배속 — 순위는 이미 확정이라 연출만 빨라진다
      acc += frame * (nearFinish ? SLOWMO_SCALE : lone ? 2 : 1);
      let steps = 0;
      while (acc >= FIXED_DT && steps < 4 && !e.isFinished()) {
        e.tick(FIXED_DT);
        acc -= FIXED_DT;
        steps++;
      }
      if (acc > FIXED_DT * 4) acc = FIXED_DT * 4;
    }

    const overtaker = e.takeOvertake();
    // 벌칙 막판(꼴찌 캠+배너 구간)엔 역전 토스트 억제 — LAST ONE 배너와 겹침 방지(잔류분도 종료)
    if (currentMode === 'penalty' && e.activeCount() <= 2) {
      toastUntil = 0;
    } else if (overtaker !== null && !announced) {
      toastText = `역전! ${idToName.get(overtaker)}`;
      toastUntil = now + 1400;
    }
    if (now - lastStandings > 250) {
      lastStandings = now;
      pushStandings();
    }

    // 벌칙 모드 후반: 카메라를 꼴찌로 전환 (꼴찌가 주인공)
    const prog = (e.leaderY() - e.course.startY) / (e.course.finishY - e.course.startY);
    const tailCam = currentMode === 'penalty' && prog > 0.6 && !e.isFinished();
    cam.addShake(e.takeShake());
    cam.update({
      leaderY: tailCam ? e.tailY() : e.leaderY(),
      leaderVY: tailCam ? e.tailVY() : e.leaderVY(),
      spreadY: e.spreadY(),
      finishY: e.course.finishY,
      viewH,
      courseH: e.course.height,
    });
    render(ctx, e, cam, viewW, viewH);
    drawHud(ctx, e, cam, viewW, viewH, now < toastUntil
      ? { text: toastText, alpha: Math.min(1, (toastUntil - now) / 400) }
      : null);
    if (killfeed.length) {
      killfeed = killfeed.filter((f) => f.until > now);
      drawKillfeed(ctx, killfeed, now, viewH);
    }

    // 벌칙 모드 막판 긴장: 남은 공이 적을수록 적색 비네트, 마지막 1인은 배너
    if (currentMode === 'penalty' && !e.isFinished()) {
      const active = e.activeCount();
      if (active > 0 && active <= 2) {
        drawVignette(ctx, viewW, viewH, active === 1 ? 0.5 : 0.26);
        if (active === 1) {
          const lastBall = [...e.balls.values()].find((b) => !b.finished);
          if (lastBall) drawLastOneBanner(ctx, viewW, lastBall.name, (Math.sin(now / 200) + 1) / 2);
        }
      }
    }
    if (celebrateUntil && now < celebrateUntil) drawConfetti(frame);

    const celebrating = celebrateUntil && now < celebrateUntil;
    if (!e.isFinished() || celebrating) {
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
});
