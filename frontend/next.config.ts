import type { NextConfig } from "next";

/**
 * Baseline security headers on every response. A real-money product is
 * a clickjacking and MIME-sniffing target, so framing is denied, the
 * content type is pinned, the referrer is trimmed cross-origin and the
 * powerful-feature surface is shut off.
 *
 * A strict Content-Security-Policy with per-request nonces is the next
 * step (documented in the README) and is intentionally left out here to
 * avoid shipping a policy that silently breaks under review.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // @crash/contracts ships TypeScript source; Next transpiles it in-place
  transpilePackages: ["@crash/contracts"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
