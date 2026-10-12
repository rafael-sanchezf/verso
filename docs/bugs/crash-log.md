# Crash log

A running log of app crashes worth keeping, newest section last. Each entry records what
crashed, the evidence gathered, the cause, and what still has to be done. Raw `.ips` reports
live in `~/Library/Logs/DiagnosticReports/` (not in the repo; the simulator writes them there).

---

## 1. iOS 27 refuses to launch the app: UIScene life cycle not adopted

**Status: fixed, merged 2026-09-16 (PR #22). Was not caused by app code.**
Filed 2026-09-16 after investigating two crash reports; fixed the same day. The fix is in the
"Resolution" section at the end of this entry.

### What happens

The app traps at launch, before any JavaScript runs, on the iPhone 17 simulator running
**iOS 27.0**. Same binary on the **iOS 26.5** simulator launches and renders normally.

```
Exception Type:  EXC_BREAKPOINT (SIGTRAP)
Thread 0 Crashed:
0  UIKitCore  ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke + 712
3  UIKitCore  -[UIApplication workspace:didCreateScene:withTransitionContext:completion:] + 320
...
25 Verso.debug.dylib  static UIApplicationDelegate.main()
```

UIKit evaluates, once per process, whether the app adopted the UIScene life cycle. For a binary
linked against the iOS 27 SDK, "no" is now fatal rather than a logged runtime issue.

### Occurrences

| # | Time (2026-09-16) | pid | Report | Device | What produced it |
|---|---|---|---|---|---|
| 1 | 11:04:40 | 39600 | `Verso-2026-09-16-110506.ips` | iPhone 17, iOS 27.0 (`3D55AC2A…`) | The real one: `expo prebuild` + `expo run:ios` from the `app-shell` worktree (`.claude/worktrees/agent-a6ae598bbf6c0ecca`), native project generated 11:00–11:01. |
| 2 | 11:09:30 | 41646 | `Verso-2026-09-16-110935.ips` | same | A diagnostic probe run while writing this entry, not a second bug: the same build with a minimal `UIApplicationSceneManifest` (`UIApplicationSupportsMultipleScenes` only) patched into the installed bundle. Identical trap, which is the useful result — the bare key is not enough. |

### Evidence gathered

- **The binary links the iOS 27 SDK.** `vtool -show-build …/Verso.app/Verso` → `platform IOSSIMULATOR, minos 16.4, sdk 27.0`.
- **Xcode was upgraded under the project.** `/Applications/Xcode.app` is **Xcode 27.0 (27A266a)**, modified **2026-09-14 18:21**. [dev-toolchain.md](../design/dev-toolchain.md) records Xcode 26.6 on 2026-09-08 and a verified `pnpm ios` launch that day. Nothing in the repo changed the SDK; the machine did. Today's run at 11:00 was the first native build since the upgrade.
- **Nothing in the generated project adopts scenes.** `ios/Verso/Info.plist` has no `UIApplicationSceneManifest`; there is no `SceneDelegate.swift`; `ios/Verso/AppDelegate.swift` still creates its own window in `didFinishLaunchingWithOptions` (`window = UIWindow(frame: UIScreen.main.bounds)`, then `factory.startReactNative(withModuleName:in:launchOptions:)`).
- **The toolchain has no scene support to switch on.** Grepping `UIScene`, `UIWindowScene`, `SceneDelegate` and `UIApplicationSceneManifest` across `expo@57.0.21` (its `ios/`), `@expo/config-plugins@57.0.9` and `react-native@0.86.3` returns nothing. There is no `app.json` knob for it either (`@expo/config-types` has no scene key).
- **`ios/` was not hand-edited.** Every file under `ios/Verso/` carries an 11:00–11:01 prebuild timestamp; nothing was touched between prebuild and the 11:04 launch.
- **The 26.5 control.** The same unmodified `.app` installed on the iOS 26.5 iPhone 17 (`1CD39EA2…`) launched, stayed alive, and rendered the preview gallery against Metro on 8081. So the trap is gated on the iOS **27 runtime**, not merely on the linked SDK.

### Cause

Xcode 27 / the iOS 27 SDK require UIScene life cycle adoption, and Expo SDK 57 + React Native
0.86 have not adopted it. Any locally compiled build of this app therefore dies on launch on an
iOS 27 simulator or device. This is an upstream toolchain gap surfaced by the Xcode upgrade on
2026-09-14; no commit in this repo caused it, and no app code can be edited to avoid it.

### What does NOT fix it

Adding `UIApplicationSceneManifest` through `ios.infoPlist` in `app.json` is the obvious-looking
fix and is a trap. Measured here, on the same build:

- Manifest with `UIApplicationSupportsMultipleScenes` only → still traps (occurrence 2 above).
- Manifest with a `UISceneConfigurations` → `UIWindowSceneSessionRoleApplication` entry and no
  delegate class → the app launches and survives, **and shows a black screen**. Screenshot taken
  at 11:10 on the iOS 27 device: status bar only, no React content. The window built in
  `AppDelegate` is never attached to the `UIWindowScene`, so nothing is presented.

Declaring adoption without implementing it converts a loud crash into a silent blank app. Do not
ship that.

### Resolution (2026-09-16)

Fixed by adopting the scene life cycle through a config plugin (PR #22).

**Expo ships the pieces from SDK 57.0.23** (published 2026-09-15), which adds `ExpoAppSceneDelegate`
(creates the window from the connecting `UIWindowScene`, starts React Native into it, and forwards
scene, URL, Handoff and quick-action events to the app delegate), `SceneEventForwarder`, and the
`ExpoReactNativeFactoryProvider` protocol. Adoption is opt-in: the prebuild template still generates
the app-delegate life cycle, there is no `app.json` key for it, and nothing is documented yet, so the
wiring is ours to do. The `@config-plugins/expo-uiscene-lifecycle` package named in an upstream PR
does not exist on npm; do not go looking for it.

What the branch changes:

- `apps/mobile/package.json` — `expo` from `~57.0.21` to `~57.0.23`.
- `apps/mobile/plugins/with-ios-scene-lifecycle.js` — a local config plugin that, at prebuild time,
  writes `ios/Verso/SceneDelegate.swift` (a subclass of `ExpoAppSceneDelegate`) and adds it to the
  Xcode target, writes the scene manifest into `Info.plist` naming that class, and rewrites the
  generated `AppDelegate` to conform to `ExpoReactNativeFactoryProvider` and to stop building its
  own window. `ios/` is still never edited by hand.
- `apps/mobile/app.json` — registers the plugin.
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` — the bump, plus the release-age exceptions it needs.

The plugin throws at prebuild if the Expo template stops matching its anchors, rather than skipping
the edit. A silent skip would reintroduce the launch crash, or worse, the black screen described
above, and both are much harder to diagnose than a failed prebuild.

**Verified** on a throwaway iPhone 17 simulator created for the test: the app launches on iOS 27.0
and renders (not the black screen the manifest-only route produces), and the same build still
launches and renders on iOS 26.5. Screenshots were taken for both.

**Supply-chain note for review.** `expo@57.0.23` pulls three more packages from the same Expo release
train past the repo's minimum-release-age guard, so `pnpm-workspace.yaml` gains the exceptions
`expo@57.0.23`, `@expo/cli@57.0.25`, `babel-preset-expo@57.0.12` and `@expo/router-server@57.0.10`.
All four were published 2026-09-15 around 16:00 UTC, roughly a day before they were installed here.
That is the trade-off for taking the official fix now rather than waiting for the release to age.

**Remove the plugin** once Expo's own template adopts the scene life cycle; at that point this
becomes dead weight and its anchor check will fail loudly, which is the signal to delete it.

### Repro and verification commands

```bash
# which SDK a build is linked against
vtool -show-build ~/Library/Developer/Xcode/DerivedData/Verso-*/Build/Products/Debug-iphonesimulator/Verso.app/Verso

# runtimes and devices on this machine
xcrun simctl list runtimes
xcrun simctl list devices booted

# install and launch a built app on a specific device, then check it is still alive
xcrun simctl install <udid> <path to Verso.app>
xcrun simctl launch <udid> com.rafasanchez.verso
xcrun simctl spawn <udid> launchctl list | grep verso

# screenshot to catch the black-screen failure mode
xcrun simctl io <udid> screenshot /tmp/shot.png
```

### Housekeeping from the investigation

The probe build (occurrence 2, with the patched Info.plist) was uninstalled from the iOS 27
device afterwards. The clean build installed on the iOS 26.5 device was left in place and works. The two throwaway
simulators created to verify the fix were deleted afterwards.
