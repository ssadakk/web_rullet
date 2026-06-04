import type { ResultMode } from '../types';
import { parseNames } from '../input';

export interface StartConfig {
  names: string[];
  mode: ResultMode;
}

export interface Placement {
  rank: number;
  name: string;
}

export interface UI {
  canvas: HTMLCanvasElement;
  onStart(handler: (cfg: StartConfig) => void): void;
  setLiveStandings(placements: Placement[]): void;
  showResult(ranking: string[], mode: ResultMode): void;
}

export function mountUI(root: HTMLElement): UI {
  root.innerHTML = `
    <div class="layout">
      <aside class="panel">
        <h1>네온 낙하 레이스</h1>
        <textarea id="names" rows="9" placeholder="한 줄에 한 명"></textarea>
        <label>결과 모드
          <select id="mode">
            <option value="ranking">전체 순위</option>
            <option value="winner">당첨 1명</option>
            <option value="penalty">벌칙 1명</option>
          </select>
        </label>
        <button id="start">시작</button>
        <p id="hint"></p>
        <h2 class="live-title">도착 순위</h2>
        <ul id="live"></ul>
      </aside>
      <main class="stage">
        <canvas id="canvas" width="600" height="760"></canvas>
        <div id="overlay" class="overlay hidden"></div>
      </main>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const namesEl = $<HTMLTextAreaElement>('#names');
  const modeEl = $<HTMLSelectElement>('#mode');
  const startEl = $<HTMLButtonElement>('#start');
  const hintEl = $<HTMLParagraphElement>('#hint');
  const liveEl = $<HTMLUListElement>('#live');
  const overlayEl = $<HTMLDivElement>('#overlay');
  const canvas = $<HTMLCanvasElement>('#canvas');

  let startHandler: ((cfg: StartConfig) => void) | null = null;

  const refreshStartState = () => {
    const ok = parseNames(namesEl.value).length >= 2;
    startEl.disabled = !ok;
    hintEl.textContent = ok ? '' : '최소 2명 이상 입력하세요.';
  };
  namesEl.addEventListener('input', refreshStartState);
  refreshStartState();

  startEl.addEventListener('click', () => {
    const names = parseNames(namesEl.value);
    if (names.length < 2) {
      hintEl.textContent = '최소 2명 이상 입력하세요.';
      return;
    }
    hintEl.textContent = '';
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    liveEl.innerHTML = '';
    startHandler?.({ names, mode: modeEl.value as ResultMode });
  });

  return {
    canvas,
    onStart(handler) { startHandler = handler; },
    setLiveStandings(placements) {
      liveEl.innerHTML = [...placements]
        .sort((a, b) => a.rank - b.rank)
        .map((p) => `<li><span class="rank">${p.rank}위</span> ${escapeHtml(p.name)}</li>`)
        .join('');
    },
    showResult(ranking, mode) {
      overlayEl.classList.remove('hidden');
      overlayEl.innerHTML = renderResult(ranking, mode);
      overlayEl.querySelector<HTMLButtonElement>('#restart')
        ?.addEventListener('click', () => startEl.click());
    },
  };
}

function renderResult(ranking: string[], mode: ResultMode): string {
  if (ranking.length === 0) return '';
  const restart = `<button id="restart" class="restart">다시하기</button>`;
  if (mode === 'winner') {
    return `<div class="result"><h2>🎉 당첨</h2><p class="big">${escapeHtml(ranking[0])}</p>${restart}</div>`;
  }
  if (mode === 'penalty') {
    const last = ranking[ranking.length - 1];
    return `<div class="result"><h2>💀 벌칙</h2><p class="big">${escapeHtml(last)}</p>${restart}</div>`;
  }
  const items = ranking.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  return `<div class="result"><h2>최종 순위</h2><ol>${items}</ol>${restart}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
