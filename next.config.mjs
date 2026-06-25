/** @type {import('next').NextConfig} */
const nextConfig = {
  // The vault I/O layer uses node:fs and node:child_process. Keep it strictly
  // server-side: it must never be bundled into a client component.
  serverExternalPackages: ['yaml'],
}

export default nextConfig
