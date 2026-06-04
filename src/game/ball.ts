import type { BallId, Vec2 } from '../types';

export interface Ball {
  id: BallId;
  name: string;
  color: string;
  finished: boolean;
  trail: Vec2[]; // 최근 위치 (잔상용, 오래된 것이 앞)
}
