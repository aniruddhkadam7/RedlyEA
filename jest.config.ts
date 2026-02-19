import { configUmiAlias, createConfig } from '@umijs/max/test.js';

export default async (): Promise<any> => {
  const config = await configUmiAlias({
    ...createConfig({
      target: 'browser',
    }),
  });
  return {
    ...config,
    moduleNameMapper: {
      '^@@/requestRecordMock$':
        '<rootDir>/tests/__mocks__/requestRecordMock.js',
      ...(config.moduleNameMapper || {}),
      '\\.(png|jpe?g|gif|webp|avif|svg)$':
        '<rootDir>/tests/__mocks__/fileMock.js',
      '\\.(mp4|webm|wav|mp3|m4a|aac|oga)$':
        '<rootDir>/tests/__mocks__/fileMock.js',
      '\\.(eot|otf|ttf|woff2?)$': '<rootDir>/tests/__mocks__/fileMock.js',
    },
    testEnvironmentOptions: {
      ...(config?.testEnvironmentOptions || {}),
      url: 'http://localhost:8000',
    },
    setupFiles: [...(config.setupFiles || []), './tests/setupTests.jsx'],
    globals: {
      ...config.globals,
      localStorage: null,
    },
  };
};
