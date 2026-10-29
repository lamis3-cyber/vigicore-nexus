import { describe, it, expect } from 'vitest';
import { isPlatformAdmin } from '../src/middleware/requirePlatformAdmin';

describe('isPlatformAdmin', () => {
  const env = { PLATFORM_ADMIN_EMAILS: ' Staff@VigiCore.dz , ops@vigicore.dz ' } as NodeJS.ProcessEnv;

  it('accepts listed emails, ignoring case and spaces', () => {
    expect(isPlatformAdmin('staff@vigicore.dz', env)).toBe(true);
    expect(isPlatformAdmin('OPS@vigicore.dz', env)).toBe(true);
  });
  it('rejects everyone else', () => {
    expect(isPlatformAdmin('someone@lab.dz', env)).toBe(false);
    expect(isPlatformAdmin(null, env)).toBe(false);
    expect(isPlatformAdmin('', env)).toBe(false);
  });
  it('is closed by default when the variable is empty or missing', () => {
    expect(isPlatformAdmin('staff@vigicore.dz', { PLATFORM_ADMIN_EMAILS: '' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isPlatformAdmin('staff@vigicore.dz', {} as NodeJS.ProcessEnv)).toBe(false);
  });
});
