import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores first - these apply to all configurations
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.output/',
      '.wxt/',
      'logs/',
      '*.log',
      '.cache/',
      '.temp/',
      '.idea/',
      '.DS_Store',
      'Thumbs.db',
      '*.zip',
      '*.tar.gz',
      'stats.html',
      'stats-*.json',
      'pnpm-lock.yaml',
      '**/workers/**',
      'app/**/workers/**',
      'packages/**/workers/**',
      'test-inject-script.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Global rule adjustments
  {
    // Allow intentionally empty catch blocks (common in extension code),
    // while keeping other empty blocks reported.
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['app/**/*.{js,jsx,ts,tsx}', 'packages/**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/workers/**'], // Additional ignores for this specific config
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // Root tooling scripts (size gate, quality gate).
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // Strict settings for code written under the quality gate (see CLAUDE.md).
    // Add new modules here; older code keeps the relaxed block above.
    files: [
      'scripts/**/*.mjs',
      'app/native-server/src/instances/**/*.ts',
      'app/native-server/src/mcp/browser-hub/**/*.ts',
      'app/native-server/src/scripts/allowed-origins*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      'prefer-const': 'error',
      'max-depth': ['error', 4],
      complexity: ['error', 15],
    },
  },
  eslintConfigPrettier,
);
