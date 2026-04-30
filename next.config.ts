/**
 * NOTE: build uses --webpack flag because @serwist/next injects a webpack
 * config that's incompatible with Next 16's default Turbopack build.
 * Dev still uses Turbopack for fast HMR. When Serwist's Turbopack support
 * (@serwist/turbopack) stabilizes, we can revisit.
 */
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable:
    process.env.NODE_ENV === "development" ||
    process.env.DISABLE_PWA === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist(nextConfig);
