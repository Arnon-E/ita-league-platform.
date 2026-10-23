/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@ita/rules-engine'],
  serverExternalPackages: ['postgres', 'bcryptjs', '@aws-sdk/client-s3'],
  webpack(config) {
    // the rules engine uses ".js" import specifiers that point at .ts sources
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  devIndicators: false, // the floating Next.js dev button covered the match rows on a phone
  typescript: { ignoreBuildErrors: false },
};
