export interface GenesisGridRuntime {
  canvas: HTMLCanvasElement;
  readonly minWidth: number;
  readonly height: number;
  readonly settled: boolean;
  resize(availableWidth: number): void;
  finishAnimations(): void;
  revealName(name: string): void;
  revealFitness(fitness: string): void;
  revealFinance(finance: string): void;
  revealType(type: string): void;
  revealSocial(social: string): void;
  revealLuck(luck: string): void;
  dispose(): void;
}
export interface GenesisGridStyle {
  rows: number;
  fontSize: number;
  columnSpacing: number;
  rowSpacing: number;
  sidePadding: number;
  nextTraitDelayMs: number;
}

export function createGenesisGrid(
  style: GenesisGridStyle,
  initialName: string,
  initialFitness: string | null,
  initialFinance: string | null,
  initialType: string | null,
  initialSocial: string | null,
  initialLuck: string | null,
): GenesisGridRuntime;
