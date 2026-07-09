export function BackgroundPattern() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -1,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* Subtle grid pattern */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at top, black, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black, transparent 70%)",
        }}
      />
      {/* Soft ambient glow from top */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "20%",
          right: "20%",
          height: "50%",
          background: "radial-gradient(ellipse at center, rgba(138, 43, 226, 0.15), transparent 70%)",
          filter: "blur(60px)",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}
