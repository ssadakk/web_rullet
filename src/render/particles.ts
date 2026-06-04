export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
  color: string;
  size: number;
}

const BASE_DT = 1000 / 60;
const MAX_PARTICLES = 320;

// 월드 좌표 임팩트 파티클(부스터·점프·대포·워프·결승). 카메라 변환 안에서 그린다.
export class Particles {
  list: Particle[] = [];

  burst(x: number, y: number, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1.5,
        life: 1,
        color,
        size: 2 + Math.random() * 2.5,
      });
    }
    if (this.list.length > MAX_PARTICLES) {
      this.list.splice(0, this.list.length - MAX_PARTICLES);
    }
  }

  update(deltaMs: number): void {
    const dt = deltaMs / BASE_DT;
    for (const p of this.list) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.16 * dt; // 약한 중력
      p.life -= dt / 26;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  clear(): void {
    this.list = [];
  }
}
