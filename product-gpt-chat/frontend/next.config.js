/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async headers() {
    return [
      {
        // Apply headers to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups', // Allows Firebase popups to work
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none', // Don't block cross-origin embeds (needed for Firebase)
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

