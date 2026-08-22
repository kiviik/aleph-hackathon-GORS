// The src/core modules are plain ESM with JSDoc, deliberately not TypeScript: the same files are
// consumed by Metro (React Native), bare-pack (the Bare worklet) and `node --test` on the laptop,
// with no build step in any of them. These declarations give the TS side real types anyway.
declare module "*/core/preprocess.mjs" {
  export const SIZE: number;
  export const PAD: number;
  export type DecodedImage = { data: Uint8Array; width: number; height: number; channels: number };
  export type Letterboxed = {
    tensor: Float32Array; scale: number; padX: number; padY: number;
    width: number; height: number; offX: number; offY: number;
    full: { width: number; height: number };
  };
  export function decodeJpeg(bytes: Uint8Array): DecodedImage;
  export function createTensor(): Float32Array;
  export function createScratch(maxRegionHeight?: number): Float32Array;
  export function letterbox(img: DecodedImage, opts?: { crop?: any; tensor?: Float32Array; scratch?: Float32Array }): Letterboxed;
  export function grayPlane(img: DecodedImage): { data: Uint8Array; width: number; height: number };
  export function meanLuma(img: DecodedImage, step?: number): number;
}
declare module "*/core/zones-rules.mjs" {
  export function tzSupport(): boolean;
  export function localNow(date?: Date, opts?: { forceFallback?: boolean }): { dow: number; minutes: number };
  export function parseEnforceable(s: string): any[] | null;
  export function parseRestrict(type: string, s: string): any[] | null;
  export function legality(zone: any, date?: Date): { parkable: boolean; paid: boolean | null; reason: string };
}
declare module "*/core/temporal.mjs" {
  export const MIN_TICKS: number;
  export function createBandState(band: any): any;
  export function updateBandState(state: any, gapResult: any, opts?: { stale?: boolean; now?: number }): any;
  export function stableGaps(state: any, scale: any): any[];
}
declare module "*/evidence/evidence.mjs" {
  export function buildObservation(args: any): any;
  export function buildRules(zone: any, at?: Date): any;
  export function bandRoi(band: any, width: number, height: number): any;
  export function overlapWithRoi(band: any, v: any): number;
}
declare module "*/policy/policy.mjs" {
  export const DEFAULT_CONFIDENCE_THRESHOLD: number;
  export function referenceDecision(evidence: any, threshold?: number): {
    decision: "PARK" | "DO_NOT_PARK" | "REFUSE"; code: string; reason: string; confidence: number;
  };
}
declare module "*/worklet/protocol.mjs" {
  export const RPC: { HEALTH: string; LOAD: string; DETECT: string; UNLOAD: string };
  export function encodeFrame(header: any, payload?: Uint8Array | null): Uint8Array;
  export function createFrameReader(onFrame: (header: any, payload: Uint8Array | null) => void): (chunk: Uint8Array) => void;
}
declare module "*/worklet/bundle.js" {
  const base64: string;
  export default base64;
}
declare module "react-native-bare-kit" {
  export class Worklet {
    constructor();
    start(filename: string, source: Uint8Array | string): void;
    terminate(): void;
    IPC: { on(event: string, cb: (data: any) => void): void; write(data: Uint8Array): void };
  }
}
