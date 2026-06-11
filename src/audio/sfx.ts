// WebAudio 신스 SFX — 외부 에셋 0개. 오실레이터·노이즈로 합성한다.
// AudioContext는 자동재생 정책상 사용자 제스처(시작 클릭) 후 ensure()로 생성.
// 여기서 쓰는 Math.random은 소리 텍스처용 — 게임 결정성과 무관(엔진 rng와 분리).

type Wave = OscillatorType;

const MASTER_GAIN = 0.28;
const HIT_MIN_GAP_MS = 45; // 파친코 틱 rate-limit

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastHitMs = -Infinity;
  private streamDest: MediaStreamAudioDestinationNode | null = null;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : MASTER_GAIN;
  }

  // 녹화용 오디오 트랙 스트림 — master를 MediaStreamDestination에도 연결(1회).
  // 음소거(master gain 0) 시엔 무음 트랙이 담긴다.
  captureStream(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    if (!this.streamDest) {
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.streamDest);
    }
    return this.streamDest.stream;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private blip(freq: number, dur: number, type: Wave = 'sine', gain = 0.2, slideTo?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, cutoff = 700): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  // 핀/범퍼 타격: rate-limited 파친코 틱. 충돌 속도에 비례한 음량·피치.
  hit(speed: number, nowMs: number): void {
    if (!this.ctx || this.muted) return;
    if (nowMs - this.lastHitMs < HIT_MIN_GAP_MS) return;
    this.lastHitMs = nowMs;
    const v = Math.min(1, speed / 11);
    if (v < 0.18) return; // 약한 스침은 무음
    const freq = 760 + Math.random() * 760;
    this.blip(freq, 0.04, 'triangle', 0.04 + v * 0.12);
  }

  // 장치 발동: 종류별 음색
  device(kind: 'teleport' | 'jump' | 'cannon' | 'pop'): void {
    switch (kind) {
      case 'cannon': this.noiseBurst(0.2, 0.22, 500); this.blip(150, 0.26, 'sawtooth', 0.18, 70); break;
      case 'jump': this.blip(300, 0.18, 'square', 0.16, 780); break;
      case 'pop': this.blip(520, 0.08, 'square', 0.15); break;
      case 'teleport': this.blip(680, 0.22, 'sine', 0.12, 1500); break;
    }
  }

  // 도착: 등수가 낮을수록(꼴찌에 가까울수록) 피치 하강 아르페지오
  finish(rank: number, total: number): void {
    const frac = total > 1 ? (rank - 1) / (total - 1) : 0;
    const base = 920 - frac * 480;
    this.blip(base, 0.12, 'sine', 0.18);
    this.blip(base * 1.5, 0.16, 'sine', 0.12);
  }
}
