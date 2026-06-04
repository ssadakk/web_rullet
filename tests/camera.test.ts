import { describe, it, expect } from 'vitest';
import { clampCamera } from '../src/render/camera';

describe('clampCamera', () => {
  it('범위 안이면 타겟 그대로', () => {
    expect(clampCamera(500, 760, 3000)).toBe(500);
  });

  it('음수 타겟은 0으로', () => {
    expect(clampCamera(-100, 760, 3000)).toBe(0);
  });

  it('하단 초과는 courseH-viewH로 클램프', () => {
    expect(clampCamera(5000, 760, 3000)).toBe(3000 - 760);
  });

  it('코스가 뷰보다 작으면 0', () => {
    expect(clampCamera(100, 760, 500)).toBe(0);
  });
});
