import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

const boot = (env: Record<string, string>) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], { env: { PATH: process.env.PATH!, PORT: '0', ...env }, cwd: process.cwd(), encoding: 'utf8', timeout: 15000 });

describe('production boot is refused on unsafe config (real process, exit code 1)', () => {
  const good = { NODE_ENV: 'production', JWT_SECRET: 'a3f9c1d27b8e4f60918273645a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b', DATABASE_URL: 'postgresql://u:p@localhost:5432/x', CORS_ORIGIN: 'https://nexus.example.org' };
  it('placeholder JWT_SECRET', () => {
    const r = boot({ ...good, JWT_SECRET: 'change-me-to-a-long-random-string' });
    expect(r.status).toBe(1); expect(r.stderr).toContain('JWT_SECRET'); expect(r.stderr).not.toContain('change-me-to-a-long');
  });
  it('SQLite in production', () => {
    const r = boot({ ...good, DATABASE_URL: 'file:./dev.db' });
    expect(r.status).toBe(1); expect(r.stderr).toContain('SQLite');
  });
  it('missing JWT_SECRET', () => expect(boot({ ...good, JWT_SECRET: '' }).status).toBe(1));
});
