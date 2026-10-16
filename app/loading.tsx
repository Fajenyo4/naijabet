export default function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="hero">
        <div className="skeleton" style={{ width: 90, height: 12 }} />
        <div className="skeleton" style={{ width: "60%", height: 30, margin: "10px 0" }} />
        <div className="muted">
          <span className="spinner" /> Crunching the latest results…
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div className="card" key={i}>
          <div className="skeleton" style={{ width: "40%", height: 12 }} />
          <div className="skeleton" style={{ width: "100%", height: 22, marginTop: 14 }} />
          <div className="skeleton" style={{ width: "100%", height: 26, marginTop: 12 }} />
          <div className="skeleton" style={{ width: "100%", height: 48, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}
