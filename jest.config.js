module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // auth.test.js requires a real DB — run it with: npm run test:auth
  testPathIgnorePatterns: ['/node_modules/', 'tests/integration/auth.test.js'],
  setupFiles: ['<rootDir>/tests/helpers/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/migrations/**',
    '!src/seeds/**',
    '!src/jobs/**',
    '!src/config/**',
    '!src/index.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true,
};
