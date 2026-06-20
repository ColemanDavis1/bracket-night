import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Next doesn't pick up an unrelated parent lockfile.
  outputFileTracingRoot: __dirname,
  typescript: {
    // We run `tsc --noEmit` and tests in CI; do not let type errors silently pass.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
