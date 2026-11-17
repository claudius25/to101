export type MouthCleanQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export interface MouthCleanRuntime {
  canvas: HTMLCanvasElement;
  update(deltaMs: number): void;
  render(width: number, height: number): void;
  status(): { loading: boolean; message: string; error: string; cleaned: number; total: number; flash: string; heroHp: number; enemyHp: number; enemyAlive: boolean; enemyReady: boolean; turn: 'hero' | 'enemy'; turnSeconds: number; attackUsed: boolean; enemyPhase: string | null; qualityMode: MouthCleanQuality; qualityLevel: Exclude<MouthCleanQuality, 'auto'> };
  key(key: string, down: boolean): void;
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  setQuality(mode: MouthCleanQuality): void;
  suspend(): void;
  dispose(): void;
}
/** cellSize: grid cell size in world units (default 0.5 × heroScale / 0.31). key('grid', true) toggles the tongue grid. */
export function createMouthClean(options?: { heroScale?: number; quality?: MouthCleanQuality; cellSize?: number }): MouthCleanRuntime;
