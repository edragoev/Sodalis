import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sodalis",
    short_name: "Sodalis",
    description: "Stay connected with your loved one",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f7fb",
    theme_color: "#b0cde6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
