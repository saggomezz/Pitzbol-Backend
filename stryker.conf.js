/** @type {import('@stryker-mutator/api/core').Config} */
module.exports = {
  mutator: 'typescript',
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    config: require('./jest.config.cjs')
  },
  mutate: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/config/**',
    '!src/**/__mocks__/**',
    '!src/**/*.d.ts'
  ],
  tsconfigFile: 'tsconfig.json',
  timeoutMS: 60000,
  coverageAnalysis: 'off',
  thresholds: { high: 85, low: 70, break: 65 },
  concurrency: 2
};
