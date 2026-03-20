import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/portfolio-analyzer",
  images: { unoptimized: true },
};

export default nextConfig;
