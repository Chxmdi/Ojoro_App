// The admin tool's lint: the repo config plus the React hooks rules (ESLint looks up the nearest
// config from each file, so `pnpm lint` at the root uses this for apps/web).
import reactHooks from 'eslint-plugin-react-hooks';

import root from '../../eslint.config.mjs';

export default [
  ...root,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Playwright end-to-end script: Node, plus browser globals inside page.evaluate callbacks.
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        setTimeout: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        Event: 'readonly',
      },
    },
  },
];
