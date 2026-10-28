import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Globals provided by the React Native / Metro runtime. */
const reactNativeGlobals = {
  __DEV__: 'readonly',
  process: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
};

/** Globals for Node-run config files and scripts (CommonJS). */
const nodeCommonJsGlobals = {
  require: 'readonly',
  module: 'writable',
  __dirname: 'readonly',
  process: 'readonly',
  console: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/node_modules/**',
      'design-handoff/**',
      'packages/design-tokens/src/generated/**',
      'apps/mobile/.rnstorybook/storybook.requires.ts',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // TypeScript already reports undefined identifiers, with type information.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: {
      globals: reactNativeGlobals,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Metro / Babel / Expo config files are CommonJS run by Node.
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: nodeCommonJsGlobals,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
);
