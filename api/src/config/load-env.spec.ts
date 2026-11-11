import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('load-env', () => {
  const cwd = process.cwd();
  afterEach(() => {
    process.chdir(cwd);
    delete process.env.LOAD_ENV_A;
    delete process.env.LOAD_ENV_B;
  });

  it('fills missing variables from .env and keeps the ones already set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'load-env-'));
    writeFileSync(join(dir, '.env'), 'LOAD_ENV_A=from-file\nLOAD_ENV_B=from-file\n');
    process.env.LOAD_ENV_B = 'from-shell';
    process.chdir(dir);
    jest.isolateModules(() => {
      require('./load-env');
    });
    expect(process.env.LOAD_ENV_A).toBe('from-file');
    expect(process.env.LOAD_ENV_B).toBe('from-shell');
  });

  it('does nothing without a .env file', () => {
    process.chdir(mkdtempSync(join(tmpdir(), 'load-env-')));
    expect(() => jest.isolateModules(() => require('./load-env'))).not.toThrow();
  });
});
