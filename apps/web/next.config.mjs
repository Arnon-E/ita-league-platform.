/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@ita/rules-engine'],
  serverExternalPackages: ['postgres', 'bcryptjs'],
  webpack(config) {
    // the rules engine uses ".js" import specifiers that point at .ts sources
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  typescript: { ignoreBuildErrors: false },
};
