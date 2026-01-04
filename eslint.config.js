import eslintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    {
        files: ['src/**/*.ts', 'src/**/*.tsx'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.eslint.json',
                ecmaVersion: 2017,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': eslintPlugin,
        },
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'error',
            'no-console': ['warn', { allow: ['error', 'warn'] }],
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', '*.config.js'],
    },
];
