import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules', '.next', 'dist'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: {
      react,
      'react-hooks': reactHooks,
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],

      'simple-import-sort/exports': 'error',

      'no-console': 'warn',
      'no-debugger': 'error',

      'react/react-in-jsx-scope': 'off',
      'import/no-unresolved': 'off',
      'simple-import-sort/imports': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },

  prettierConfig,
];
