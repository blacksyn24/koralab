import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/mes-labs", "/tableau-de-bord"] },
    sitemap: "https://koralab.vercel.app/sitemap.xml",
  };
}
