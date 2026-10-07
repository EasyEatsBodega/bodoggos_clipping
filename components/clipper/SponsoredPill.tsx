// Badge for clips the clipper marked as a sponsored post. Styled like the
// admin TagPicker's topic chip so the same tag reads the same on both sides.
export function SponsoredPill() {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border"
      style={{ borderColor: "rgba(255, 157, 89, 0.4)", color: "var(--admin)" }}
      title="marked as a sponsored post"
    >
      sponsored
    </span>
  );
}
