/**
 * A platform as its brand mark.
 *
 * Rule 31 (Rafa, 2026-09-16): on the game page a platform is a glyph, not a
 * word. "Nintendo Switch 2" spelled out is most of a line for one chip, and
 * everybody already knows the PlayStation shapes and the Switch. The words come
 * back wherever a reader is choosing from a list — the platforms sheet, the
 * Ranking filter — and every glyph carries its full name as its accessibility
 * label, so nothing is lost to a screen reader.
 *
 * Which mark a name gets, and when a mark needs a suffix to tell it from its
 * sibling, is decided in `@/lib/format` (`platformGlyph`, `platformGlyphs`),
 * where it is unit tested. This file only draws.
 *
 * The art: the eight `d` strings below are copied verbatim from Simple Icons
 * v16.31.0 (https://simpleicons.org, files `icons/<slug>.svg`), which is
 * CC0-1.0 — public domain, no attribution required, though it is given here
 * anyway. Each is a single path on a 24x24 viewBox. They are inlined rather
 * than added as a dependency for the reason `marks.tsx` gives: importing `.svg`
 * files needs a Metro transformer the styling layer already fights with, and
 * eight paths is not a dependency's worth of art. The brands are each other's
 * trademarks; they are used here only to label the platform they belong to.
 */

import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { platformGlyph, type PlatformGlyphName } from '@/lib/format';

import { Icon } from './icon';
import { Text } from './text';
import { useTheme, type ColorToken } from './theme';

/** Simple Icons v16.31.0, CC0-1.0. Slug per key; 24x24, one path each. */
const GLYPH_PATHS: Readonly<Record<PlatformGlyphName, string>> = {
  // icons/playstation.svg
  playstation: 'M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z',
  // icons/xbox.svg
  xbox: 'M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z',
  // icons/nintendoswitch.svg
  switch: 'M14.176 24h3.674c3.376 0 6.15-2.774 6.15-6.15V6.15C24 2.775 21.226 0 17.85 0H14.1c-.074 0-.15.074-.15.15v23.7c-.001.076.075.15.226.15zm4.574-13.199c1.351 0 2.399 1.125 2.399 2.398 0 1.352-1.125 2.4-2.399 2.4-1.35 0-2.4-1.049-2.4-2.4-.075-1.349 1.05-2.398 2.4-2.398zM11.4 0H6.15C2.775 0 0 2.775 0 6.15v11.7C0 21.226 2.775 24 6.15 24h5.25c.074 0 .15-.074.15-.149V.15c.001-.076-.075-.15-.15-.15zM9.676 22.051H6.15c-2.326 0-4.201-1.875-4.201-4.201V6.15c0-2.326 1.875-4.201 4.201-4.201H9.6l.076 20.102zM3.75 7.199c0 1.275.975 2.25 2.25 2.25s2.25-.975 2.25-2.25c0-1.273-.975-2.25-2.25-2.25s-2.25.977-2.25 2.25z',
  // icons/nintendo.svg — the wordmark, for the Nintendo hardware that is not a Switch.
  nintendo: 'm4.447 12.546-1.202-1.942h-.864v2.793h.864v-1.942l1.202 1.942h.856v-2.793H4.44l.007 1.942Zm6.828-1.001v-.279h-.451v-.376h-.841v.376h-.458v.279h.458v1.852h.841v-1.852h.451Zm-5.491 1.844h.834v-1.852h-.834v1.852Zm0-2.213h.841v-.572h-.841v.572Zm14.663.233c-.676 0-1.224.467-1.224 1.039 0 .572.548 1.039 1.224 1.039.676 0 1.225-.467 1.225-1.039 0-.572-.549-1.039-1.225-1.039Zm.338 1.431c0 .293-.173.414-.338.414-.165 0-.346-.121-.346-.414v-.783c0-.294.173-.414.346-.414.165 0 .338.12.338.414v.783Zm-2.659-1.212a1.093 1.093 0 0 0-.473-.166c-.601-.053-1.067.482-1.067.971 0 .648.496.881.571.919.285.128.646.135.961-.068v.105h.827v-2.785h-.827c.008 0 .008.595.008 1.024Zm.008.828v.331c0 .286-.196.361-.331.361s-.331-.075-.331-.361v-.662c0-.287.196-.362.331-.362.128 0 .33.075.33.362v.331h.001Zm-9.556-1.001a1.02 1.02 0 0 0-.668.278v-.196h-.834v1.852h.834V12.17c0-.158.172-.339.398-.339.225 0 .383.181.383.339v1.219h.834v-1.008c0-.731-.631-.942-.947-.926Zm6.798 0a1.01 1.01 0 0 0-.668.278v-.196h-.834v1.852h.834V12.17c0-.158.173-.339.398-.339.225 0 .383.181.383.339v1.219h.834v-1.008c0-.731-.631-.942-.947-.926Zm-1.75 1.016c0-.572-.556-1.054-1.232-1.054-.683 0-1.232.467-1.232 1.039 0 .572.549 1.039 1.232 1.039.564 0 1.044-.324 1.187-.76h-.834v.112c0 .339-.225.414-.345.414-.128 0-.353-.075-.353-.413v-.385l1.577.008Zm-1.517-.655a.346.346 0 0 1 .293-.166c.112 0 .225.053.293.166.052.09.052.203.052.361h-.698c0-.158.007-.263.06-.361Zm9.893-.866c0-.09-.068-.135-.203-.135h-.188v.474h.113v-.196h.06l.09.196h.128l-.105-.211c.067-.022.105-.068.105-.128Zm-.218.068h-.06v-.136h.052c.068 0 .105.023.105.068 0 .053-.029.068-.097.068Zm.007-.392a.433.433 0 0 0-.428.43c0 .233.196.429.429.429a.429.429 0 0 0 0-.859h-.001Zm0 .776a.35.35 0 0 1-.345-.346.35.35 0 0 1 .346-.347.35.35 0 0 1 .345.347.35.35 0 0 1-.345.346h-.001Zm-.938-2.364H3.132C1.254 9.03 0 10.386 0 12.004s1.254 2.959 3.14 2.959h17.72c1.886 0 3.14-1.34 3.14-2.959-.007-1.618-1.269-2.966-3.147-2.966Zm-.008 5.202H3.14c-1.495.008-2.404-1.001-2.404-2.236 0-1.235.917-2.228 2.404-2.236h17.705c1.487 0 2.404 1.001 2.404 2.236 0 1.235-.909 2.236-2.404 2.236Z',
  // icons/windows.svg — IGDB's `PC (Microsoft Windows)` is Windows, so it gets the flag.
  windows: 'M0,0H11.377V11.372H0ZM12.623,0H24V11.372H12.623ZM0,12.623H11.377V24H0Zm12.623,0H24V24H12.623',
  // icons/apple.svg — Mac and iOS both.
  apple: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
  // icons/linux.svg
  linux: 'M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z',
  // icons/android.svg
  android: 'M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z',
};

/**
 * The box a mark is drawn in, where the square one the file ships is wrong.
 *
 * Only Nintendo's, which is a wordmark: inside its 24x24 it is 24 wide and 6
 * tall, so drawn square at 16pt it is a 4pt sliver floating in the middle of a
 * chip, which reads as a rendering fault rather than a logo. Cropped to the
 * wordmark and given a box the shape of one, it is small but legible, which is
 * all a wordmark in a chip has to be. The numbers are multipliers on `size`.
 */
const GLYPH_BOXES: Partial<Record<PlatformGlyphName, { viewBox: string; width: number; height: number }>> = {
  nintendo: { viewBox: '0 9 24 6', width: 2.4, height: 0.6 },
};

const SQUARE = { viewBox: '0 0 24 24', width: 1, height: 1 };

export interface PlatformIconProps {
  /** The catalog's own platform name, e.g. `PlayStation 5`. Also the label. */
  name: string;
  /**
   * `4`, `X|S`, `Mac`: what tells this mark from an identical one beside it.
   * Comes from `platformGlyphs(namesOnThisGame)`; empty when it is the only
   * platform drawing this mark, which is the common case.
   */
  suffix?: string;
  /** The glyph's box, in points. 16 sits right beside 13 and 14pt text. */
  size?: number;
  /** The mark is filled with this, and so is the suffix. */
  color?: ColorToken;
  /**
   * The mark and nothing else: no suffix, and no short name beside the gamepad
   * of a platform with no mark. For a caller that writes the platform's name
   * next to it itself, the Ranking filter's sheet and chip, where the mark
   * plus its own words would say the name twice.
   */
  markOnly?: boolean;
}

/**
 * The mark, plus a suffix when the list it came from needed one.
 *
 * A platform with no mark — Sega, a Quest, a Sharp X68000 — draws a gamepad and
 * its short name instead. Rule 9: no logo is better than the wrong logo, and
 * the name is still the truth about what it is.
 */
export function PlatformIcon({
  name,
  suffix = '',
  size = 16,
  color = 'text/primary',
  markOnly = false,
}: PlatformIconProps) {
  const theme = useTheme();
  const { glyph, shortName } = platformGlyph(name);
  const box = (glyph && GLYPH_BOXES[glyph]) || SQUARE;

  return (
    <View style={[styles.icon, { gap: theme.space[1] }]} accessibilityLabel={name}>
      {glyph ? (
        <Svg width={size * box.width} height={size * box.height} viewBox={box.viewBox}>
          <Path d={GLYPH_PATHS[glyph]} fill={theme.colors[color]} />
        </Svg>
      ) : (
        <Icon name="gamepad-2" size={size} color={color} />
      )}

      {/*
        One line each, always: `Wii U` and `Xbox Series X|S` both have a space
        in them, and a suffix that wraps turns a 28pt chip into a 40pt one.
      */}
      {markOnly ? null : glyph === null ? (
        // The chip label a worded chip would have had, at the size chips use.
        <Text size={13} weight={500} color={color} numberOfLines={1}>
          {shortName}
        </Text>
      ) : suffix ? (
        <Text size={11} weight={600} color={color} numberOfLines={1}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

export interface PlatformChipProps {
  name: string;
  suffix?: string;
  /** Played draws the check and the brand-colored border, exactly as `Chip` played does. */
  played?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The game page's platform chip: `Chip`'s played and surface variants with a
 * mark where the label would be.
 *
 * Not a fifth `Chip` variant because `Chip` takes a `label: string` and this
 * one's label is a drawing — and `src/ui/chip.tsx` belongs to the shell, which
 * five other screens are editing this week. The styling below is `Chip`'s,
 * value for value (pill radius, `space[3]` sides, 6pt vertical, the 1.5px
 * `brand/text` border and 14pt check of the played variant), so the two read
 * as one chip; the single addition is a transparent border on the unplayed one,
 * because a row of these is toggled a chip at a time and `Chip` would let the
 * row grow 3pt every time one of them gained a border. If a second screen needs
 * this chip, it is the thing to promote into `src/ui/chip.tsx`.
 *
 * Where the game was played is its own fact (decision 19), so the check is the
 * whole statement: the mark and the check are both `brand/text` when played
 * there, `text/primary` when not, and the fill never changes.
 */
export function PlatformChip({ name, suffix, played = false, onPress, style }: PlatformChipProps) {
  const theme = useTheme();

  const chipStyle = [
    styles.chip,
    {
      backgroundColor: theme.colors['bg/surface'],
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.space[3],
      paddingVertical: 6,
      gap: theme.space[1] + 2,
    },
    played ? { borderWidth: 1.5, borderColor: theme.colors['brand/text'] } : null,
    style,
  ];

  const content = (
    <>
      {played ? <Icon name="check" size={14} color="brand/text" /> : null}
      <PlatformIcon name={name} suffix={suffix} color={played ? 'brand/text' : 'text/primary'} />
    </>
  );

  if (!onPress) return <View style={chipStyle}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: played }}
      onPress={onPress}
      style={({ pressed }) => [chipStyle, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    // An unplayed chip has no border, so it would sit 1.5pt shorter than the one
    // beside it; the row would jitter every time a chip was tapped.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
});
