import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{source: "/:path*", headers: [
      // Start with a short, host-only HTTPS policy; do not preload unknown subdomains.
      {key: "Strict-Transport-Security", value: "max-age=86400"},
      {key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()"},
      {key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"},
      {key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"},
    ]}];
  },
  devIndicators: false,
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
  serverExternalPackages: ["ali-oss", "pdfjs-dist", "pdfkit", "pptxgenjs", "mammoth", "word-extractor", "@embedpdf/fonts-sc"],
  outputFileTracingIncludes: {
    "/api/science-resources/recognize": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
    ],
    "/api/ai-chat": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/@embedpdf/fonts-sc/fonts/NotoSansHans-Regular.otf",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
    ],
  },
};

export default nextConfig;
