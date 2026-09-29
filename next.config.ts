import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheStartUrl: false,
  cacheOnFrontEndNav: false,
  workboxOptions: {
    runtimeCaching: [
      { urlPattern: /\/api\/|\/staff\/|\/order\/|supabase\./, handler: 'NetworkOnly' },
      { urlPattern: /\/_next\/static\//, handler: 'CacheFirst', options: { cacheName: 'static-assets-v1', expiration: { maxEntries: 100 } } },
    ],
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
