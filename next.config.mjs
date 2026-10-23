/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    // Canonical External Identity Governance paths. The underlying routes keep
    // their original segment names so existing links, exports, and audit
    // references continue to resolve.
    return [
      { source: '/login', destination: '/auth/login', permanent: false },
      { source: '/identities', destination: '/guests', permanent: false },
      { source: '/identities/:id', destination: '/guests/:id', permanent: false },
    ]
  },
}

export default nextConfig
