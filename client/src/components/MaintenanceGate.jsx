import React from "react";

export default function MaintenanceGate() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#0f172a",
        color: "#f8fafc",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        textAlign: "center",
        padding: "2rem",
        boxSizing: "border-box",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 999999,
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          backgroundColor: "#1e293b",
          padding: "2.5rem 2rem",
          borderRadius: "1rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid #334155",
        }}
      >
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }} role="img" aria-label="tools">
          🛠️
        </div>
        <h1
          style={{
            fontSize: "1.875rem",
            fontWeight: "700",
            marginBottom: "0.75rem",
            letterSpacing: "-0.025em",
          }}
        >
          Scheduled Maintenance
        </h1>
        <p
          style={{
            color: "#94a3b8",
            lineHeight: "1.6",
            fontSize: "1rem",
            marginBottom: "1.75rem",
          }}
        >
          TetherChat is currently undergoing database upgrades. All services are temporarily suspended to ensure zero data divergence.
        </p>
        <div
          style={{
            display: "inline-block",
            padding: "0.5rem 1.25rem",
            backgroundColor: "#334155",
            borderRadius: "9999px",
            fontSize: "0.875rem",
            color: "#38bdf8",
            fontWeight: "600",
            letterSpacing: "0.025em",
          }}
        >
          We'll be back shortly
        </div>
      </div>
    </div>
  );
}
