import type { MetadataRoute } from "next";

/** Permet d'« ajouter KoraLab à l'écran d'accueil » sur téléphone, avec la bonne icône. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KoraLab — le labo réseau en ligne",
    short_name: "KoraLab",
    description: "Configurez des routeurs et des switchs dans votre navigateur. Gratuit, sans installation.",
    start_url: "/tableau-de-bord",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
