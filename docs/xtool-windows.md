# Windows xtool build — November 3, 2026

Braive now has a SwiftPM library product in `Package.swift` and an `xtool.yml` app configuration alongside its Xcode project. Both build the same `ios/Braive` Swift sources and pinned GLTFKit2 0.5.15 dependency. The xtool configuration copies the same 355 bundled GLBs, manifest, audio, mark and icon to the app. `xtool-Info.plist` contains literal app metadata because xtool does not expand Xcode's `$(...)` build-setting placeholders; keep its version in sync with `ios/Braive/Info.plist`.

xtool 1.24.0 with Swift 6.4.1 is running in the local persistent Docker container `braive-xtool-build`. The user-supplied Xcode 27.1 XIP was mounted read-only and `xtool sdk install /xip/Xcode_27.1.xip --slim` succeeded. `swift sdk list` reports `darwin` and `xtool sdk status` reports an installed SDK. The XIP is not committed. A local `braive-xtool-sdk:local` image was saved before Apple authentication; `braive-xtool-ready` uses that image with USB access and a running usbmuxd service. The owner has since authenticated xtool inside `braive-xtool-ready`; credentials remain outside the repository.

`docker exec braive-xtool-build sh -lc 'cd /work && xtool dev build'` completed an unsigned arm64 iPhone app at `xtool/Braive.app`. Its Info.plist has `edu.uiuc.braive`, version `0.4 (5)`, and the microphone/speech/local-network permissions. Inspection found all 355 GLBs, six WAVs, the manifest, icon, mark and `Braive_Braive.bundle/Stereo.metal`. A second build in `braive-xtool-ready` also passed. Build output reported only an existing Swift capture warning in `Session.swift`.

Linux xtool cannot run Apple's offline `metal` compiler. The SwiftPM target copies `Stereo.metal` as a resource, and `StereoRenderer` compiles that same source with `MTLDevice.makeLibrary(source:)` on the iPhone. Xcode continues using its default precompiled Metal library. This preserves the shader and stereo pipeline, but device startup and GPU behavior still need verification.

## Device installation status

With the iPhone 14 attached to WSL through USBIPD, xtool detected it and pairing validation succeeded. `xtool dev run --usb` built, provisioned, signed and packaged the app, then stalled after `[Connecting] 100%`. A subsequent `idevicepair validate` failed with a mux error. The phone was detached from WSL and returned to Windows.

xtool's [Windows installation guide](https://github.com/xtool-org/xtool/blob/main/Documentation/xtool.docc/Installation-Linux.md) links to [issue #19's workaround](https://github.com/xtool-org/xtool/issues/19): use the Windows Apple Devices/iTunes service on TCP port 27015 instead of USBIPD when the mux connection stalls. With that service available on this host, the Docker container reached it directly at `host.docker.internal:27015`; no Windows port forwarding or firewall change was needed. After accepting the iPhone's Trust prompt, `USBMUXD_SOCKET_ADDRESS=host.docker.internal:27015 idevicepair validate` succeeded.

`USBMUXD_SOCKET_ADDRESS=host.docker.internal:27015 xtool dev run --usb` then completed signing, installation and verification with exit code zero. `ideviceinstaller -l` confirmed Braive version 5 on the phone. xtool prefixes the signed app's bundle ID with an `XTL-...` identifier, so the on-device ID differs from `edu.uiuc.braive`. `xtool launch` returned `DebugserverClient.Error.unknown`, matching xtool's [known iOS 17+ launch limitation](https://github.com/xtool-org/xtool/issues/44). Launch Braive by tapping its icon on the iPhone; physical app behavior still needs verification.

After installation, check the icon, forest, stereo shader, assets/audio, backend connection and practice loop on the device. The Xcode `.xcodeproj` remains the supported Mac build path.

The Docker containers retain their SDK and build caches across normal stops/restarts. If they are removed, the saved local SDK image can recreate a fresh device container; deleting that image requires reinstalling the SDK from the XIP. `xtool/`, `.build/` and `.bsp/` are generated and ignored by Git.
