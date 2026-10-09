/**
 * Jest Setup File
 */

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock os module
jest.mock('os', () => ({
  cpus: () => [{ model: 'test', speed: 1000 }],
  totalmem: () => 16000000000,
  freemem: () => 8000000000,
  platform: () => 'linux',
  arch: () => 'x64',
  loadavg: () => [1, 2, 3],
}));

// Mock process module
jest.mock('process', () => ({
  ...process,
  memoryUsage: () => ({
    heapTotal: 100000000,
    heapUsed: 50000000,
    external: 10000000,
    rss: 150000000,
  }),
  cpuUsage: () => ({ user: 1000, system: 500 }),
  uptime: () => 3600,
}));

// Global test utilities
global.createMockRequest = (overrides = {}) => ({
  method: 'GET',
  url: '/test',
  headers: {},
  body: null,
  query: {},
  params: {},
  ...overrides,
});

global.createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};
