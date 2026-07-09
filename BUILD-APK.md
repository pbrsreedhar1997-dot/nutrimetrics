# Building the Android APK (Capacitor)

The APK is a native Android shell around the web app. It's configured (in
`capacitor.config.json`) to load the live site from
`https://nutrimetrics.onrender.com`, so the API, WebSocket, and all features work
exactly like the deployed web app — no separate mobile backend needed.

> Note: this build does NOT yet read the phone's native OS step counter — that's
> the next Phase 3 step (add a Health Connect Capacitor plugin). Today the app
> uses the same motion-sensor pedometer as the web version.

## One-time toolchain setup (macOS)
```bash
brew install openjdk@21                       # Capacitor 7 needs JDK 21

# Android SDK command-line tools (no Android Studio required)
export ANDROID_HOME="$HOME/Library/Android/sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"
# download commandlinetools-mac-*.zip from developer.android.com, unzip so tools
# live at $ANDROID_HOME/cmdline-tools/latest/bin
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## Regenerate the native project (if `android/` is absent — it's gitignored)
```bash
npm install                 # installs @capacitor/{core,cli,android}
npx cap add android
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

## Build the debug APK
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$PATH"
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

If you change the web app or `capacitor.config.json`, run `npx cap sync android`
before rebuilding.

## Install on a phone
Transfer `app-debug.apk` to an Android device (USB, email, cloud), enable
"install unknown apps" for the file source, and tap to install. Or with the
phone connected via USB debugging:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
