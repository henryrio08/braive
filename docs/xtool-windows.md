# Windows xtool build — November 3, 2026

Braive now has a SwiftPM library product in `Package.swift` and an `xtool.yml` app configuration alongside its Xcode project. Both build the same `ios/Braive` Swift sources and pinned GLTFKit2 0.5.15 dependency. The xtool configuration copies the same 355 bundled GLBs, manifest, audio, mark and icon to the app. `xtool-Info.plist` contains literal app metadata because xtool does not expand Xcode's `$(...)` build-setting placeholders; keep its version in sync with `ios/Braive/Info.plist`.

xtool 1.24.0 with Swift 6.4.1 is running in the local persistent Docker container `braive-xtool-build`. The user-supplied Xcode 27.1 XIP was mounted read-only and `xtool sdk install /xip/Xcode_27.1.xip --slim` succeeded. `swift sdk list` reports `darwin` and `xtool sdk status` reports an installed SDK. The XIP is not committed. A local `braive-xtool-sdk:local` image was saved before Apple authentication; `braive-xtool-ready` uses that image with USB access and a running usbmuxd service.

`docker exec braive-xtool-build sh -lc 'cd /work && xtool dev build'` completed an unsigned arm64 iPhone app at `xtool/Braive.app`. Its Info.plist has `edu.uiuc.braive`, version `0.4 (5)`, and the microphone/speech/local-network permissions. Inspection found all 355 GLBs, six WAVs, the manifest, icon, mark and `Braive_Braive.bundle/Stereo.metal`. Build output reported only an existing Swift capture warning in `Session.swift`; no signing, installation or physical app run was attempted.

Linux xtool cannot run Apple's offline `metal` compiler. The SwiftPM target copies `Stereo.metal` as a resource, and `StereoRenderer` compiles that same source with `MTLDevice.makeLibrary(source:)` on the iPhone. Xcode continues using its default precompiled Metal library. This preserves the shader and stereo pipeline, but device startup and GPU behavior still need verification.

## Remaining device steps

1. The owner enters Apple credentials locally with `docker exec -it braive-xtool-ready xtool auth login` in PowerShell. Do not put credentials in chat or the repository. `xtool auth status` currently says `Logged out`.
2. Connect and unlock the iPhone. Use `usbipd list` to identify its current bus ID, then attach that ID to WSL as in xtool's Windows instructions. `braive-xtool-ready` already has `/dev/bus/usb` mounted and usbmuxd running. The prior read-only USB check successfully detected and paired the iPhone 14.
3. From `/work` in `braive-xtool-ready`, run `xtool dev run --usb` to sign, install and launch. Handle Trust/Developer Mode prompts on the phone. Check the icon, forest, stereo shader, assets/audio, actual backend connection and practice loop. The Xcode `.xcodeproj` remains the supported Mac build path.

The Docker containers retain their SDK and build caches across normal stops/restarts. If they are removed, the saved local SDK image can recreate a fresh device container; deleting that image requires reinstalling the SDK from the XIP. `xtool/`, `.build/` and `.bsp/` are generated and ignored by Git.
