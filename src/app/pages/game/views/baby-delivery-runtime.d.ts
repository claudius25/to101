export type BabyDeliveryQuality = 'auto' | 'low' | 'medium' | 'high';
export type BabyDeliveryMode = 'level' | 'endless';

export interface BabyDeliveryResult {
  success: boolean;
  title: string;
  message: string;
  /** 0–3 in level mode, always 0 in endless mode. */
  stars: number;
  distance: number;
  feathers: number;
  /** Average sleep meter over the flight, 0–100. */
  calm: number;
  score: number;
}

/** A floating "+10" label, in normalised canvas coordinates (0–1). */
export interface BabyDeliveryFloater {
  x: number;
  y: number;
  text: string;
  alpha: number;
  scale: number;
}

export interface BabyDeliveryStatus {
  loading: boolean;
  error: string;
  /** `menu` runs an attract-mode cruise behind the start card. */
  phase: 'menu' | 'play' | 'end';
  mode: BabyDeliveryMode;
  paused: boolean;
  distance: number;
  goal: number;
  feathers: number;
  score: number;
  /** Sleep meter, 0–100. The run ends when it reaches 0. */
  sleep: number;
  soothing: boolean;
  /** Seconds of lullaby left. */
  lullaby: number;
  /** Music notes collected towards the next lullaby (0–2). */
  notes: number;
  toast: string;
  toastAlpha: number;
  floaters: BabyDeliveryFloater[];
  result: BabyDeliveryResult | null;
  qualityLevel: Exclude<BabyDeliveryQuality, 'auto'>;
}

export interface BabyDeliveryRuntime {
  canvas: HTMLCanvasElement;
  update(deltaMs: number): void;
  render(width: number, height: number): void;
  status(): BabyDeliveryStatus;
  /** Starts a run. Level 1 is a fixed 1000 m route; endless uses a fresh seed. */
  start(mode?: BabyDeliveryMode): void;
  /** Back to the attract-mode cruise. */
  menu(): void;
  setPaused(paused: boolean): void;
  /** `left` / `right` / `up` / `down`, held while `down` is true. */
  key(key: string, down: boolean): void;
  /** Analogue steering in -1..1 (x: screen right, y: up); pass null to let go. */
  steer(x: number | null, y: number | null): void;
  setQuality(mode: BabyDeliveryQuality): void;
  suspend(): void;
  dispose(): void;
}

export function createBabyDelivery(options?: {
  /** Folder holding stork.glb, baby.glb and kit.glb. Defaults to `assets/baby-delivery/`. */
  assetsUrl?: string;
  quality?: BabyDeliveryQuality;
  /** Soft chime on feather pickups. */
  sound?: boolean;
}): BabyDeliveryRuntime;
