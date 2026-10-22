# iPhone Duo: research for an Expo SDK 57 / RN 0.86 app with a JS tab bar

Researched 2026-10-21. Apple's DocC pages were read through their JSON endpoints (`developer.apple.com/tutorials/data/<path>.json`), because the HTML pages render client-side. "Undated" means the page shows no date. In that case the date given is the day it was read.

Two local facts used below:
- This Mac runs Xcode 27.1 (27A9275) with the iOS 27.1 simulator runtime (24A94425) installed.
- The simulator device type profile is at `/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone Duo.simdevicetype/Contents/Resources/{profile,capabilities}.plist`. Read 2026-10-21.

---

## 1. Display geometry

### Facts

| | Outer display (closed) | Inner display (open) |
|---|---|---|
| Diagonal | 5.4 in | 7.6 in, folding |
| Panel pixels | 1398 × 2034 at 460 ppi | 1878 × 2670 at 430 ppi |
| Render size, simulator | 1398 × 2034 px, scale 3 | 2007 × 2853 px, scale 3 |
| Points | **466 × 678 pt** portrait, 678 × 466 landscape | **669 × 951 pt** (native orientation 270°) |
| Window size seen by an app, held normally | 466 × 678 | 951 × 669 (wider than tall) |
| App Store screenshot size | 1398 × 2034 and 2034 × 1398 | 2007 × 2853 and 2853 × 2007 |
| Corner radii in the sim profile | 8 pt on the left corners, 59 pt on the right | 55 pt on all four |

Sources for the table:
- **Panel figures:** apple.com spec page. Its footnote gives 7.58 in and 5.36 in when measured as rectangles. https://www.apple.com/iphone-duo/specs/ (read 2026-10-21)
- **Render size:** local simulator `capabilities.plist`. The outer display is `width 1398, height 2034, scale 3, nativeOrientation 0`. The inner display is `width 2007, height 2853, scale 3, nativeOrientation 270`. `ScreenDimensionsCapability` gives main-screen 1398 × 2034 @3x at 460 ppi. Model `iPhone19,4`, `minRuntimeVersion 27.1`.
- **Points:** derived from the render size divided by 3. Apple publishes no point table: the HIG Layout page's change log ends at iPhone 17 (2025-09-09), and its 2026-09-09 entry only says "Updated guidance". https://developer.apple.com/design/human-interface-guidelines/layout
- **Window size seen by an app:** two independent measurements on the simulator report these sizes.
  - react-native-screens issue #4989 (2026-10-19) gives "the cover display (466×678)" and the inner display "(951×669)". https://github.com/software-mansion/react-native-screens/issues/4989
  - react-native-screens #4728 (2026-09-25) mentions "a 951pt window". https://github.com/software-mansion/react-native-screens/issues/4728
- **Inner-display scaling:** the inner display renders at 2007 × 2853 and is downsampled to the 1878 × 2670 panel. This is an inference from the sim profile plus the screenshot spec, the same way the iPhone 6 Plus worked. Apple has not stated it.
- **Screenshot sizes:** App Store Connect. iPhone Duo screenshots "will be required for any app using the iOS 27.1 SDK or later" from April 2027. https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications (read 2026-10-21)
- **Device dimensions:** open, 164.6 mm wide × 117.8 mm tall. Closed, 84.1 mm × 117.8 mm. https://www.apple.com/iphone-duo/specs/
  - The same height in both states is why the HIG says side bars keep "the same vertical height" between the outer display (678 pt tall) and the open inner display (669 pt tall).

### Size classes

Tech talk "Prepare your app for iPhone Duo" (David Jackson). The page is undated, © 2026, and refers to Xcode 27.1. https://developer.apple.com/videos/play/tech-talks/111461/

- **Outer display:** compact width and regular height in portrait. Compact width and compact height in landscape. Quote: "like other iPhone models".
- **Inner display:** "regular horizontal and vertical size classes". The talk does not split this by orientation, and no source lists inner-landscape separately. Treat inner landscape as regular/regular too, but that is not stated per orientation.
- HIG, 2026-09-09: "A compact width layout for the outer display and a regular width layout for the inner display give you the fundamentals for every pose." https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo

### Which pose gets vertical bars

From the HIG "Vertical controls" section (2026-09-09):
- Bars move to the side on the outer display, in both orientations.
- Bars stay on the side on the inner display in landscape.
- The exception is "the inner display in portrait, which has enough vertical space to keep standard horizontal bars".
- Here "portrait" means the open device rotated so the inner display is 669 wide × 951 tall.

### The fold (reserved region)

- When partially open, the fold is an active **division** reserved region. Fully open, it is inactive. Sources: UIView.ReservedRegion (iOS 27.1) https://developer.apple.com/documentation/uikit/uiview/reservedregion and the Prepare doc https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo (undated, read 2026-10-21).
- A region's `frame` "already includes the region's margins". Source: the same UIView.ReservedRegion page.
- "When flat, it's inactive and has a width of zero." Source: tech talk "Strike a pose with adaptive layouts on iPhone Duo". https://developer.apple.com/videos/play/tech-talks/111463/
- **The width of the fold region when active: not found.** No Apple page, talk, or third-party measurement found gives a number. It is meant to be read at runtime.
- The fold can run vertically (book pose, content side by side) or horizontally (laptop/tabletop pose, content above and below). Source: UIView.ReservedRegion.
- Split view controllers re-split 50/50 around the fold. Source: tech talk 111463.

### Camera regions (occlusion)

- The outer front camera is an always-active **occlusion** region in a corner, "vertically aligned with controls on the side".
- The inner under-display camera is an occlusion region that is active only while the camera is in use.
- Sources: HIG Anatomy and Reserved regions sections, and UIView.ReservedRegion.

---

## 2. iOS version, Xcode version, simulator

- **Ship date:** iPhone Duo was announced 2026-09-09. Pre-orders opened 2026-10-16 and it goes on sale **2026-10-23**. https://www.macrumors.com/2026/09/12/iphone-duo-release-date-preorders/ (2026-09-12)
- **iOS version on the device:**
  - The spec page says "iOS 27". https://www.apple.com/iphone-duo/specs/
  - Every Duo API is "introduced in iOS 27.1": UIView.ReservedRegion, `reservedRegions(kind:options:)`, `verticalBarEdge`, `preferredVerticalBarBehavior`, UIVerticalBarBehavior, UIHingeInteraction, and SwiftUI ReservedRegion. See the DocC pages listed under Q1 and Q4.
  - iOS 27.1 is Duo-only. Other iPhones go from 27.0.1 to 27.2. Consomac (2026-10-14) reports iOS 27.1 final as build 24A94232, released 2026-10-13: https://consomac.fr/news-24824-apple-lance-ios-27.1-exclusivement-pour-l-iphone-duo.html
  - Apple's own Releases page lists no iOS 27.1 entry. It lists iOS 27.2 RC (24B115) on 2026-10-19. https://developer.apple.com/news/releases/
- **Xcode:**
  - Xcode 27.1 beta (27A9269) shipped 2026-09-18. Xcode **27.1 final (27A9275)** shipped **2026-10-15**. https://developer.apple.com/news/releases/
  - Release notes: "Xcode 27.1 includes Swift 6.4 and SDKs for iOS 27.1 … requires a Mac running macOS Tahoe 26.6 or later." https://developer.apple.com/documentation/xcode-release-notes/xcode-27_1-release-notes
  - Xcode 27.2 RC (27B48) shipped 2026-10-19.
- **Simulator:**
  - The tech talk says "download Xcode 27.1. Choose the iPhone Duo simulator to run your app in Device Hub." https://developer.apple.com/videos/play/tech-talks/111461/
  - Device type name: **`iPhone Duo`**, identifier **`com.apple.CoreSimulator.SimDeviceType.iPhone-Duo`** (alias `…SimDeviceType.V68`). From local `xcrun simctl list devicetypes` and `profile.plist`.
  - It needs the **iOS 27.1 runtime** (`minRuntimeVersion 27.1`).
- **Device Hub:** Xcode 27 replaced Simulator.app with Device Hub. Expo SDK 58 notes: https://expo.dev/changelog/sdk-58 (2026-10-15).
  - Duo controls are below the bezel: Closed, Partially Open, and Open. Option-drag the slider to fold to any angle. https://developer.apple.com/documentation/xcode/interacting-with-your-app-in-device-hub (undated)
- **Is the simulator in Xcode 26.x? No.** The device type requires runtime 27.1 or later. The Xcode 26.x release notes (26.0 to 26.6) do not mention Duo. Device Hub itself only exists from Xcode 27.
- **Known simulator limits:**
  - In Xcode 27.1: StandBy is unavailable, and most app extensions can't run or be debugged.
  - In Xcode 27.2 RC: screenshots can be black for a few minutes after boot. VoiceOver and Accessibility Inspector "cannot convey screen content on an iPhone Duo within Device Hub". Modifier keys can stop working after a display switch.
  - Sources: https://developer.apple.com/documentation/xcode-release-notes/xcode-27_1-release-notes and https://developer.apple.com/documentation/xcode-release-notes/xcode-27_2-release-notes

---

## 3. Compatibility story

### What an app sees, by build SDK

From tech talk 111461, "Build with the latest SDK":

| Built with | Outer display (closed) | Inner display (open) |
|---|---|---|
| Older than the iOS 27 SDK | "your app will use the screen space to the left of the status bar and camera" | "your app will be a familiar size and aspect ratio", which is boxed rather than full screen |
| iOS 27 SDK | same | "extend[s] to the left of the status bar area on the inner display" |
| iOS 27.1 SDK | "extends to the edge of the screen. Standard navigation and toolbar buttons now lay out vertically under the status bar" | full screen |

The Prepare doc says the same: "When you build with Xcode 26 and earlier, your app doesn't extend under the status bar and camera."

### Scaling, letterboxing, and a compatibility mode

- No named compatibility mode was found.
- Old-SDK apps get the reduced area described in the table. The talk says nothing about how that area is filled, scaled or letterboxed.
- For games, the HIG says: "Prefer changing the aspect ratio over letterboxing or pillarboxing".

### UIRequiresFullScreen

- The tech talk: "iPhone Duo will continue to honor the UIRequiresFullScreen key, but your app will still resize when someone opens or closes their iPhone Duo."
- The key is deprecated as of iOS 26. https://developer.apple.com/documentation/bundleresources/information-property-list/uirequiresfullscreen
- Expo SDK 58: "On iOS 27, requireFullScreen no longer opts your app out of resizing, and ScreenOrientation.lockAsync may have no effect while the app is resizable." https://expo.dev/changelog/sdk-58

### Portrait lock

Apple's talk says two things that do not fully agree:
1. "Interface orientation on the inner display behaves differently. The inner display doesn't honor your supported interface orientations."
2. "iPhone Duo respects your supported interface orientations, but your app will scale on the inner display, including in Split View multitasking."

Read together: on the outer display a portrait lock works like any iPhone. On the inner display the app is not rotated to match the lock. It is scaled or resized into whatever space it has, including Split View.

Expo's docs agree that locks become preferences: "While an app is resizable, the system treats a supported orientation as a preference rather than a requirement … lockAsync may have no effect." https://docs.expo.dev/versions/v58.0.0/sdk/screen-orientation/#orientation-locks-on-ios-27-and-later

### Multitasking

- "All apps participate in multitasking on iPhone Duo, where two apps can be placed in a side-by-side layout."
- New windows cannot be created on the outer display.
- Source: tech talk "Leverage multiple displays and scenes on iPhone Duo". https://developer.apple.com/videos/play/tech-talks/111464/

### Opting into native Duo layout

1. **Build with Xcode 27.1 and the iOS 27.1 SDK.** The tech talk says "To get the full-screen experience, download Xcode 27.1." Tech talk "Raise the bar": "To opt your app into the new bar behavior … First, rebuild your app against the latest SDKs." https://developer.apple.com/videos/play/tech-talks/111462/
2. **Adopt the UIScene life cycle (required).** iOS 27 release notes: "Apps built with the latest SDK must adopt the scene-based life cycle or they fail to launch." https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
   - React Native 0.88.0-rc crashes on the Duo with `UIScene life cycle is required for apps built with this SDK`. https://github.com/react/react-native/issues/58606 (2026-09-19, closed 2026-10-16)
   - RN 0.87 and earlier crash at launch when built with Xcode 27. The fix is only in 0.88 and won't be backported. https://github.com/react/react-native/issues/58545 (closed 2026-10-16)
3. **Include a launch screen.** iOS 27 SDK apps must have one of `UILaunchStoryboardName`, `UILaunchStoryboards`, `UILaunchScreen` or `UILaunchScreens`. Same iOS 27 release notes.
4. **Info.plist keys, all-orientations flag, supportsTablet:**
   - No Duo-specific Info.plist key was found.
   - No requirement to support all orientations was found.
   - The Duo is an iPhone. The talk says "Your app may react to different size class boundaries, but it is still an iPhone app." `supportsTablet` (iPad) is not involved.
   - A third-party write-up claims the open Duo reports the iPad idiom. This contradicts Apple's wording and is unverified (see Q6).
5. **App Store:** Duo screenshots are required from April 2027 for apps built with the iOS 27.1 SDK. Submitting them adds an "optimized for iPhone Duo" badge.

### What Apple means by "built to resize"

HIG, Best practices (2026-09-09): "Build your app to resize. Because the device has two displays and supports a wide range of poses and Split View multitasking, your app can appear at many different sizes. Use size classes, layout margins, and safe area insets to lay out controls and content. Avoid fixed widths and display-specific dependencies."

The Prepare doc adds:
- "Size your views relative to their container rather than to fixed iPhone dimensions."
- "Make layout calculations based on your scene or containing view's bounds rather than screen dimensions."
- "Don't use userInterfaceIdiom or UIInterfaceOrientation for layout decisions."

The talk adds: don't reference `UIScreen.main`. "It's ambiguous and will be deprecated." Xcode 27.1 ships an "App Resizability" agent skill. Resizing is tied to the iOS 27 SDK:
- Xcode 27 notes call resize mode for apps linked against iOS 26 or earlier "unsupported". https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes
- Expo: "iOS 27 … makes iPhone apps resizable, and apps built with the iOS 27 SDK get both automatically."

---

## 4. The side bar, safe areas, reserved regions

### UITabBarController

- **Yes, it goes vertical automatically.** The talk says "SwiftUI's TabView and UIKit's UITabBarController also adapt to all poses. By default, tabs will appear on the inner and outer display, laying out vertically when appropriate."
- On the inner display you can opt into a sidebar with `tabBarController.sidebar.preferredPlacement = .sidebar`.
- The HIG says the same: "If you use standard system components, you receive this layout automatically."

### A custom JS-drawn tab bar

- **It gets nothing for free.** The Prepare doc: set items on system containers "instead of creating a custom bar for your view based on UIToolbar, UINavigationBar, or UITabBar".
- "Raise the bar" talk: "When used to build custom bars, content from sub-components like UIToolbar, UINavigationBar, or UITabBar won't be considered."
- A React Native `View` row is not even a UITabBar, so the system never moves it.
- For custom bars, an Apple Frameworks Engineer points to:
  - the `verticalBarEdge` trait (UIKit) or `toolbarVerticalEdge` (SwiftUI)
  - `UIView.LayoutRegion.bar(onEdge:extent:)` with `layoutGuide(for:)`
  - SwiftUI `safeAreaBar`
- An Apple Technology Evangelist warns that custom bars must reimplement the long-press label expansion and the Large Content Viewer at accessibility text sizes. https://developer.apple.com/forums/thread/847835 (about 4 weeks before 2026-10-21)

### Safe area behavior

- **Apple:** "Navigation bars, toolbars, and tab bars lay out outside the safe area … Horizontal bars provide top and bottom insets, while vertical bars provide leading and trailing insets." Also: "safe areas are often asymmetric … vertical buttons can appear on the left side in landscape and Split View multitasking." Source: tech talk 111461.
- **`preferredVerticalBarBehavior` doc:** when the configuration changes, "the status bar changes axis and the leading or trailing safe area inset for the vertical bar is added or removed". https://developer.apple.com/documentation/uikit/uiviewcontroller/preferredverticalbarbehavior (iOS 27.1)
- **The status bar and Dynamic Island are in the side column too.** HIG: "Controls on the side include both system and app elements: the Dynamic Island, the status bar, the toolbar (including navigation buttons), and the tab bar."
- **Measured insets with no UIKit bars at all.** A Flutter host, which is the closest analogue to an RN root view, measured these on the iPhone Duo simulator, iOS 27.1. Third-party, adaptive_platform_ui PR #169, merged 2026-10-08. https://github.com/berkaycatak/adaptive_platform_ui/pull/169

  | Window | Safe-area insets | `verticalBarEdge` |
  |---|---|---|
  | Outer display (folded), portrait and landscape | right 84, bottom 34, **top 0** | trailing |
  | Inner, full screen, landscape (both rotations) | right 84, bottom 34 | trailing |
  | Inner, full screen, portrait | top 82, bottom 34 | unspecified |
  | Split View, right pane | right 84, bottom 34 | trailing |
  | Split View, left pane | bottom 34 only | leading |

  The PR's reading: "UIKit only adds the vertical bar's inset for bars it draws itself (navigation and tab bar controllers) … The right pane gets an inset only because it touches the hardware strip."
- **So does the trailing inset grow? Yes.** The 84 pt trailing inset appears whenever the window touches the hardware strip (status bar, Dynamic Island, camera column), even with no native bar. Otherwise it appears only when a UIKit bar is vertical.
- **The insets are not stable.** Another library found that a table of these values, measured on the simulator, put controls in the wrong place on hardware. https://github.com/sdegenaar/liquid_glass_widgets/issues/404
- **Apple publishes no inset numbers.**

### ReservedRegion from React Native

Nothing is in RN core or Expo SDK 57. Third-party options:

- **`react-native-reserved-regions`** by App&Flow, the maintainers of react-native-safe-area-context. v0.1.0 shipped 2026-09-22 and v0.2.0 on 2026-09-23.
  - It provides `ReservedRegionsProvider` and `useReservedRegions()`, giving division and occlusion frames in points relative to the provider.
  - Requires the New Architecture and the iOS 27.1 SDK and runtime. Older ones return `[]`.
  - The README says the example app uses RN 0.88-rc. https://github.com/appandflow/react-native-reserved-regions
- **`@jusev/react-native-fold`** provides `useFoldSignals()`: fold axis, halves, `chromeSide`, and `railReserve`.
  - It has 1 star and no commits since 2026-09-24, and was simulator-only. https://github.com/jusev/react-native-fold
- **Expo SDK 58**, not SDK 57, adds:
  - `ArrangementView` in Expo UI
  - a new `expo-hinge` package (`useHinge`, `getHinge`, `addHingeListener`) on iOS 27.1+, for hinge state rather than regions
  - Source: https://expo.dev/changelog/sdk-58 (2026-10-15)
- **A vertical-bar-edge trait bridge for RN: not found.** The Flutter equivalent exists in adaptive_platform_ui PR #169.

---

## 5. React Native and Expo support status

### Official statements

- **Meta / React Native:** no Duo-specific statement found.
  - RN 0.88.0 (2026-10-15) adds "SceneDelegate lifecycle support" and "Refresh `DeviceInfo` constants after interface dimension changes". https://github.com/react/react-native/releases/tag/v0.88.0
  - A maintainer (cipolleschi, 2026-10-16) said the scene work had to "fix how Dimension reports the window size. With SceneDelegate, scenes do not have fixed dimensions", and can't be backported below 0.88. https://github.com/react/react-native/issues/58545
- **Expo:** yes, the SDK 58 post (2026-10-15) says "Apps built with SDK 58 are ready for iPhone Duo on the day it is released." It also says:
  - Use Expo Router's `Stack` and `NativeTabs`, which "use the system's own navigation and tab bars, which iOS places for you on both displays".
  - "you may need to add `<SafeAreaView>` in more places, such as inside scrollviews, to handle horizontal insets for iPhone Duo. Update react-native-safe-area-context to the latest version."
  - Source: https://expo.dev/changelog/sdk-58
- **SDK 57 path:**
  - `expo@57.0.23` or newer plus `expo-build-properties` `ios.enableSceneSupport: true` adopts the scene life cycle so an SDK 57 app can be built with Xcode 27. https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/ and https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27
  - Changelog entry: https://expo.dev/changelog/sdk-57 (2026-06-30, updated later)
  - The guide also notes "React Native core has not adopted the scene life cycle, so Expo provides the scene infrastructure". This was before RN 0.88.
- **EAS Build images:**
  - `sdk-57` resolves to `macos-tahoe-26.5-xcode-26.6`, the iOS 26 SDK.
  - `latest` and `sdk-58` resolve to `macos-tahoe-26.6-xcode-27.1`.
  - Expo: "Apps built on Xcode 27 images, including latest, launch on iOS 27 only if they use the UIKit scene life cycle."
  - Source: https://docs.expo.dev/build-reference/infrastructure/ (read 2026-10-21)

### NativeTabs (UITabBarController)

- Apple and Expo both say it goes vertical automatically.
- Expo's NativeTabs doc page does not mention the Duo. It only notes the bar can sit "on the side of the screen when running on Apple Vision Pro". https://docs.expo.dev/router/advanced/native-tabs/
  - `expo-router/native-tabs` is the SDK 58 name. SDK 54 to 57 use `expo-router/unstable-native-tabs`.
- **Known bug:** cold-launching unfolded shows no side-rail tab bar.
  - Cause: screens attaches the controller at 466 × 678 and then resizes it to 951 × 669 with no size-class change.
  - Fixed by PR #4990, merged 2026-10-21. That is after screens 4.30.0, so not yet in a release. https://github.com/software-mansion/react-native-screens/issues/4989 and https://github.com/software-mansion/react-native-screens/pull/4990
- `tabBarSidebarPreferredPlacement` (iOS 27) arrived in screens **4.29.0** (2026-10-09). `prominentScreenKey` arrived in **4.30.0** (2026-10-13). https://github.com/software-mansion/react-native-screens/releases/tag/4.30.0

### react-native-screens native-stack issues on the Duo

1. **4.30.0** (2026-10-13), "This release focuses on iOS 27 and iPhone Duo support in Stack v4":
   - With opaque headers, "On iPhone Duo (iOS 27) … The screen ended up partially under the header", plus `Pressable` bugs.
   - The fix lays screens out under the bar and insets them through the safe area.
   - Screens recommends transparent headers on iOS 26+.
2. **#4953 / #4956** (closed 2026-10-18): an opaque header leaves a strip of screen colour above the bar on the outer display. Apple declined to treat this as a bug on the forums.
3. **#4770** (open PR): `backButtonMenuEnabled: false` is ignored when the back button is drawn in the floating side bar.
4. **#4858** (open): a split column hosting a native stack shows two back buttons that overlap in the vertical bar.
5. **#4769** (open): formSheet with a native header. The ScrollView overflows by about 74 pt on the Duo too.
6. **#4728** (closed): TabsBottomAccessory width is nondeterministic at regular width.

Related Expo issues:
- expo/expo #51297 (closed): `@expo/ui` BottomSheet content clipped on the Duo.
- expo/expo #50934 (open): the dev-menu floating Tools button forces the status bar vertical and overrides `preferredVerticalBarBehavior`. Dev builds only.

### useWindowDimensions on fold

- **RN 0.86: not found / unverified.** No issue, test or document confirms that `Dimensions` "change" events fire on fold or unfold under the SDK 57 scene opt-in.
- RN 0.88's release notes and the maintainer comment above imply window-size reporting under scenes needed fixing in 0.88.
- One related bug: after `Updates.reloadAsync()` on iOS, `useWindowDimensions()` lags one change behind until relaunch. expo/expo #52004 (open, 2026-10-21) https://github.com/expo/expo/issues/52004
- Safer signals are root `onLayout` and safe-area-context frame and insets, which are layout-driven.
- Separately, `StatusBar.setBarStyle` and `setHidden` are no-ops on iOS 27. RN #58758 (open) https://github.com/react/react-native/issues/58758

### UIArrangementViewController / NavigationSplitView wrappers

- Expo UI (SDK 58) wraps the SwiftUI **`ArrangementView`**.
- Expo Router has a `SplitView` built on screens' split, which is what #4858 uses.
- No RN wrapper for UIKit `UIArrangementViewController` was found.
- No NavigationSplitView wrapper beyond expo-router `SplitView` and screens Split was found.

---

## 6. Practical write-ups

- **No write-up was found from a well-known React Native or Flutter app** (big-company engineering blog).
- **OdoKeep** (small Expo app, 2026-10-18): https://www.odokeep.com/blog/iphone-duo-react-native-fold
  - Patched react-native-screens' tab controller with `traitOverrides` to force a compact horizontal size class on iPhones, so the open Duo draws the phone tab bar as a side rail.
  - Forced a one-time size-class transition to survive the unfolded cold launch, the same bug as #4989.
  - Fixed toasts that "computed their own horizontal insets and ran under the rail".
  - Bridged the fold division region to a `useFold()` hook.
  - It claims "Open, the Duo reports the iPad idiom … Platform.isPad is true". **This conflicts with Apple's "it is still an iPhone app" and is unverified.** Check it on the simulator before relying on `Platform.isPad`.
- **Flutter adaptive_platform_ui** (PR #169, merged 2026-10-08):
  - Measured the inset table in Q4.
  - Streams `verticalBarEdge` through a native channel.
  - Injects an 84 pt strip into `MediaQuery` where UIKit wants a bar but reserved no inset (the left Split View pane).
- **Flutter core:** fold, bar and reserved-region support are open issues only: #192515 (displayFeatures), #193035, #193038, #193060. https://github.com/flutter/flutter/issues/192515
- **react-native-true-sheet:** a `foldOptions` PR #939 for tabletop. https://github.com/lodev09/react-native-true-sheet/pull/939
- Other results (paddyb.com, ingenioustechlab, iphoneduosupport.com, effectussoftware) are generic guides, some AI-written, and add nothing first-hand.

---

## What this means for a React Native app with a JS tab bar

This app today: `expo ~57.0.23`, RN 0.86.3, screens ~4.26, safe-area-context ~5.7, `orientation: portrait`, `supportsTablet: false`. `eas.json` sets no `image`, so builds use `auto`, which is `sdk-57`, Xcode 26.6 and the iOS 26 SDK.

1. **Today's build already runs on the Duo, in a reduced box.** Closed, it uses the space left of the status bar and camera column. Open, it shows at a "familiar size and aspect ratio". Nothing crashes, and there is nothing to do before 2026-10-23 unless we want the full screen.
2. **Getting the full screen is a toolchain move.** It needs Xcode 27.1 with the iOS 27.1 SDK and the UIScene life cycle. On SDK 57 that means `ios.enableSceneSupport: true` in expo-build-properties (our expo 57.0.23 meets the minimum), plus a pinned Xcode 27.1 EAS image. Alternatively, upgrade to SDK 58 / RN 0.88, which does both by default and fixes Dimensions under scenes. Building on Xcode 27 without scenes crashes at launch.
3. **Our JS tab bar will never move to the side by itself.** UIKit only moves UITabBar, UINavigationBar and UIToolbar owned by system containers. On the outer display and open in landscape, we must draw the bar on the side ourselves, or switch to NativeTabs, which UIKit lays out vertically for free.
4. **Expect a trailing inset of about 84 pt and a top inset of 0** on the outer display and open in landscape. This comes from the status bar, Dynamic Island and camera column. Open in portrait it flips to top about 82 pt. Every layout that pads with `insets.top`, or assumes left equals right, must read each edge separately. The numbers are third-party simulator readings, so read insets at runtime and never hard-code them.
5. **If we keep the JS bar, put it on the inset edge.** On the outer display it belongs inside that 84 pt trailing column under the status glyphs. Knowing when to go vertical needs the `verticalBarEdge` trait. RN doesn't expose it, so it takes a small native module or reading it off insets (a zero top inset with a large side inset). The left Split View pane gets no inset at all.
6. **Treat NativeTabs as a real option.** If we switch, use screens 4.30 or later. Until a release includes PR #4990, an unfolded cold launch can show no tab bar. Our 4.26 predates all the Duo work in 4.29 and 4.30.
7. **The portrait lock is weaker than it looks.** On the inner display iOS will not rotate the app to honor it. It scales or resizes us, including in Split View. Every screen must survive 466×678, 678×466, 951×669, 669×951 and half-width Split View sizes. Size by window and size class, never `Platform.isPad` or orientation.
8. **The fold matters only for half-folded poses.** Full-width JS layouts can put a button on the crease. The fold width is unpublished, so read it with `react-native-reserved-regions` (App&Flow, New Arch, iOS 27.1). It is young, about a month old, and was tested on RN 0.88-rc. The alternative is to accept the crease for V0.
9. **Don't trust `useWindowDimensions` to update on fold under RN 0.86 until we test it.** Prefer root `onLayout` and safe-area-context frames, and verify on the Duo simulator with Closed, Partially Open and Open plus rotation.
10. **There is no Expo SDK 57 or React Native "Duo support" to wait for.** The supported path is SDK 58, released 2026-10-15. Duo screenshots become mandatory in App Store Connect in April 2027, but only once we ship with the iOS 27.1 SDK.
