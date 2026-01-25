/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/i',
        destination: '/api/ogp-image',
      },
      {
        source: '/o',
        destination: '/api/ogp',
      },
    ];
  },
}

module.exports = nextConfig
