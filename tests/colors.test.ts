import { describe, it, expect } from 'vitest';
import { assignColors, PALETTE } from '../src/colors';

describe('assignColors', () => {
  it('요청한 개수만큼 반환한다', () => {
    expect(assignColors(5)).toHaveLength(5);
  });

  it('팔레트 크기 이하면 모두 다른 색', () => {
    const colors = assignColors(PALETTE.length);
    expect(new Set(colors).size).toBe(PALETTE.length);
  });

  it('팔레트보다 많으면 순환한다', () => {
    const colors = assignColors(PALETTE.length + 2);
    expect(colors[PALETTE.length]).toBe(PALETTE[0]);
    expect(colors[PALETTE.length + 1]).toBe(PALETTE[1]);
  });

  it('0개면 빈 배열', () => {
    expect(assignColors(0)).toEqual([]);
  });
});
