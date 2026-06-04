// 선두를 따라가는 카메라 top 좌표를 코스 범위로 클램프 (순수 함수).
export function clampCamera(targetTop: number, viewH: number, courseH: number): number {
  if (courseH <= viewH) return 0;
  return Math.max(0, Math.min(targetTop, courseH - viewH));
}

export interface CameraInput {
  leaderY: number;
  leaderVY: number;
  spreadY: number;
  finishY: number;
  viewH: number;
  courseH: number;
}

const BASE_ZOOM = 1.15;
const ZOOM_MIN = 0.82;
const ZOOM_MAX = 1.55;

// 스크롤 top + 줌 + 화면 흔들림을 부드럽게 추적하는 동적 카메라.
export class Camera {
  top = 0;
  zoom = BASE_ZOOM;
  offX = 0;
  offY = 0;
  private shake = 0;

  reset(leaderY: number, viewH: number, courseH: number): void {
    this.zoom = BASE_ZOOM;
    const eff = viewH / this.zoom;
    this.top = clampCamera(leaderY - eff * 0.4, eff, courseH);
    this.shake = 0;
    this.offX = 0;
    this.offY = 0;
  }

  addShake(mag: number): void {
    if (mag > this.shake) this.shake = Math.min(mag, 22);
  }

  update(inp: CameraInput): void {
    const spreadZoom = Math.max(ZOOM_MIN, Math.min(1.35, (inp.viewH * 0.72) / Math.max(inp.spreadY, 130)));
    const nearFinish = Math.max(0, Math.min(1, (inp.leaderY - (inp.finishY - 460)) / 460));
    const targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(BASE_ZOOM, spreadZoom) + nearFinish * 0.3));
    this.zoom += (targetZoom - this.zoom) * 0.06;

    const eff = inp.viewH / this.zoom;
    const look = inp.leaderVY * 9;
    const targetTop = clampCamera(inp.leaderY + look - eff * 0.42, eff, inp.courseH);
    this.top += (targetTop - this.top) * 0.1;

    // 흔들림 감쇠
    this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
    this.offX = (Math.random() - 0.5) * this.shake * 2;
    this.offY = (Math.random() - 0.5) * this.shake * 2;
  }
}
