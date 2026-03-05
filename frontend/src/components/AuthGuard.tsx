import { useEffect, useState, ReactNode } from "react";
import { getCurrentUser, isAuthRequired, handleAuthCallback } from "../api";
import Login from "./Login";
import type { UserInfo } from "../api";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const requireAuth = isAuthRequired();

  useEffect(() => {
    // Handle OAuth callback if token is in URL
    const token = handleAuthCallback();
    if (token) {
      // Token was set, now fetch user info
      getCurrentUser()
        .then((userInfo) => {
          setUser(userInfo);
          // Refresh the page to clear URL params and reload app state
          window.location.href = window.location.pathname;
        })
        .catch(() => {
          setLoading(false);
        });
      return;
    }

    // If auth is not required, skip authentication
    if (!requireAuth) {
      setLoading(false);
      return;
    }

    // Check if user is authenticated
    getCurrentUser()
      .then((userInfo) => {
        setUser(userInfo);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [requireAuth]);

  // If auth is not required, render children directly
  if (!requireAuth) {
    return <>{children}</>;
  }

  // Show loading state
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  // If not authenticated, show login
  if (!user) {
    return <Login />;
  }

  // User is authenticated, render children
  return <>{children}</>;
}
