export interface MouthCleanRuntime {
  canvas: HTMLCanvasElement;
  update(deltaMs: number): void;
  render(width: number, height: number): void;
  status(): { loading: boolean; message: string; cleaned: number; total: number; flash: string };
  key(key: string, down: boolean): void;
  move(x: number, y: number): void;
  suspend(): void;
  dispose(): void;
}
export function createMouthClean(options?: { heroScale?: number }): MouthCleanRuntime;
