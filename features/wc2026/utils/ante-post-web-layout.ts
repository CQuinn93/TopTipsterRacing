import { Platform, useWindowDimensions, type TextStyle } from 'react-native';

/** Max content width for ante-post screens on web (group + knockout). */
export const ANTE_POST_WEB_MAX_WIDTH = 1100;

/** Two-column match cards from this width (web only). */
export const ANTE_POST_WEB_GRID_MIN = 768;

/** Three-column match cards from this width (web only). */
export const ANTE_POST_WEB_3COL_MIN = 1100;

/** Single knockout / final card cap on wide web. */
export const ANTE_POST_WEB_SINGLE_CARD_MAX = 560;

export function useAntePostWebLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWebGrid = isWeb && width >= ANTE_POST_WEB_GRID_MIN;
  const isWeb3Col = isWeb && width >= ANTE_POST_WEB_3COL_MIN;
  const gridCardWidth = isWeb3Col ? '31.5%' : isWebGrid ? '48%' : '100%';

  return {
    isWeb,
    isWebGrid,
    isWeb3Col,
    gridCardWidth,
    contentMaxWidth: ANTE_POST_WEB_MAX_WIDTH,
  };
}

/** Centred numeric score fields (group stage shells + knockout inputs on web). */
export const antePostScoreFieldPlatformStyle = Platform.select<TextStyle | undefined>({
  android: { textAlignVertical: 'center', includeFontPadding: false },
  ios: {},
  web: {
    outlineStyle: 'none',
    textAlign: 'center',
    width: '100%',
    height: '100%',
    margin: 0,
    paddingLeft: 0,
    paddingRight: 0,
    boxSizing: 'border-box',
  } as unknown as TextStyle,
  default: {},
});
