import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // No site may show these pages in a frame, so the sign-in form can't
        // be laid under someone else's page to steal clicks. CSP
        // frame-ancestors for current browsers, X-Frame-Options for older ones.
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
