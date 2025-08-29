import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    rules: {
      // Unused variables and imports - STRICT DETECTION FOR MANUAL CLEANUP
      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',          // Check all variables
        args: 'all',          // Check all function arguments  
        ignoreRestSiblings: false,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', {
        vars: 'all',
        args: 'all',          // Check ALL arguments (stricter)
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      }],
      
      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      
      // Code quality
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      
      // Style and consistency
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      
      // General ESLint rules
      'no-console': 'off',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-unused-labels': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-case-declarations': 'off',
      'no-undef': 'off',
      
      // Disable conflicting rules
      'no-unused-vars': 'off', // Use TypeScript version instead
    },
  },
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      '**/*.js',
      '**/*.d.ts',
      'testfolder/**/*',
      '__tests__/**/*',
      'examples/**/*',
    ],
  },
];