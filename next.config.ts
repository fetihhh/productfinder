import type { NextConfig } from "next";

// cacheComponents bilinçli olarak kapalı: tek kullanıcılı, her istekte dinamik bir panel.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
