const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-plugin-prettier');
const promisePlugin = require('eslint-plugin-promise');
const globals = require('globals');

module.exports = [
  // Recommended base configurations
  js.configs.recommended,
  prettierConfig,

  // Main configuration
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    plugins: {
      prettier,
      import: importPlugin,
      promise: promisePlugin,
    },
    rules: {
      // Error prevention
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log', 'info'] }],
      'no-debugger': 'warn',
      'no-duplicate-imports': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-use-before-define': ['error', { functions: false }],

      // Best practices
      'prefer-const': 'error',
      'no-const-assign': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'no-return-await': 'off',
      'require-await': 'warn',

      // Import rules
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-unresolved': 'error',
      'import/no-duplicates': 'error',
      'import/no-commonjs': 'off',
      'import/no-dynamic-require': 'off',

      // Promise rules
      'promise/always-return': 'off',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-native': 'off',
      'promise/no-callback-in-promise': 'warn',
      'promise/no-promise-in-callback': 'warn',
      'promise/no-nesting': 'warn',

      // Prettier rules
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 100,
          tabWidth: 2,
          semi: true,
          bracketSpacing: true,
          arrowParens: 'avoid',
          endOfLine: 'lf',
        },
      ],
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  },

  // Test files override
  {
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', '*.min.js'],
  },
];
