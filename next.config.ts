import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["falkordb"],
  async rewrites() {
    // public/pitch/index.html is only served at its literal path — Next
    // doesn't do directory-index resolution like a plain static server.
    return [{ source: "/pitch", destination: "/pitch/index.html" }];
  },
};

export default nextConfig;
