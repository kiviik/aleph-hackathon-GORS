FROM node:22-bookworm

ARG ANDROID_CMDLINE_TOOLS_VERSION=13114758

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    GRADLE_USER_HOME=/tmp/gradle \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/emulator:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates file git openjdk-17-jdk unzip wget \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
  && wget -q "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_VERSION}_latest.zip" -O /tmp/android-cli.zip \
  && unzip -q /tmp/android-cli.zip -d /tmp/android-cli \
  && mv /tmp/android-cli/cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest" \
  && rm -rf /tmp/android-cli /tmp/android-cli.zip

RUN yes | sdkmanager --licenses >/dev/null || true \
  && sdkmanager --sdk_root="${ANDROID_HOME}" \
    "platform-tools" \
    "platforms;android-35" \
    "platforms;android-36" \
    "build-tools;35.0.0" \
    "build-tools;36.0.0"

WORKDIR /workspace

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . ./

ENTRYPOINT ["bash", "docker/build-android.sh"]
