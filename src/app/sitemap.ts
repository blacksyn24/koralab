import type { MetadataRoute } from "next";

const BASE = "https://koralab.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/lab", "/tps", "/tp?id=demo", "/connexion", "/confidentialite", "/conditions"].map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.6,
  }));
}
