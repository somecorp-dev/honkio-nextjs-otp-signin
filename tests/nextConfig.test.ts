import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('security headers', () => {
  it('stops every page being framed', async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]);
  });
});
