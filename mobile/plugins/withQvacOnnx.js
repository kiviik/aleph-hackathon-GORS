// Links the @qvac/onnx Bare addon into the Android build.
//
// Why this exists: @qvac/onnx ships prebuilds/android-arm64/qvac__onnx.bare, but Android's
// packager only extracts files matching lib*.so from an APK, and Bare's `--linked` bundles expect
// the native code to be linked ahead of time rather than dlopen'd from node_modules (which does
// not exist on device). react-native-bare-kit may already sweep prebuilds into jniLibs; if it
// does, this plugin is a harmless no-op overwrite. Verify after `expo prebuild` with:
//
//   ls android/app/src/main/jniLibs/arm64-v8a/
//
// Facts read from the shipped binary (not assumed):
//   - it is a stripped aarch64 ELF shared object
//   - it exports bare_register_module_v0, exactly like the working linux-x64 prebuild
//   - it also exports OrtSessionOptionsAppendExecutionProvider_Nnapi, so NNAPI is compiled in
//   - NEEDED: liblog.so libdl.so libvulkan.so libm.so libc++_shared.so libc.so
//     libvulkan.so requires API >= 24; libc++_shared.so must be packaged by the app.
//   - android-arm64 has no .bare.exports file, unlike ios-arm64/darwin-arm64. That file is an
//     Apple (Mach-O) artifact: linux-x64 has none either and works. Not a blocker.
const { withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ABI = "arm64-v8a";
const PKG = "node_modules/@qvac/onnx";
const SRC = `${PKG}/prebuilds/android-arm64/qvac__onnx.bare`;

// bare-pack --linked rewrites require.addon() to `linked:libqvac__onnx.<version>.so`, and the
// loader resolves that by SONAME at runtime. The jniLibs filename must match it EXACTLY --
// dropping the version silently produces a build where the addon is present but never found.
// Verified against the packed bundle manifest: addons: ["linked:libqvac__onnx.0.15.1.so"].
function linkedName(projectRoot) {
  const { version } = require(require("path").join(projectRoot, PKG, "package.json"));
  return `libqvac__onnx.${version}.so`;
}

function withJniLib(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const src = path.join(root, SRC);
      if (!fs.existsSync(src)) {
        throw new Error(
          `[withQvacOnnx] missing ${SRC}. Run: npm i @qvac/onnx && (cd node_modules/@qvac/onnx && npm run mobile:copy-prebuilds)`
        );
      }
      const destName = linkedName(root);
      const destDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "jniLibs", ABI);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, destName));
      console.log(`[withQvacOnnx] linked ${destName} (${(fs.statSync(src).size / 1e6).toFixed(1)} MB) into jniLibs/${ABI}`);
      return cfg;
    },
  ]);
}

function withGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    if (cfg.modResults.contents.includes("// qvac-onnx")) return cfg;

    const block = `
android {
    // qvac-onnx
    defaultConfig {
        // Only arm64-v8a is shipped by @qvac/onnx, and the addon is ~20 MB per ABI.
        // Failing loudly on other ABIs beats shipping a build that cannot load the detector.
        ndk { abiFilters "${ABI}" }
    }
    packagingOptions {
        jniLibs {
            // Store uncompressed so the linker can map the .so straight out of the APK.
            useLegacyPackaging = true
        }
        // ORT and React Native both bring libc++_shared.so.
        pickFirst "**/libc++_shared.so"
    }
}
`;
    cfg.modResults.contents += block;
    return cfg;
  });
}

module.exports = function withQvacOnnx(config) {
  return withGradle(withJniLib(config));
};
