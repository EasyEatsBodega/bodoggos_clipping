"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 border border-border hover:border-admin"
    >
      print / save pdf
    </button>
  );
}
