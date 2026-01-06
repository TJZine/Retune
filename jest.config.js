/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true,
        }],
    },
    moduleNameMapper: {
        '^@types/(.*)$': '<rootDir>/src/types/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@utils/(.*)$': '<rootDir>/src/utils/$1',
        '^@core/(.*)$': '<rootDir>/src/core/$1',
        '^@config/(.*)$': '<rootDir>/src/config/$1',
    },
    extensionsToTreatAsEsm: ['.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/**/__tests__/**',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
};
