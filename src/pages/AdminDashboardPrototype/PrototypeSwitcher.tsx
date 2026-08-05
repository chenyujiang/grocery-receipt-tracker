import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// PROTOTYPE-ONLY. Floating bottom bar to flip between UI variants — see
// mattpocock-skills prototype/UI.md. Not meant to survive past this prototype.

export interface VariantMeta {
  key: string;
  name: string;
}

interface Props {
  variants: VariantMeta[];
  current: string;
}

export default function PrototypeSwitcher({ variants, current }: Props) {
  const [, setSearchParams] = useSearchParams();
  const index = variants.findIndex((v) => v.key === current);

  function go(nextIndex: number) {
    const wrapped = (nextIndex + variants.length) % variants.length;
    setSearchParams({ variant: variants[wrapped].key });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isEditable) return;

      if (event.key === "ArrowLeft") go(index - 1);
      if (event.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (import.meta.env.PROD) return null;

  const active = variants[index];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#1b211d",
        color: "#fff",
        borderRadius: 999,
        padding: "8px 10px 8px 14px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        zIndex: 1000,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Previous variant"
        style={{
          background: "transparent",
          color: "#fff",
          border: "none",
          padding: "4px 6px",
          cursor: "pointer",
        }}
      >
        ←
      </button>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {active.key} — {active.name}
      </span>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Next variant"
        style={{
          background: "transparent",
          color: "#fff",
          border: "none",
          padding: "4px 6px",
          cursor: "pointer",
        }}
      >
        →
      </button>
    </div>
  );
}
