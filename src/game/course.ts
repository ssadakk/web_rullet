// 세로 낙하 코스: 성격이 다른 '구간(섹션)'을 랜덤으로 이어붙인 시퀀스.
// 균일 핀 격자(과거)의 단조로움을 구간 단위 구조 변화로 깬다.
// 좌표 y는 아래로 증가. 바깥 좌우 벽(world.ts)이 코스를 가두고, 섹션은 그 안에
// 장애물을 채운다(항상 통로를 남겨 솔버빌리티 보장).

export interface Peg { x: number; y: number; r: number }
export interface Bumper { x: number; y: number; r: number }            // 고탄성 범퍼
export interface Spinner { x: number; y: number; length: number; thickness: number; speed: number; angle: number }
export interface Booster { x: number; y: number; w: number; h: number; fx: number; fy: number }
export interface Teleport { ex: number; ey: number; er: number; tx: number; ty: number }
export interface Slope { x: number; y: number; w: number; h: number; angle: number } // 정적 경사/벽 (깔때기·협곡·슈트에 재사용)
export interface JumpPad { x: number; y: number; w: number; h: number; vy: number }
export interface Cannon { x: number; y: number; w: number; h: number; vx: number; vy: number }
export interface Splitter { x: number; y: number; radius: number; angle: number }
export interface SectionZone { y0: number; y1: number; hue: number; name: string }

export interface Course {
  width: number;
  height: number;
  startY: number;
  finishY: number;
  wallThickness: number;
  ballRadius: number;
  pegs: Peg[];
  bumpers: Bumper[];
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
const MIDDLE: SectionId[] = ['pinfield', 'funnel', 'canyon', 'chamber', 'pit'];

const HEIGHT: Record<SectionId, number> = {
  pinfield: 360, funnel: 380, canyon: 460, chamber: 420, pit: 320,
};
const FINISH_H = 400;

const HUE: Record<string, number> = {
  pinfield: 190, funnel: 350, canyon: 275, chamber: 32, pit: 150, finish: 318,
};
const NAME: Record<string, string> = {
  pinfield: 'PINS', funnel: 'FUNNEL', canyon: 'CANYON', chamber: 'CHAOS', pit: 'DROP', finish: 'FINAL',
};

function emptyArrays(): Arrays {
  return { pegs: [], bumpers: [], spinners: [], boosters: [], teleports: [], slopes: [], jumppads: [], cannons: [], splitters: [] };
}

function pushPegRow(pegs: Peg[], y: number, r: number): void {
  const offset = (r % 2) * (PIN_GAP / 2);
  for (let x = innerL + offset; x <= innerR; x += PIN_GAP) {
    pegs.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, r: PEG_R });
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
    if (Math.random() < 0.35) {
      const x = innerL + 40 + Math.random() * (innerW - 80);
      const pick = Math.floor(Math.random() * 3);
      if (pick === 0) A.boosters.push({ x, y, w: 84, h: 28, fx: (Math.random() - 0.5) * 0.005, fy: 0.015 });
      else if (pick === 1) A.splitters.push({ x, y, radius: 24, angle: -Math.PI / 2 });
      else A.teleports.push({ ex: x, ey: y, er: 22, tx: innerL + Math.random() * innerW, ty: Math.min(y + ROW_GAP * 2, y1 + ROW_GAP) });
    }
  }
}

function buildFunnel(A: Arrays, y0: number, y1: number): void {
  const cx = W / 2 + (Math.random() - 0.5) * 60;
  const throatY = (y0 + y1) / 2;
  const throat = 6.4 * BALL_R; // 출구 폭 (파일업 배수 위해 넉넉히)
  pushWallLine(A.slopes, innerL, y0 + 30, cx - throat / 2, throatY);
  pushWallLine(A.slopes, innerR, y0 + 30, cx + throat / 2, throatY);
  for (let y = throatY + 80; y < y1 - 20; y += ROW_GAP) pushPegRow(A.pegs, y, 0);
}

function buildCanyon(A: Arrays, y0: number, y1: number): void {
  const shelves = 3;
  const gap = 6.8 * BALL_R; // 반대편 통로
  const len = innerW - gap;
  for (let k = 0; k < shelves; k++) {
    const y = y0 + 70 + k * ((y1 - y0 - 100) / shelves);
    const leftSide = k % 2 === 0;
    const cx = leftSide ? innerL + len / 2 : innerR - len / 2;
    const angle = (leftSide ? 1 : -1) * (0.17 + Math.random() * 0.07);
    A.slopes.push({ x: cx, y, w: len, h: 18, angle });
  }
}

function buildChamber(A: Arrays, y0: number, y1: number): void {
  const cy = (y0 + y1) / 2;
  const ns = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < ns; i++) {
    const x = innerL + innerW * (0.3 + Math.random() * 0.4);
    const y = y0 + 90 + Math.random() * (y1 - y0 - 200);
    A.spinners.push({
      x, y, length: 108 + Math.random() * 30, thickness: 18,
      speed: (Math.random() < 0.5 ? 1 : -1) * (0.03 + Math.random() * 0.03), angle: Math.random() * Math.PI,
    });
  }
  const bx = innerL + innerW * (0.25 + Math.random() * 0.5);
  for (const [ox, oy] of [[0, -42], [-42, 0], [42, 0], [0, 42], [0, 0]]) {
    A.bumpers.push({ x: bx + ox, y: cy + oy, r: 11 });
  }
  pushPegRow(A.pegs, y0 + 34, 0);
  pushPegRow(A.pegs, y1 - 34, 1);
  if (Math.random() < 0.5) A.boosters.push({ x: innerL + 45 + Math.random() * (innerW - 90), y: y0 + 64, w: 84, h: 28, fx: (Math.random() - 0.5) * 0.005, fy: 0.015 });
}

function buildPit(A: Arrays, y0: number, y1: number): void {
  for (let y = y0 + 80; y < y1 - 50; y += ROW_GAP) {
    A.pegs.push({ x: innerL + 8 + (Math.random() - 0.5) * 6, y, r: PEG_R });
    A.pegs.push({ x: innerR - 8 + (Math.random() - 0.5) * 6, y, r: PEG_R });
  }
  const x = innerL + 60 + Math.random() * (innerW - 120);
  const y = y1 - 70;
  if (Math.random() < 0.5) A.jumppads.push({ x, y, w: 78, h: 22, vy: -13 });
  else A.cannons.push({ x, y, w: 70, h: 28, vx: (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 3), vy: 12 });
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
  pushWallLine(A.slopes, innerL, y0 + 20, cx - chute / 2, throatY, 16);
  pushWallLine(A.slopes, innerR, y0 + 20, cx + chute / 2, throatY, 16);
  const H = finishY - throatY + 30;
  A.slopes.push({ x: cx - chute / 2, y: throatY + H / 2 - 15, w: 16, h: H, angle: 0 });
  A.slopes.push({ x: cx + chute / 2, y: throatY + H / 2 - 15, w: 16, h: H, angle: 0 });
}

export function generateCourse(): Course {
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
  const count = 7 + Math.floor(Math.random() * 3); // 7~9 중간 구간
  let prev: SectionId = 'pinfield';
  for (let i = 0; i < count; i++) {
    let t = MIDDLE[Math.floor(Math.random() * MIDDLE.length)];
    if (t === prev) t = MIDDLE[(MIDDLE.indexOf(t) + 1) % MIDDLE.length];
    add(t);
    prev = t;
  }

  const finishStart = y;
  const finishY = y + FINISH_H;
  buildGrandFunnel(A, finishStart, finishY);
  sections.push({ y0: finishStart, y1: finishY, hue: HUE.finish, name: NAME.finish });

  return {
    width: W, height: finishY + 120, startY: TOP, finishY,
    wallThickness: WALL, ballRadius: BALL_R,
    ...A, sections,
  };
}
