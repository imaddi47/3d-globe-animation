export function WebGLFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        color: 'var(--globe-dot)',
        fontSize: 14,
        opacity: 0.8,
      }}
    >
      <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="70" fill="none" stroke="var(--globe-dot)" strokeOpacity="0.2" />
        {Array.from({ length: 30 }, (_, i) => {
          const a = (i / 30) * Math.PI * 2;
          return <circle key={i} cx={80 + Math.cos(a) * 60} cy={80 + Math.sin(a) * 60} r="1.5" fill="var(--globe-dot)" />;
        })}
      </svg>
      <span>Your browser doesn't support WebGL.</span>
    </div>
  );
}
