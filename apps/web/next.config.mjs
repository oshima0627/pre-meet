/** @type {import('next').NextConfig} */
const nextConfig = {
  // モノレポの共有パッケージ（TS ソースのまま）をトランスパイルする
  transpilePackages: ['@premeet/shared', '@premeet/worker'],
  webpack: (config) => {
    // ワーカーの ESM 風 import（'./x.js'）を TS ソース（'./x.ts'）へ解決させる
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
export default nextConfig;
