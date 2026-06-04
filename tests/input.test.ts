import { describe, it, expect } from 'vitest';
import { parseNames } from '../src/input';

describe('parseNames', () => {
  it('줄 단위로 이름을 분리한다', () => {
    expect(parseNames('철수\n영희\n민수')).toEqual(['철수', '영희', '민수']);
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(parseNames('  철수  \n 영희 ')).toEqual(['철수', '영희']);
  });

  it('빈 줄을 무시한다', () => {
    expect(parseNames('철수\n\n  \n영희')).toEqual(['철수', '영희']);
  });

  it('중복 이름을 허용한다', () => {
    expect(parseNames('철수\n철수')).toEqual(['철수', '철수']);
  });

  it('빈 입력은 빈 배열', () => {
    expect(parseNames('')).toEqual([]);
  });
});
