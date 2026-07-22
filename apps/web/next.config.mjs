import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// ローカル `next dev` で Cloudflare バインディング（KV等）を利用可能にする。
// CF 外のビルドでは実質 no-op。
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@premeet/shared', '@premeet/worker'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
export default nextConfig;
