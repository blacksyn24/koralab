import type { Metadata } from "next";
import { Lab } from "@/components/lab/Lab";

export const metadata: Metadata = { title: "Labo" };

export default function LabPage() {
  return <Lab />;
}
