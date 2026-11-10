import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'sharp'],
  outputFileTracingExcludes: {
    '/binder': [
      'node_modules/@huggingface/**',
      'node_modules/onnxruntime-node/**',
      'node_modules/onnxruntime-web/**',
    ],
  },
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1600],
    imageSizes: [48, 64, 96, 128, 160, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        port: '',
        pathname: '/images/**',
      },
    ],
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/studio", permanent: false },
      { source: "/admin/:path*", destination: "/studio/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
