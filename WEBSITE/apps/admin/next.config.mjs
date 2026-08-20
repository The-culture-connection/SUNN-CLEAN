/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sunnclean/shared'],
  experimental: { serverComponentsExternalPackages: ['firebase-admin'] },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
