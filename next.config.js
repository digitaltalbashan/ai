/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions are enabled by default in Next.js 14+
  // Mark packages as server-only to prevent client-side bundling
  serverComponentsExternalPackages: ['@xenova/transformers', 'onnxruntime-node'],
  
  webpack: (config, { isServer }) => {
    // Ignore .node files (native modules) in client-side bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
      
      // Ignore .node files in client bundle
      config.module.rules.push({
        test: /\.node$/,
        use: 'ignore-loader',
      })
      
      // Externalize @xenova/transformers and onnxruntime-node for client
      config.externals = config.externals || []
      config.externals.push({
        '@xenova/transformers': 'commonjs @xenova/transformers',
        'onnxruntime-node': 'commonjs onnxruntime-node',
      })
    } else {
      // For server-side, also ignore .node files from other platforms
      config.module.rules.push({
        test: /\.node$/,
        use: {
          loader: 'ignore-loader',
        },
      })
      
      // Mock sharp for server-side to prevent loading issues
      config.resolve.alias = {
        ...config.resolve.alias,
        sharp: false,
      }
    }
    
    return config
  },
}

module.exports = nextConfig

