/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit (and its font engine, fontkit) locate their bundled font files
  // relative to their OWN package folder at runtime. If Next's bundler
  // inlines their code into the route file, that relative lookup breaks.
  // Keeping them external makes them load normally from node_modules
  // instead, so their internal file paths stay correct.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Belt-and-braces: also make sure their data files are copied into the
  // deployed function regardless.
  outputFileTracingIncludes: {
    "/api/export/pdf": [
      "./node_modules/pdfkit/js/data/**/*",
      "./node_modules/fontkit/**/*",
    ],
  },
};

module.exports = nextConfig;
