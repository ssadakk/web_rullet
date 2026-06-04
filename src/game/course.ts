// 세로 낙하 코스의 랜덤 생성과 데이터 모델.
// 좌표 y는 아래로 증가(matter 중력 방향). 매판 Math.random으로 새 코스 생성.

export interface Peg { x: number; y: number; r: number }
export interface Spinner { x: number; y: number; length: number; thickness: number; speed: number; angle: number }
export interface Booster { x: number; y: number; w: number; h: number; fx: number; fy: number }
export interface Teleport { ex: number; ey: number; er: number; tx: number; ty: number }
export interface Slope { x: number; y: number; w: number; h: number; angle: number }
export interface JumpPad { x: number; y: number; w: number; h: number; vy: number }   // 위로 발사
export interface Cannon { x: number; y: number; w: number; h: number; vx: number; vy: number } // 강하게 발사
export interface Splitter { x: number; y: number; radius: number; angle: number }     // 삼각 갈림

export interface Course {
  width: number;
  height: number;
  startY: number;       // 공 투하 y
  finishY: number;      // 이 y를 넘으면 도착
  wallThickness: number;
  ballRadius: number;
  pegs: Peg[];
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
const ROWS = 40;
const PIN_GAP = 66;
const PAD = 24; // 벽 안쪽 여유

const innerL = WALL + PAD;
const innerR = W - WALL - PAD;
const innerW = innerR - innerL;

function pushPegRow(pegs: Peg[], y: number, r: number): void {
  const offset = (r % 2) * (PIN_GAP / 2);
  for (let x = innerL + offset; x <= innerR; x += PIN_GAP) {
    pegs.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      r: PEG_R,
    });
  }
}

export function generateCourse(): Course {
  const pegs: Peg[] = [];
  const spinners: Spinner[] = [];
  const boosters: Booster[] = [];
  const teleports: Teleport[] = [];
  const slopes: Slope[] = [];
  const jumppads: JumpPad[] = [];
  const cannons: Cannon[] = [];
  const splitters: Splitter[] = [];

  const finishY = TOP + (ROWS + 1) * ROW_GAP + 60;
  const height = finishY + 120;
  const rowY = (r: number) => TOP + (r + 1) * ROW_GAP;

  for (let r = 0; r < ROWS; r++) {
    const y = rowY(r);
    // 처음/끝 행, 그리고 약 32% 확률로 장치 행. 나머지는 핀 행.
    const isDevice = r >= 2 && r < ROWS - 1 && Math.random() < 0.44;
    if (!isDevice) {
      pushPegRow(pegs, y, r);
      continue;
    }

    const pick = Math.floor(Math.random() * 7);
    if (pick === 4) {
      // 점프대: 밟으면 위로 튕겨 큰 포물선 (카오스·역전)
      const x = innerL + 42 + Math.random() * (innerW - 84);
      jumppads.push({ x, y, w: 78, h: 22, vy: -13 });
    } else if (pick === 5) {
      // 대포: 강하게 대각/아래로 발사 (지름길·역전)
      const x = innerL + 42 + Math.random() * (innerW - 84);
      cannons.push({ x, y, w: 70, h: 28, vx: (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 3), vy: 12 });
    } else if (pick === 6) {
      // 스플리터: 삼각 쐐기. 흐름을 좌우로 가름.
      const x = innerL + innerW * (0.3 + Math.random() * 0.4);
      splitters.push({ x, y, radius: 26, angle: -Math.PI / 2 });
    } else if (pick === 0) {
      // 회전 범퍼: 가운데 근처. 길이가 짧아(최대 140) 안쪽 폭(>500)을 못 막으므로
      // 양옆에 항상 통로가 남는다(별도 핀 보강 불필요).
      const x = innerL + innerW * (0.3 + Math.random() * 0.4);
      spinners.push({
        x, y,
        length: 110 + Math.random() * 30,
        thickness: 18,
        speed: (Math.random() < 0.5 ? 1 : -1) * (0.03 + Math.random() * 0.03),
        angle: Math.random() * Math.PI,
      });
    } else if (pick === 1) {
      // 부스터 패드 (영역). 가로 전체 안 막음.
      const x = innerL + 45 + Math.random() * (innerW - 90);
      boosters.push({ x, y, w: 84, h: 28, fx: (Math.random() - 0.5) * 0.005, fy: 0.015 });
    } else if (pick === 2) {
      // 순간이동: 입구 여기, 출구는 아래쪽 랜덤 x. 행 사이(반 칸 오프셋)에 떨궈
      // 정적 바디에 박히지 않게 한다.
      const ex = innerL + Math.random() * innerW;
      const tx = innerL + Math.random() * innerW;
      const ty = y + ROW_GAP * (2 + Math.floor(Math.random() * 3)) + ROW_GAP / 2;
      if (ty < finishY - ROW_GAP) {
        teleports.push({ ex, ey: y, er: 22, tx, ty });
      } else {
        pushPegRow(pegs, y, r); // 출구가 너무 아래면 핀 행으로 대체
      }
    } else {
      // 슬로프: 한쪽 벽에서 시작해 반대편에 넓은 통로를 남긴다(가로 전체 차단 금지).
      const len = innerW * 0.5;
      const leftSide = Math.random() < 0.5;
      const cx = leftSide ? innerL + len * 0.45 : innerR - len * 0.45;
      const angle = (leftSide ? 1 : -1) * (0.26 + Math.random() * 0.16);
      slopes.push({ x: cx, y, w: len, h: 20, angle });
    }
  }

  return {
    width: W, height, startY: TOP, finishY,
    wallThickness: WALL, ballRadius: BALL_R,
    pegs, spinners, boosters, teleports, slopes,
    jumppads, cannons, splitters,
  };
}
