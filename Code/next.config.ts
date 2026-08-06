import type { NextConfig } from "next";
import os from "os";

// Helper to get all current local IPv4 addresses dynamically
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = ["localhost:3000", "127.0.0.1:3000"];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
        ips.push(`${net.address}:3000`);
      }
    }
  }
  return ips;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getLocalIps(),

  // Add this
  devIndicators: false,

  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "canvas",
    "tesseract.js",
    "better-sqlite3",
    "bcrypt",
  ],

  webpack: (config, { dev, isServer, webpack }) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;

    config.module.rules.push({
      test: /pdfjs-dist[\\/].*\.mjs$/,
      type: "javascript/auto",
    });

    if (dev && !isServer) {
      config.plugins.push(
        new webpack.EvalSourceMapDevToolPlugin({
          exclude: [/pdfjs-dist/, /react-pdf/],
          columns: false,
        })
      );
    }

    return config;
  },
};

export default nextConfig;