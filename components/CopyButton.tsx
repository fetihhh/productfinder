"use client";

import { useState } from "react";

/** Metni panoya kopyalar (reklam metnini kendi reklamınıza taslak olarak almak için). */
export function CopyButton({ text, label = "Metni kopyala" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Kopyalandı ✓" : label}
    </button>
  );
}
