import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "4YU CRM",
    short_name: "4YU CRM",
    description: "Prospeccao inteligente via WhatsApp",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0a16",
    theme_color: "#7c3aed",
    icons: [
      {
        src: "/logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
