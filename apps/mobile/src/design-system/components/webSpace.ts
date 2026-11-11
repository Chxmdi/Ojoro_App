import { Platform } from 'react-native';

/**
 * A trailing space for a block of text that sits above or beside another, on the web only.
 * React Native Web renders each `Text` as its own block with no whitespace between them, so a
 * row's visible text runs together ("Football tonight6 / 8") and no longer matches its label
 * (axe label-content-name-mismatch); screen readers also read the words as one. The space is
 * invisible at the end of a block. Native lays text out itself and needs none.
 */
export const WEB_SPACE = Platform.OS === 'web' ? ' ' : null;
