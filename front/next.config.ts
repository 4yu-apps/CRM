import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // O front e um projeto npm proprio dentro do monorepo Garimpo. Fixa a raiz
  // do Turbopack aqui para o Next nao inferir a pasta-pai (que tem outro lockfile).
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
