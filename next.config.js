/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit reads its standard font metrics (.afm) files from disk at runtime;
  // Next's serverless bundler doesn't detect that automatically, so it has
  // to be told explicitly to include them in the PDF export route's bundle.
  outputFileTracingIncludes: {
    "/api/export/pdf": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

module.exports = nextConfig;
