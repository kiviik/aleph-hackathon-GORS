// YOLO26s delivery. The model is NOT bundled: 38 MB would roughly double the APK, and an Android
// asset lives compressed inside the APK with no stable filesystem path, so it would have to be
// copied out anyway. Downloading once on first run gives ORT a plain POSIX path directly.
//
// docs/hackaton/07-mobile.md explicitly permits downloading during install or first launch, as
// long as the demo then runs without network.
//
// Licence: YOLO26s is Ultralytics, AGPL-3.0. It is deliberately never committed to this repo, and
// the URL/size are surfaced in the app's status screen so the provenance is auditable.
// expo-file-system 19 (SDK 54) moved documentDirectory + createDownloadResumable to /legacy and
// replaced them with a File/Paths API that has no download-progress callback. A 38 MB download
// needs progress, so the legacy path is the right call here, not a leftover.
import * as FileSystem from "expo-file-system/legacy";

export const MODEL_URL = "https://huggingface.co/zwh20081/yolo26-onnx/resolve/main/yolo26s.onnx";
export const MODEL_BYTES = 38290649;
export const MODEL_LICENSE = "AGPL-3.0 (Ultralytics YOLO26s)";
const MIN_BYTES = 30e6; // same guard as the desktop scripts/download-model.mjs

const dir = () => `${FileSystem.documentDirectory}models/`;
const uri = () => `${dir()}yolo26s.onnx`;

/**
 * ORT takes a filesystem path, not a URI. documentDirectory is
 * file:///data/user/0/<pkg>/files/ on Android, so strip the scheme.
 */
export function modelPath(): string {
  return decodeURI(uri()).replace(/^file:\/\//, "");
}

export type ModelStatus = { present: boolean; bytes: number; path: string; url: string; license: string };

export async function status(): Promise<ModelStatus> {
  const info = await FileSystem.getInfoAsync(uri());
  const bytes = info.exists && !info.isDirectory ? (info as any).size ?? 0 : 0;
  return { present: info.exists && bytes > MIN_BYTES, bytes, path: modelPath(), url: MODEL_URL, license: MODEL_LICENSE };
}

/**
 * Download once, resumable, with progress. Writes to a .part file and renames, so an interrupted
 * download can never be mistaken for a complete model.
 */
export async function ensureModel(onProgress?: (fraction: number, bytes: number) => void): Promise<ModelStatus> {
  const existing = await status();
  if (existing.present) return existing;

  await FileSystem.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => {});
  const part = `${uri()}.part`;
  await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});

  const task = FileSystem.createDownloadResumable(MODEL_URL, part, {}, (p) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : MODEL_BYTES;
    onProgress?.(Math.min(1, p.totalBytesWritten / total), p.totalBytesWritten);
  });

  const result = await task.downloadAsync();
  if (!result) throw new Error("model download was interrupted");

  const info = await FileSystem.getInfoAsync(part);
  const size = (info as any).size ?? 0;
  if (!info.exists || size < MIN_BYTES) {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    throw new Error(`model download incomplete: ${size} bytes, expected ~${MODEL_BYTES}`);
  }

  await FileSystem.moveAsync({ from: part, to: uri() });
  return status();
}
