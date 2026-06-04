export const PALETTE: readonly string[] = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#a9a9a9', '#ff6b6b', '#1abc9c',
];

export function assignColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => PALETTE[i % PALETTE.length]);
}
