module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/test/integrationSetup.js'],
  testMatch: ['<rootDir>/src/**/*.integration.test.tsx'],
}
