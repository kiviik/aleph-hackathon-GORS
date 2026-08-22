// Links the @qvac/onnx Bare addon into the Android and iOS builds.
//
// Why this exists: @qvac/onnx ships per-host prebuilds, but neither platform's default packaging
// picks them up, and Bare's `--linked` bundles expect the native code to be linked ahead of time
// rather than dlopen'd from node_modules (which does not exist on device).
//
// Android: the packager only extracts files matching lib*.so from an APK.
// react-native-bare-kit may already sweep prebuilds into jniLibs via its own `link.mjs` gradle
// task; if it does, this plugin is a harmless no-op overwrite. Verify after `expo prebuild` with:
//
//   ls android/app/src/main/jniLibs/arm64-v8a/
//
// iOS: react-native-bare-kit.podspec vendors `ios/addons/*.xcframework` and builds those addons
// in its `prepare_command` (`node ios/link.mjs`). CocoaPods SKIPS prepare_command for pods
// referenced by `:path` -- which is every React Native pod -- so that command never runs in an
// app, `ios/addons` stays empty, and the glob vendors nothing. We run the same bare-link step
// ourselves from a dangerous mod, which fires during `expo prebuild` and therefore before
// `pod install` evaluates the glob. Verify after `expo prebuild` with:
//
//   ls node_modules/react-native-bare-kit/ios/addons/
//
// Facts read from the shipped binaries (not assumed):
//   android-arm64
//   - stripped aarch64 ELF shared object
//   - exports bare_register_module_v0, exactly like the working linux-x64 prebuild
//   - also exports OrtSessionOptionsAppendExecutionProvider_Nnapi, so NNAPI is compiled in
//   - NEEDED: liblog.so libdl.so libvulkan.so libm.so libc++_shared.so libc.so
//     libvulkan.so requires API >= 24; libc++_shared.so must be packaged by the app.
//   ios-arm64 / ios-arm64-simulator / ios-x64-simulator
//   - three DISTINCT Mach-O dylibs (not copies of each other), so device and both simulator
//     architectures are all genuinely covered; bare-link merges them into one xcframework.
//   - export _bare_register_module_v0 plus _OrtSessionOptionsAppendExecutionProvider_CoreML,
//     so CoreML is compiled in on Apple platforms (the NNAPI counterpart on Android).
//   - min_deployment 14.0, below the Expo SDK 54 default iOS target, so nothing to raise.
const { withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ABI = "arm64-v8a";
const PKG = "node_modules/@qvac/onnx";
const SRC = `${PKG}/prebuilds/android-arm64/qvac__onnx.bare`;

// Kept in sync with react-native-bare-kit/ios/link.mjs, whose job we are taking over.
const IOS_TARGETS = ["ios-arm64", "ios-arm64-simulator", "ios-x64-simulator"];

const INSTALL_HINT =
  "Run: npm i @qvac/onnx && (cd node_modules/@qvac/onnx && npm run mobile:copy-prebuilds)";

// bare-pack --linked rewrites require.addon() to a per-host name that the loader resolves at
// runtime -- `linked:libqvac__onnx.<version>.so` on Android, and
// `linked:qvac__onnx.<version>.framework/qvac__onnx.<version>` on iOS. The artifact names must
// match those EXACTLY -- dropping the version silently produces a build where the addon is
// present but never found. Both names are emitted by `npm run bundle:worklet`, which packs with
// `--preset mobile`; a bundle packed for one platform only will fail on the other at runtime.
function addonVersion(projectRoot) {
  return require(path.join(projectRoot, PKG, "package.json")).version;
}

function withJniLib(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const src = path.join(root, SRC);
      if (!fs.existsSync(src)) {
        throw new Error(`[withQvacOnnx] missing ${SRC}. ${INSTALL_HINT}`);
      }
      const destName = `libqvac__onnx.${addonVersion(root)}.so`;
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

function withIosAddons(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;

      for (const target of IOS_TARGETS) {
        const prebuild = path.join(root, PKG, "prebuilds", target, "qvac__onnx.bare");
        if (!fs.existsSync(prebuild)) {
          throw new Error(
            `[withQvacOnnx] missing ${PKG}/prebuilds/${target}/qvac__onnx.bare. ${INSTALL_HINT}`
          );
        }
      }

      // Resolve both from react-native-bare-kit's own directory: bare-link is its dependency,
      // and `ios/addons` is the only path its podspec globs.
      const bareKit = path.dirname(
        require.resolve("react-native-bare-kit/package.json", { paths: [root] })
      );
      const link = require(require.resolve("bare-link", { paths: [bareKit, root] }));
      const out = path.join(bareKit, "ios", "addons");

      // bare-link walks the whole dependency graph, so this also emits the other Bare addons
      // (bare-fs, bare-os, bare-buffer, ...) -- ~2.5 MB combined next to @qvac/onnx's 63 MB.
      // That is deliberate parity with react-native-bare-kit's own link.mjs: the current worklet
      // bundle only links qvac__onnx, but narrowing this would silently diverge from what the
      // pod expects to vendor.
      let count = 0;
      for await (const resource of link(root, { target: IOS_TARGETS, out })) {
        if (resource.endsWith(".xcframework")) count++;
      }

      const expected = `qvac__onnx.${addonVersion(root)}.xcframework`;
      const framework = path.join(out, expected);
      if (!fs.existsSync(framework)) {
        throw new Error(
          `[withQvacOnnx] bare-link produced ${count} xcframework(s) in ${out} but not ${expected}.`
        );
      }
      console.log(`[withQvacOnnx] linked ${expected} and ${count - 1} other addon(s) into react-native-bare-kit/ios/addons`);
      return cfg;
    },
  ]);
}

module.exports = function withQvacOnnx(config) {
  return withIosAddons(withGradle(withJniLib(config)));
};
