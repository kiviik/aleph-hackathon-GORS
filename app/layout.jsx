import "./globals.css";
// Loaded AFTER globals so the chrome layer wins where they overlap. Everything
// in it is `ax-`-prefixed, so in practice they do not overlap at all.
import "./atelier-ui.css";
// The data-control centre (import + connections). Loaded last and namespaced
// `dc-`, so it adds rules rather than competing with the two above it.
import "./import.css";
import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "Atelier — the decision layer for fashion brands",
  description: "Collection planning and decision layer for fashion teams"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
