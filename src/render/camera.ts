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

// 스크롤 top + 줌을 부드럽게 추적하는 동적 카메라.
// - 무리가 뭉치면 당겨서(줌인) 긴장감, 흩어지면 빼서(줌아웃) 전체.
// - 선두 속도만큼 앞을 내다봄(look-ahead).
// - 결승선 근처에선 더 당겨 클로즈업.
export class Camera {
  top = 0;
  zoom = BASE_ZOOM;

  reset(leaderY: number, viewH: number, courseH: number): void {
    this.zoom = BASE_ZOOM;
    const eff = viewH / this.zoom;
    this.top = clampCamera(leaderY - eff * 0.4, eff, courseH);
  }

  update(inp: CameraInput): void {
    const spreadZoom = Math.max(ZOOM_MIN, Math.min(1.35, (inp.viewH * 0.72) / Math.max(inp.spreadY, 130)));
    const nearFinish = Math.max(0, Math.min(1, (inp.leaderY - (inp.finishY - 460)) / 460));
    const targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(BASE_ZOOM, spreadZoom) + nearFinish * 0.3));
    this.zoom += (targetZoom - this.zoom) * 0.06;

    const eff = inp.viewH / this.zoom;
    const look = inp.leaderVY * 9; // 빠를수록 더 앞을 봄
    const targetTop = clampCamera(inp.leaderY + look - eff * 0.42, eff, inp.courseH);
    this.top += (targetTop - this.top) * 0.1;
  }
}
