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

type SectionId = 'pinfield' | 'funnel' | 'canyon' | 'chamber' | 'pit';
// canyon은 백에서 제외 — 별도로 코스당 최대 1개만 삽입 (지루한 경사판 빈도 축소)
const BAG: SectionId[] = ['pinfield', 'funnel', 'chamber', 'pit'];

const HEIGHT: Record<SectionId, number> = {
  pinfield: 360, funnel: 380, canyon: 400, chamber: 420, pit: 320,
};

// 반전(상승) 요소 예산. engine.ts antiStuck(350ms 정체 시 강제 하강)이 무한 바운스를
// 막아준다는 전제 위의 수치 — 캡을 올리면 race.sim.test의 30초 자연 종료 가드 재확인 필요.
const MAX_JUMPPADS = 3;
const MAX_POPS = 4;
const MAX_UPDRAFTS = 1;
const MAX_KICKERS = 2;

const updraftCount = (A: Arrays): number => A.boosters.filter((b) => b.fy < 0).length;
const kickerCount = (A: Arrays): number => A.spinners.filter((s) => s.kick).length;
const FINISH_H = 400;

const HUE: Record<string, number> = {
  pinfield: 190, funnel: 350, canyon: 275, chamber: 32, pit: 150, finish: 318,
};
const NAME: Record<string, string> = {
  pinfield: 'PINS', funnel: 'FUNNEL', canyon: 'CANYON', chamber: 'CHAOS', pit: 'DROP', finish: 'FINAL',
};

function emptyArrays(): Arrays {
  return { pegs: [], bumpers: [], pops: [], spinners: [], boosters: [], teleports: [], slopes: [], jumppads: [], cannons: [], splitters: [] };
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

// (x1,y1)→(x2,y2)를 잇는 정적 경사 막대 한 장
function pushWallLine(slopes: Slope[], x1: number, y1: number, x2: number, y2: number, h = 16): void {
  slopes.push({
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    w: Math.hypot(x2 - x1, y2 - y1),
    h,
    angle: Math.atan2(y2 - y1, x2 - x1),
  });
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

function buildFunnel(A: Arrays, y0: number, y1: number): void {
  const cx = W / 2 + (crng() - 0.5) * 60;
  const throatY = (y0 + y1) / 2;
  const throat = 6.4 * BALL_R; // 출구 폭 (파일업 배수 위해 넉넉히)
  // 벽 면(WALL / W-WALL)에서 시작해 가장자리 직하 통로를 봉쇄
  pushWallLine(A.slopes, WALL, y0 + 30, cx - throat / 2, throatY);
  pushWallLine(A.slopes, W - WALL, y0 + 30, cx + throat / 2, throatY);
  for (let y = throatY + 80; y < y1 - 20; y += ROW_GAP) pushPegRow(A.pegs, y, 0);
}

function buildCanyon(A: Arrays, y0: number, y1: number): void {
  const shelves = 2;
  const len = innerW * 0.5; // 반폭 선반: 옆 절반은 그냥 통과, 타면 흘러내림 — 경로 분기
  const startLeft = crng() < 0.5; // 시작 방향 랜덤 → 좌우 편향 제거
  let lastLeft = startLeft;
  for (let k = 0; k < shelves; k++) {
    const y = y0 + 70 + k * ((y1 - y0 - 100) / shelves);
    const leftSide = (k % 2 === 0) === startLeft;
    const cx = leftSide ? innerL + len / 2 : innerR - len / 2;
    const angle = (leftSide ? 1 : -1) * (0.17 + crng() * 0.07);
    A.slopes.push({ x: cx, y, w: len, h: 18, angle });
    lastLeft = leftSide;
  }
  // 마지막 선반의 열린 쪽 아래 반전 장치: 미끄러져 내려온 공이 위로 솟구친다
  if (crng() < 0.6) {
    const x = lastLeft ? innerR - len / 2 : innerL + len / 2;
    if (crng() < 0.5 && A.jumppads.length < MAX_JUMPPADS) {
      A.jumppads.push({ x, y: y1 - 50, w: 78, h: 22, vy: -13 });
    } else if (updraftCount(A) < MAX_UPDRAFTS) {
      A.boosters.push({ x, y: y1 - 90, w: 90, h: 120, fx: 0, fy: -0.0012 }); // 상승 기류
    }
  }
}

function buildChamber(A: Arrays, y0: number, y1: number): void {
  // 전폭 핀 행을 깔아 세로 레인(특히 벽side)을 차단 — CHAOS 베이스
  let r = 0;
  for (let y = y0 + 40; y < y1 - 20; y += ROW_GAP, r++) pushPegRow(A.pegs, y, r);
  // 회전 범퍼: 폭 전체에 분산 배치(가운데만 막던 문제 해소). 첫 번째는 50% 확률로 배팅 스피너.
  const ns = 2 + Math.floor(crng() * 2);
  for (let i = 0; i < ns; i++) {
    const x = innerL + innerW * ((i + 0.5) / ns) + (crng() - 0.5) * 40;
    const y = y0 + 90 + crng() * (y1 - y0 - 200);
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
  if (crng() < 0.3 && updraftCount(A) < MAX_UPDRAFTS) {
    A.boosters.push({ x, y: y - 30, w: 90, h: 120, fx: 0, fy: -0.0012 }); // 상승 기류 기둥
  } else if (crng() < 0.7 && A.jumppads.length < MAX_JUMPPADS) {
    A.jumppads.push({ x, y, w: 78, h: 22, vy: -13 });
  } else {
    A.cannons.push({ x, y, w: 70, h: 28, vx: (crng() < 0.5 ? 1 : -1) * (5 + crng() * 3), vy: 12 });
  }
}

function buildSection(t: SectionId, A: Arrays, y0: number, y1: number): void {
  if (t === 'pinfield') buildPinField(A, y0, y1);
  else if (t === 'funnel') buildFunnel(A, y0, y1);
  else if (t === 'canyon') buildCanyon(A, y0, y1);
  else if (t === 'chamber') buildChamber(A, y0, y1);
  else buildPit(A, y0, y1);
}

// 결승 직전: 모든 공을 좁은 슈트로 합류시키는 그랜드 깔때기 (막판 접전 보장)
function buildGrandFunnel(A: Arrays, y0: number, finishY: number): void {
  const cx = W / 2;
  const chute = 110;
  const throatY = finishY - 80;
  // 벽 면에서 시작해 모든 공을 슈트로 강제 합류(가장자리 직하 차단)
  pushWallLine(A.slopes, WALL, y0 + 20, cx - chute / 2, throatY, 16);
  pushWallLine(A.slopes, W - WALL, y0 + 20, cx + chute / 2, throatY, 16);
  const H = finishY - throatY + 30;
  A.slopes.push({ x: cx - chute / 2, y: throatY + H / 2 - 15, w: 16, h: H, angle: 0 });
  A.slopes.push({ x: cx + chute / 2, y: throatY + H / 2 - 15, w: 16, h: H, angle: 0 });
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
  // 셔플 백: 섞은 BAG(4종)를 이어붙여 같은 타입 뭉침을 막고 모든 타입 등장을 보장.
  // canyon은 백에서 빼고 60% 확률로 코스당 1개만 임의 위치에 삽입.
  const count = 7 + Math.floor(crng() * 3); // 7~9 중간 구간
  const includeCanyon = crng() < 0.6;
  const need = count - (includeCanyon ? 1 : 0);
  const seq: SectionId[] = [];
  let last: SectionId = 'pinfield'; // 리드인과의 인접 중복 방지
  while (seq.length < need) {
    const bag = shuffled(BAG);
    if (bag[0] === last) [bag[0], bag[1]] = [bag[1], bag[0]]; // 백 경계 중복 해소
    seq.push(...bag);
    last = seq[seq.length - 1];
  }
  seq.length = need;
  if (includeCanyon) seq.splice(Math.floor(crng() * (need + 1)), 0, 'canyon');
  for (const t of seq) add(t);

  const finishStart = y;
  const finishY = y + FINISH_H;
  buildGrandFunnel(A, finishStart, finishY);
  sections.push({ y0: finishStart, y1: finishY, hue: HUE.finish, name: NAME.finish });

  return {
    seed: s,
    width: W, height: finishY + 120, startY: TOP, finishY,
    wallThickness: WALL, ballRadius: BALL_R,
    ...A, sections,
  };
}
