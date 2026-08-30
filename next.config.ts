import type { NextConfig } from 'next';

/**
 * `output: 'export'` is deliberately absent and must stay absent.
 *
 * Per ADR 0005 the browser never reaches API Gateway directly — every backend
 * call goes through a route handler under `app/api`, which holds the endpoint
 * and the credential server-side. That makes the Next server a real deployment
 * artefact, so a static export is impossible, not merely unused.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
