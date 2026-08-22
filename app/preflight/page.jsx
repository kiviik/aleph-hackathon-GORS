import PreflightCheck from "@/components/PreflightCheck";

// A real route rather than a hash view in the studio shell: this tool has no
// brand, no sidebar and no account, and the URL is the thing that gets sent on.
export const metadata = {
  title: "Pre-flight brief check — Atelier",
  description:
    "Paste a tech pack, get everything a factory will come back and ask about, before you send it.",
};

export default function PreflightPage() {
  return <PreflightCheck />;
}
