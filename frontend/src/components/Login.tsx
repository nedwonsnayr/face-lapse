import { useState } from "react";
import { loginWithGitHub } from "../api";

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await loginWithGitHub();
      // Redirect will happen automatically
    } catch (err) {
      console.error("Login failed:", err);
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Face Lapse</h1>
        <p style={styles.subtitle}>Sign in with GitHub to continue</p>
        <button
          style={styles.button}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in with GitHub"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    padding: "20px",
  },
  card: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    padding: "48px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    border: "1px solid var(--border)",
    maxWidth: 400,
    width: "100%",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "var(--text-muted)",
    marginBottom: 32,
  },
  button: {
    width: "100%",
    padding: "12px 24px",
    fontSize: 16,
    fontWeight: 500,
    background: "var(--primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};
