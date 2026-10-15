import type { NextConfig } from "next";

const previewAllowedOrigins =
  process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
    : undefined;

const nextConfig: NextConfig = {
  ...(previewAllowedOrigins ? { allowedDevOrigins: previewAllowedOrigins } : {}),
  serverExternalPackages: ["falkordb"],
  async rewrites() {
    // public/pitch/index.html is only served at its literal path — Next
    // doesn't do directory-index resolution like a plain static server.
    return [{ source: "/pitch", destination: "/pitch/index.html" }];
  },
};

export default nextConfig;
