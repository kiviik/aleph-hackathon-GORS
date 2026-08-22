import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BA Estaciona — espacios disponibles",
  description: "Mapa local de espacios de estacionamiento disponibles en Londres.",
};

export default function EstacionaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
