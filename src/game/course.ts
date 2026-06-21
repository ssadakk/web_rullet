// 세로 낙하 코스: 성격이 다른 '구간(섹션)'을 랜덤으로 이어붙인 시퀀스.
// 균일 핀 격자(과거)의 단조로움을 구간 단위 구조 변화로 깬다.
// 좌표 y는 아래로 증가. 바깥 좌우 벽(world.ts)이 코스를 가두고, 섹션은 그 안에
// 장애물을 채운다(항상 통로를 남겨 솔버빌리티 보장).

import { mulberry32, randomSeed, type Rng } from './rng';

// 코스 생성 난수. generateCourse 진입 시 시드로 설정 — 같은 시드 → 같은 코스.
let crng: Rng = Math.random;

export interface Peg { x: number; y: number; r: number }
export interface Bumper { x: number; y: number; r: number }            // 고탄성 범퍼
export interface Pop { x: number; y: number; r: number }               // 팝 범퍼: 닿으면 방사형 강타 (반전 요소)
export interface Spinner { x: number; y: number; length: number; thickness: number; speed: number; angle: number; kick?: boolean } // kick: 배팅 스피너(공을 위로 쳐올림)
export interface Booster { x: number; y: number; w: number; h: number; fx: number; fy: number }
export interface Teleport { ex: number; ey: number; er: number; tx: number; ty: number }
export interface Slope { x: number; y: number; w: number; h: number; angle: number } // 정적 경사/벽 (깔때기·협곡·슈트에 재사용)
export interface JumpPad { x: number; y: number; w: number; h: number; vy: number }
export interface Cannon { x: number; y: number; w: number; h: number; vx: number; vy: number }
export interface Splitter { x: number; y: number; radius: number; angle: number }
export interface Seesaw { x: number; y: number; length: number; thickness: number; maxAngle: number; angle: number } // angle: 초기(휴지) 기울기
export interface Trampoline { x: number; y: number; w: number; h: number; vy: number } // 고무줄 반동: 위에서 닿으면 강하게 위로 튕김
export interface SectionZone { y0: number; y1: number; hue: number; name: string }

export interface Course {
  seed: number;
  width: number;
  height: number;
  startY: number;
  finishY: number;
  wallThickness: number;
  ballRadius: number;
  pegs: Peg[];
  bumpers: Bumper[];
  pops: Pop[];
  spinners: Spinner[];
  boosters: Booster[];
  teleports: Teleport[];
  slopes: Slope[];
  jumppads: JumpPad[];
  cannons: Cannon[];
  splitters: Splitter[];
  seesaws: Seesaw[];
  trampolines: Trampoline[];
  sections: SectionZone[];
}

interface Arrays {
  pegs: Peg[];
  bumpers: Bumper[];
  pops: Pop[];
  spinners: Spinner[];
  boosters: Booster[];
  teleports: Teleport[];
  slopes: Slope[];
  jumppads: JumpPad[];
  cannons: Cannon[];
  splitters: Splitter[];
  seesaws: Seesaw[];
  trampolines: Trampoline[];
}

const W = 600;
const WALL = 22;
const BALL_R = 9;
const PEG_R = 6;
const TOP = 90;
const ROW_GAP = 104;
const PIN_GAP = 66;

const innerL = WALL + 24;
const innerR = W - WALL - 24;
const innerW = innerR - innerL;

type SectionId = 'pinfield' | 'chamber' | 'pit' | 'drum' | 'lanes' | 'seesaw' | 'rotor' | 'trampo';
const BAG: SectionId[] = ['pinfield', 'chamber', 'pit', 'drum', 'lanes', 'seesaw', 'rotor', 'trampo'];

const HEIGHT: Record<SectionId, number> = {
  pinfield: 360, chamber: 420, pit: 320, drum: 440, lanes: 400, seesaw: 360, rotor: 420, trampo: 380,
};

// 반전(상승) 요소 예산. engine.ts antiStuck(350ms 정체 시 강제 하강)이 무한 바운스를
// 막아준다는 전제 위의 수치 — 캡을 올리면 race.sim.test의 30초 자연 종료 가드 재확인 필요.
const MAX_JUMPPADS = 3;
const MAX_POPS = 4;
const MAX_UPDRAFTS = 1;
const MAX_KICKERS = 2;
const MAX_TRAMPOLINES = 4; // 고무줄 반동 캡 — 무한 바운스 방지 (race.sim 30초 가드 전제)

const updraftCount = (A: Arrays): number => A.boosters.filter((b) => b.fy < 0).length;
const kickerCount = (A: Arrays): number => A.spinners.filter((s) => s.kick).length;
const FINISH_H = 400;

const HUE: Record<string, number> = {
  pinfield: 190, chamber: 32, pit: 150, drum: 275, lanes: 60, seesaw: 215, rotor: 300, trampo: 95, finish: 318,
};
const NAME: Record<string, string> = {
  pinfield: 'PINS', chamber: 'CHAOS', pit: 'DROP', drum: 'WHEEL', lanes: 'LANES', seesaw: 'SEESAW', rotor: 'ROTOR', trampo: 'TRAMPO', finish: 'FINAL',
};

function emptyArrays(): Arrays {
  return { pegs: [], bumpers: [], pops: [], spinners: [], boosters: [], teleports: [], slopes: [], jumppads: [], cannons: [], splitters: [], seesaws: [], trampolines: [] };
}

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(crng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 핀 행을 innerL→innerR 전폭에 균등 배치. 양 끝 핀을 항상 보장해 가장자리 직하 통로를 없앤다.
function pushPegRow(pegs: Peg[], y: number, r: number): void {
  const cols = Math.round(innerW / PIN_GAP);   // 칸 수
  const step = innerW / cols;                  // 균등 간격(짝수 행은 양 끝이 innerL/innerR)
  const stagger = (r % 2) * (step / 2);        // 행 교대 반-칸 엇갈림
  for (let x = innerL + stagger; x <= innerR + 1; x += step) {
    pegs.push({ x: x + (crng() - 0.5) * 8, y: y + (crng() - 0.5) * 8, r: PEG_R });
  }
  if (stagger > 0) { // 엇갈림 행은 양 끝이 비므로 가장자리 보강 핀 추가
    pegs.push({ x: innerL, y: y + (crng() - 0.5) * 8, r: PEG_R });
    pegs.push({ x: innerR, y: y + (crng() - 0.5) * 8, r: PEG_R });
  }
}

// 벽에 축을 둔 풍차 팔: 피벗을 벽(코스 밖)에 두고 한 팔이 코스 안으로 쓸고 들어온다.
// 대칭 막대라 절반은 벽 뒤로 가려진다. reach = 코스 안으로 뻗는 길이.
// 끝 선속도(reach*|speed|)가 MAX_BALL_SPEED(11)보다 작아야 터널링 안전.
function pushWindmill(A: Arrays, leftSide: boolean, cy: number, reach: number, thickness: number, speed: number): void {
  const pivotX = leftSide ? WALL : W - WALL;
  A.spinners.push({ x: pivotX, y: cy, length: reach * 2, thickness, speed, angle: crng() * Math.PI });
}

function buildPinField(A: Arrays, y0: number, y1: number): void {
  let r = 0;
  for (let y = y0 + 60; y < y1 - 20; y += ROW_GAP, r++) {
    pushPegRow(A.pegs, y, r);
    if (crng() < 0.35) {
      const x = innerL + 40 + crng() * (innerW - 80);
      const pick = Math.floor(crng() * 3);
      if (pick === 0) A.boosters.push({ x, y, w: 84, h: 28, fx: (crng() - 0.5) * 0.005, fy: 0.015 });
      else if (pick === 1) A.splitters.push({ x, y, radius: 24, angle: -Math.PI / 2 });
      else A.teleports.push({ ex: x, ey: y, er: 22, tx: innerL + crng() * innerW, ty: Math.min(y + ROW_GAP * 2, y1 + ROW_GAP) });
    }
  }
  // 핀 행 사이 팝 범퍼 (위에서 맞으면 위로 튕겨 올라가는 반전 포인트)
  if (crng() < 0.25 && A.pops.length < MAX_POPS) {
    const bands: number[] = [];
    for (let yy = y0 + 60 + ROW_GAP / 2; yy < y1 - 60; yy += ROW_GAP) bands.push(yy);
    if (bands.length > 0) {
      const y = bands[Math.floor(crng() * bands.length)];
      A.pops.push({ x: innerL + 50 + crng() * (innerW - 100), y, r: 14 });
    }
  }
  // 섹션 하단 점프패드 (리드인 섹션은 제외 — 시작부터 정체 방지)
  if (y0 !== TOP && crng() < 0.35 && A.jumppads.length < MAX_JUMPPADS) {
    A.jumppads.push({ x: innerL + 60 + crng() * (innerW - 120), y: y1 - 48, w: 78, h: 22, vy: -13 });
  }
}

// 룰렛 드럼: 같은 중심에 스피너 3개를 60°씩 어긋나게 겹쳐 6날 휠 구성.
// 휠이 무작위 타이밍에 사방으로 튕겨낸다 (복불복).
function buildDrum(A: Arrays, y0: number, _y1: number): void {
  const cx = W / 2 + (crng() - 0.5) * 40;
  const cy = y0 + 270;
  const L = 190;
  // 깔때기 대신: 상단 전폭 스태거 핀 2행으로 산란 + 벽쪽 직하 통로 봉쇄
  pushPegRow(A.pegs, y0 + 44, 0);
  pushPegRow(A.pegs, y0 + 130, 1);
  // 휠 양옆 벽 구역에 범퍼를 둬 공이 휠 쪽으로 흘러들게 유도
  A.bumpers.push({ x: innerL + 26, y: cy, r: 12 });
  A.bumpers.push({ x: innerR - 26, y: cy, r: 12 });
  const speed = (crng() < 0.5 ? 1 : -1) * (0.028 + crng() * 0.016);
  const phase = crng() * Math.PI;
  for (let i = 0; i < 3; i++) {
    A.spinners.push({ x: cx, y: cy, length: L, thickness: 16, speed, angle: phase + (i * Math.PI) / 3 });
  }
}

// 레인 복불복: 세로 칸막이로 3개 레인 분할, 레인마다 운명이 다르다.
// 가속(부스터) / 저속(핀 밀집) / 도박(텔레포트 → 무작위 레인 하단) — 진입이 곧 추첨.
function buildLanes(A: Arrays, y0: number, y1: number): void {
  const n = 3;
  const top = y0 + 80;
  const bot = y1 - 60;
  const laneW = innerW / n;
  pushPegRow(A.pegs, y0 + 40, 1); // 진입 산란: 어느 레인에 빠질지 랜덤화
  for (let i = 1; i < n; i++) {
    const x = innerL + laneW * i;
    A.slopes.push({ x, y: (top + bot) / 2, w: 14, h: bot - top, angle: 0 });
    A.splitters.push({ x, y: top - 12, radius: 13, angle: -Math.PI / 2 }); // 칸막이 위 분배 삼각형
  }
  // 외측 레인(0·n-1)의 물리 경계는 칸막이가 아니라 벽 면 — 기하 1/3이 아닌 실제 레인
  // 중심/폭을 써야 벽쪽 무장애 직하 통로(레인 페널티 우회)가 생기지 않는다.
  const laneBounds = (i: number) => ({
    l: i === 0 ? WALL : innerL + laneW * i,
    r: i === n - 1 ? W - WALL : innerL + laneW * (i + 1),
  });
  const laneCx = (i: number) => { const b = laneBounds(i); return (b.l + b.r) / 2; };
  const kinds = shuffled(['fast', 'slow', 'gamble'] as const);
  for (let i = 0; i < n; i++) {
    const { l: laneL, r: laneR } = laneBounds(i);
    const cxLane = (laneL + laneR) / 2;
    const kind = kinds[i];
    if (kind === 'fast') {
      const bw = laneR - laneL - 24; // 벽/칸막이까지 거의 가득 — 벽쪽 비부스트 통로 제거
      A.boosters.push({ x: cxLane, y: top + (bot - top) * 0.3, w: bw, h: 26, fx: 0, fy: 0.015 });
      A.boosters.push({ x: cxLane, y: top + (bot - top) * 0.7, w: bw, h: 26, fx: 0, fy: 0.015 });
    } else if (kind === 'slow') {
      // 핀 밀집: 레인 물리 폭 전체에 스태거 배치. 벽 면 쪽은 공 반지름만,
      // 칸막이 쪽은 24px 클리어런스로 쐐기 포켓 방지.
      const pl = i === 0 ? WALL + BALL_R + 2 : laneL + 24;
      const pr = i === n - 1 ? W - WALL - BALL_R - 2 : laneR - 24;
      const cols = Math.max(2, Math.round((pr - pl) / 50));
      const stepX = (pr - pl) / cols;
      let r = 0;
      for (let y = top + 36; y < bot - 24; y += 60, r++) {
        const off = r % 2 === 0 ? 0 : stepX / 2;
        for (let x = pl + off; x <= pr + 0.5; x += stepX) {
          A.pegs.push({ x: x + (crng() - 0.5) * 6, y: y + (crng() - 0.5) * 6, r: PEG_R });
        }
      }
    } else {
      const exitLane = Math.floor(crng() * n);
      A.teleports.push({
        ex: cxLane, ey: top + (bot - top) * 0.45, er: 20,
        tx: laneCx(exitLane), ty: bot + 24,
      });
    }
  }
}

// 시소 덤프: 거의 전폭 판자에 공이 쌓이면 무게 쏠린 쪽으로 기울어 한쪽으로 쏟아낸다.
// 판자 기울기는 devices.ts updateSeesaws가 공 배치 기반으로 키네마틱하게 구동.
function buildSeesaw(A: Arrays, y0: number, y1: number): void {
  const cx = W / 2 + (crng() - 0.5) * 50;
  const pivotY = y0 + 190;
  // 깔때기 대신 판자를 거의 전폭으로 확대 — 공이 바로 판자에 안착, 덤프가 커진다
  A.seesaws.push({
    x: cx, y: pivotY, length: 440, thickness: 14, maxAngle: 0.45,
    angle: (crng() < 0.5 ? 1 : -1) * (0.05 + crng() * 0.04), // 휴지 바이어스: 도착한 공이 낮은 쪽으로 구른다
  });
  // 판자 양 끝과 벽 사이(약 33px) 직하 통로를 벽쪽 플랭킹 핀으로 봉쇄
  for (const dy of [-70, 0, 70]) {
    A.pegs.push({ x: innerL + 6, y: pivotY + dy, r: PEG_R });
    A.pegs.push({ x: innerR - 6, y: pivotY + dy, r: PEG_R });
  }
  pushPegRow(A.pegs, y1 - 50, 0); // 쏟아진 공 분산
}

// 거대 풍차 바: 한쪽 벽에 축을 둔 큰 팔이 코스 폭의 ~80%를 쓸며 느리게 회전.
// 수평으로 들어올 때 공을 크게 쳐내 비대칭 역전을 만든다 (윈드밀).
function buildRotor(A: Arrays, y0: number, y1: number): void {
  const cy = (y0 + y1) / 2;
  const leftSide = crng() < 0.5;
  pushPegRow(A.pegs, y0 + 44, 0); // 진입 산란
  const reach = innerW * 0.8;
  // 끝 선속도 ≈ 406*0.019 ≈ 7.7px/frame < MAX_BALL_SPEED(11)
  pushWindmill(A, leftSide, cy, reach, 26, (crng() < 0.5 ? 1 : -1) * (0.013 + crng() * 0.006));
  // 팔이 닿지 않는 반대쪽 벽 구역만 봉쇄 핀
  const farX = leftSide ? innerR - 6 : innerL + 6;
  for (const dy of [-60, 20, 100]) A.pegs.push({ x: farX, y: cy + dy, r: PEG_R });
  // 하단 결승 직전 반동: 35% 확률 트램펄린 1개
  if (crng() < 0.35 && A.trampolines.length < MAX_TRAMPOLINES) {
    A.trampolines.push({ x: innerL + 80 + crng() * (innerW - 160), y: y1 - 46, w: 96, h: 18, vy: -13 });
  }
}

// 독립 트램펄린 구간: 트램펄린 2개를 좌우 지그재그로 — 공이 크게 튕기며 내려가 순위 격변.
// 중력+수평 킥으로 결국 하강 보장. 트램펄린 위엔 핀을 두지 않는다(튕긴 공이 핀에 막혀
// 다시 떨어지는 핑퐁 포켓 방지). 벽쪽 직하 통로만 봉쇄 + 바닥 분산.
function buildTrampo(A: Arrays, y0: number, y1: number): void {
  const leftFirst = crng() < 0.5;
  const xL = innerL + innerW * 0.30;
  const xR = innerL + innerW * 0.70;
  const yA = y0 + 130, yB = y0 + 270;
  const slots: { x: number; y: number }[] = leftFirst
    ? [{ x: xL, y: yA }, { x: xR, y: yB }]
    : [{ x: xR, y: yA }, { x: xL, y: yB }];
  for (const s of slots) {
    if (A.trampolines.length >= MAX_TRAMPOLINES) break;
    A.trampolines.push({ x: s.x, y: s.y, w: 104, h: 18, vy: -13 });
  }
  // 벽쪽 직하 통로만 핀 컬럼으로 봉쇄 (트램펄린 위/사이엔 핀 없음)
  for (const dy of [40, 130, 220]) {
    A.pegs.push({ x: innerL + 6, y: y0 + dy, r: PEG_R });
    A.pegs.push({ x: innerR - 6, y: y0 + dy, r: PEG_R });
  }
  pushPegRow(A.pegs, y1 - 45, 0); // 바닥 출구 분산
}

function buildChamber(A: Arrays, y0: number, y1: number): void {
  // 전폭 핀 행을 깔아 세로 레인(특히 벽side)을 차단 — CHAOS 베이스
  let r = 0;
  for (let y = y0 + 40; y < y1 - 20; y += ROW_GAP, r++) pushPegRow(A.pegs, y, r);
  // 회전 범퍼: 폭 전체에 분산. 일부는 벽에 축을 둔 풍차 팔(오프센터)로 더 불규칙하게.
  // 첫 번째 미드코트 스피너는 50% 확률로 배팅 스피너.
  const ns = 2 + Math.floor(crng() * 2);
  for (let i = 0; i < ns; i++) {
    const y = y0 + 90 + crng() * (y1 - y0 - 200);
    if (crng() < 0.35) {
      // 벽 풍차: 끝 선속도 ≈ 229*0.022 ≈ 5px/frame < 11
      pushWindmill(A, crng() < 0.5, y, innerW * 0.45, 18, (crng() < 0.5 ? 1 : -1) * (0.014 + crng() * 0.008));
      continue;
    }
    const x = innerL + innerW * ((i + 0.5) / ns) + (crng() - 0.5) * 40;
    const kick = i === 0 && crng() < 0.5 && kickerCount(A) < MAX_KICKERS;
    A.spinners.push({
      x, y, length: 100 + crng() * 26, thickness: 18,
      speed: (crng() < 0.5 ? 1 : -1) * (0.03 + crng() * 0.03), angle: crng() * Math.PI,
      kick: kick || undefined,
    });
  }
  // 범퍼: 한 지점 십자 클러스터 대신 레인 분할 + 지터로 섹션 전체에 분산.
  // y는 핀 행 사이 중간 밴드에 스냅 — 핀과 겹치면 공이 끼는 V자 포켓이 생긴다.
  const bands = [y0 + 92, y0 + 196, y0 + 300];
  const nb = 3 + (crng() < 0.5 ? 1 : 0);
  for (let i = 0; i < nb; i++) {
    const x = innerL + innerW * ((i + 0.5) / nb) + (crng() - 0.5) * 50;
    const y = bands[Math.floor(crng() * bands.length)] + (crng() - 0.5) * 16;
    A.bumpers.push({ x, y, r: 11 });
  }
  if (crng() < 0.4 && A.pops.length < MAX_POPS) {
    const y = bands[Math.floor(crng() * bands.length)] + (crng() - 0.5) * 12;
    // 범퍼와 겹치면 원-원 사이 쐐기 포켓이 생기므로 거리 확보될 때만 배치
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = innerL + 60 + crng() * (innerW - 120);
      if (A.bumpers.every((b) => Math.hypot(b.x - x, b.y - y) >= 60)) {
        A.pops.push({ x, y, r: 14 });
        break;
      }
    }
  }
  if (crng() < 0.45 && A.jumppads.length < MAX_JUMPPADS) {
    A.jumppads.push({ x: innerL + 60 + crng() * (innerW - 120), y: y1 - 48, w: 78, h: 22, vy: -13 });
  }
  if (crng() < 0.5) A.boosters.push({ x: innerL + 45 + crng() * (innerW - 90), y: y0 + 64, w: 84, h: 28, fx: (crng() - 0.5) * 0.005, fy: 0.015 });
}

function buildPit(A: Arrays, y0: number, y1: number): void {
  for (let y = y0 + 80; y < y1 - 50; y += ROW_GAP) {
    A.pegs.push({ x: innerL + 8 + (crng() - 0.5) * 6, y, r: PEG_R });
    A.pegs.push({ x: innerR - 8 + (crng() - 0.5) * 6, y, r: PEG_R });
  }
  const x = innerL + 60 + crng() * (innerW - 120);
  const y = y1 - 70;
  if (crng() < 0.25 && updraftCount(A) < MAX_UPDRAFTS) {
    A.boosters.push({ x, y: y - 30, w: 90, h: 120, fx: 0, fy: -0.0012 }); // 상승 기류 기둥
  } else if (crng() < 0.4 && A.trampolines.length < MAX_TRAMPOLINES) {
    A.trampolines.push({ x, y: y - 24, w: 96, h: 18, vy: -13 }); // 결승 직전 반동
  } else if (crng() < 0.7 && A.jumppads.length < MAX_JUMPPADS) {
    A.jumppads.push({ x, y, w: 78, h: 22, vy: -13 });
  } else {
    A.cannons.push({ x, y, w: 70, h: 28, vx: (crng() < 0.5 ? 1 : -1) * (5 + crng() * 3), vy: 12 });
  }
}

function buildSection(t: SectionId, A: Arrays, y0: number, y1: number): void {
  if (t === 'pinfield') buildPinField(A, y0, y1);
  else if (t === 'chamber') buildChamber(A, y0, y1);
  else if (t === 'drum') buildDrum(A, y0, y1);
  else if (t === 'lanes') buildLanes(A, y0, y1);
  else if (t === 'seesaw') buildSeesaw(A, y0, y1);
  else if (t === 'rotor') buildRotor(A, y0, y1);
  else if (t === 'trampo') buildTrampo(A, y0, y1);
  else buildPit(A, y0, y1);
}

// 전폭 폭포 결승 (CASCADE): 좁은 슈트(외줄 대기=드레인 꼬리의 원인)를 폐기하고 공이 멈추지
// 않고 전폭으로 흐르게 한다. engine.ts rubberBand의 'FINAL 막판 압축'이 뒤처진 공을 선두
// 깊이로 끌어모아 photo finish를 만들고(꼬리 제거), 여기 범퍼 셔플이 압축된 공떼의 좌우
// 위치를 흔들어 도착 직전 순위를 뒤섞는다(박진감). 상향 발사 없음 → 꼬리를 늘리지 않음.
function buildCascadeFinish(A: Arrays, y0: number, _finishY: number): void {
  // 1. 가장자리 핀 컬럼 — 벽 직하 우회 봉쇄 (FINAL 전 구간)
  for (const dy of [40, 110, 180, 250, 320]) {
    A.pegs.push({ x: innerL + 6, y: y0 + dy, r: PEG_R });
    A.pegs.push({ x: innerR - 6, y: y0 + dy, r: PEG_R });
  }
  // 2. 진입 산란 — 상류 공떼를 전폭으로 펼쳐 한 점 합류(외줄)를 원천 차단
  pushPegRow(A.pegs, y0 + 40, 0);
  // 3. 좌우 윈드밀 2개 — 압축된 공떼를 막판에 휘저어 선두 순위를 마지막까지 흔든다(횡스윕,
  //    상향 발사 아님 → 꼬리 영향 작음). 끝속도 200*0.02=4 < 11.
  pushWindmill(A, true, y0 + 175, 200, 14, 0.02);
  pushWindmill(A, false, y0 + 175, 200, 14, -0.02);
  // 4. 막판 셔플 범퍼 — 윗행(중간 셔플) + 결승선 바로 위 행(도착 직전 스크램블 → 접전).
  for (const x of [130, 250, 370, 490]) A.bumpers.push({ x, y: y0 + 120, r: 11 });
  for (const x of [190, 310, 430]) A.bumpers.push({ x, y: y0 + 330, r: 11 });
  // 5. 결승선 직전 짧은 자유 구간(y0+345 ~ finishY) — 스크램블된 공떼가 전폭으로 동시 통과.
}

export function generateCourse(seed?: number): Course {
  const s = seed ?? randomSeed();
  crng = mulberry32(s);
  const A = emptyArrays();
  const sections: SectionZone[] = [];
  let y = TOP;

  const add = (t: SectionId) => {
    const y0 = y, y1 = y + HEIGHT[t];
    buildSection(t, A, y0, y1);
    sections.push({ y0, y1, hue: HUE[t], name: NAME[t] });
    y = y1;
  };

  add('pinfield'); // 리드인
  // 셔플 백: 섞은 BAG(8종)를 이어붙여 같은 타입 뭉침을 막고 모든 타입 등장을 보장.
  // count = 8 → 정확히 첫 셔플 백 한 바퀴로 8종 모두 1회씩 등장(코스 길이·시간 제어).
  const count = 8; // 중간 구간 8개 (8종 전부)
  const seq: SectionId[] = [];
  let last: SectionId = 'pinfield'; // 리드인과의 인접 중복 방지
  while (seq.length < count) {
    const bag = shuffled(BAG);
    if (bag[0] === last) [bag[0], bag[1]] = [bag[1], bag[0]]; // 백 경계 중복 해소
    seq.push(...bag);
    last = seq[seq.length - 1];
  }
  seq.length = count;
  for (const t of seq) add(t);

  const finishStart = y;
  const finishY = y + FINISH_H;
  buildCascadeFinish(A, finishStart, finishY);
  sections.push({ y0: finishStart, y1: finishY, hue: HUE.finish, name: NAME.finish });

  return {
    seed: s,
    width: W, height: finishY + 120, startY: TOP, finishY,
    wallThickness: WALL, ballRadius: BALL_R,
    ...A, sections,
  };
}
