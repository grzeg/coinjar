import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(parseEnv({})).toEqual({
      VITE_ENABLE_MSW: false,
      VITE_API_CHAOS: false,
      VITE_RUM_APP_MONITOR_ID: undefined,
      VITE_RUM_IDENTITY_POOL_ID: undefined,
      VITE_RUM_REGION: undefined,
      VITE_APP_VERSION: 'dev',
    });
  });

  it('parses boolean flags', () => {
    const env = parseEnv({ VITE_ENABLE_MSW: 'true', VITE_API_CHAOS: 'false' });

    expect(env.VITE_ENABLE_MSW).toBe(true);
    expect(env.VITE_API_CHAOS).toBe(false);
  });

  it('treats empty strings as not set', () => {
    expect(parseEnv({ VITE_RUM_REGION: '' }).VITE_RUM_REGION).toBeUndefined();
  });

  it('fails fast on an invalid flag', () => {
    expect(() => parseEnv({ VITE_ENABLE_MSW: 'yes' })).toThrow(
      /VITE_ENABLE_MSW/,
    );
  });
});
