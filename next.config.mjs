/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js App Router에서는 API bodyParser 크기 제한을
  // route.ts 내 export const config = { api: { bodyParser: { sizeLimit: '55mb' } } }
  // 또는 maxDuration으로 관리합니다.
};

export default nextConfig;
