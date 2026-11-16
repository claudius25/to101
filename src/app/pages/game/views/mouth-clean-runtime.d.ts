export type MouthCleanQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export interface MouthCleanRuntime {
  canvas: HTMLCanvasElement;
  update(deltaMs: number): void;
  render(width: number, height: number): void;
  status(): { loading: boolean; message: string; cleaned: number; total: number; flash: string; qualityMode: MouthCleanQuality; qualityLevel: Exclude<MouthCleanQuality, 'auto'> };
  key(key: string, down: boolean): void;
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  setQuality(mode: MouthCleanQuality): void;
  suspend(): void;
  dispose(): void;
}
export function createMouthClean(options?: { heroScale?: number; quality?: MouthCleanQuality }): MouthCleanRuntime;
