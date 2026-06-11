import type { ResultMode } from './types';

// 결과 공유 링크: 시드+명단+모드를 URL 해시로 인코딩한다.
// 같은 시드 → 같은 코스·같은 결과 → "조작 없음" 재검증 + 같은 코스 리매치.

export interface ShareData {
  seed?: number;
  names?: string[];
  mode?: ResultMode;
}

const MODES: ResultMode[] = ['winner', 'penalty', 'ranking'];

export function encodeShare(d: ShareData): string {
  const p = new URLSearchParams();
  if (d.seed !== undefined) p.set('s', (d.seed >>> 0).toString(36));
  if (d.names && d.names.length) p.set('n', d.names.join('\n'));
  if (d.mode) p.set('m', d.mode);
  return '#' + p.toString();
}

export function decodeShare(hash: string): ShareData {
  const raw = hash.replace(/^#/, '');
  if (!raw) return {};
  const p = new URLSearchParams(raw);
  const out: ShareData = {};
  const s = p.get('s');
  if (s) {
    const n = parseInt(s, 36);
    if (Number.isFinite(n)) out.seed = n >>> 0;
  }
  const n = p.get('n');
  if (n) {
    const names = n.split('\n').map((x) => x.trim()).filter(Boolean);
    if (names.length) out.names = names;
  }
  const m = p.get('m');
  if (m && (MODES as string[]).includes(m)) out.mode = m as ResultMode;
  return out;
}
