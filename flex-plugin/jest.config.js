// Self-contained Jest config for the plugin's unit tests. We run jest directly
// (not via flex-plugin-scripts) so the toolchains stay independent.
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.(ts|tsx)'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', jsx: 'react', esModuleInterop: true } },
    ],
  },
};
