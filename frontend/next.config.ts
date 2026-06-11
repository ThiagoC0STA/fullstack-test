import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @crash/contracts ships TypeScript source; Next transpiles it in-place
  transpilePackages: ["@crash/contracts"],
};

export default nextConfig;
