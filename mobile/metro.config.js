// Expo Metro config.
// - `mjs` in sourceExts: src/core/* is plain ESM shared by three consumers (React Native via
//   Metro, the Bare worklet via bare-pack, and `node --test` on the laptop). Keeping one copy is
//   the point -- the code validated off-device is the code that runs on the phone.
// - `bundle`/`onnx` in assetExts: only needed if a packed worklet or model is ever imported
//   directly. The worklet is normally embedded as base64 (worklet/bundle.js) to keep the
//   asset-transformer out of the critical path.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
if (!config.resolver.sourceExts.includes("mjs")) config.resolver.sourceExts.push("mjs");
config.resolver.assetExts.push("bundle", "onnx");

module.exports = config;
