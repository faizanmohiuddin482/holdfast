import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded by Node at runtime instead of bundled: Firebase's Firestore client resolves optional deps dynamically.
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore"],
};

export default nextConfig;
