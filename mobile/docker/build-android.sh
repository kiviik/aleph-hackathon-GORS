#!/usr/bin/env bash
set -Eeuo pipefail

variant="${BUILD_VARIANT:-debug}"
case "${variant}" in
  debug) gradle_variant="Debug" ;;
  release) gradle_variant="Release" ;;
  *) echo "BUILD_VARIANT must be debug or release" >&2; exit 2 ;;
esac

rm -rf android
npx expo prebuild --platform android --non-interactive --clean

pushd android >/dev/null
./gradlew --no-daemon --stacktrace ":app:assemble${gradle_variant}"
popd >/dev/null

apk="android/app/build/outputs/apk/${variant}/app-${variant}.apk"
if [[ ! -f "${apk}" ]]; then
  echo "APK not found at ${apk}" >&2
  exit 1
fi

mkdir -p /output
output="/output/ba-estaciona-android-${variant}.apk"
cp "${apk}" "${output}"
echo "APK written to ${output}"
