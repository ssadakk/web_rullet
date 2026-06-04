export type BallId = number;

export interface Vec2 {
  x: number;
  y: number;
}

export interface BallInit {
  id: BallId;
  name: string;
  color: string;
}

export type ResultMode = 'winner' | 'penalty' | 'ranking';
