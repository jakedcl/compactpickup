import type { NextConfig } from "next";

const traceExclude = [
  'node_modules/@huggingface/transformers/**',
  'node_modules/onnxruntime-node/**',
  'node_modules/onnxruntime-web/**',
  'node_modules/onnxruntime-common/**',
  'node_modules/onnxruntime-*/**',
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'sharp', '@huggingface/transformers', 'onnxruntime-node'],
  outputFileTracingExcludes: {
    '/scan': traceExclude,
    '/(site)/scan': traceExclude,
    '/binder': traceExclude,
    '/api/admin/**': ['node_modules/@img/*linuxmusl*/**'],
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
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/studio", permanent: false },
      { source: "/admin/:path*", destination: "/studio/:path*", permanent: false },
      { source: "/more", destination: "/other", permanent: false },
      { source: "/more/:model", destination: "/other/:model", permanent: false },
    ];
  },
};

export default nextConfig;
