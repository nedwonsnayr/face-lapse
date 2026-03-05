import { useState, useEffect, useRef } from "react";
import { getCurrentUser, logout, isAuthRequired, type UserInfo } from "../api";

export default function UserProfile() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const requireAuth = isAuthRequired();

  useEffect(() => {
    if (!requireAuth) {
      return;
    }

    getCurrentUser().then(setUser);
  }, [requireAuth]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  if (!requireAuth || !user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    window.location.reload();
  };

  const displayName = user.github_username || user.github_email || "User";
  const avatarUrl = user.github_avatar_url;

  return (
    <div style={styles.container} ref={menuRef}>
      <button
        style={styles.profileButton}
        onClick={() => setShowMenu(!showMenu)}
        title={displayName}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} style={styles.avatar} />
        ) : (
          <div style={styles.avatarPlaceholder}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span style={styles.name}>{displayName}</span>
        <span style={styles.arrow}>{showMenu ? "▲" : "▼"}</span>
      </button>

      {showMenu && (
        <div style={styles.menu}>
          <div style={styles.menuHeader}>
            <div style={styles.menuName}>{displayName}</div>
            {user.github_email && (
              <div style={styles.menuEmail}>{user.github_email}</div>
            )}
          </div>
          <div style={styles.menuDivider} />
          <button style={styles.menuItem} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
  },
  profileButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "all 0.2s",
    fontSize: 14,
    color: "var(--text)",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    objectFit: "cover",
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "var(--primary)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
  },
  name: {
    maxWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  arrow: {
    fontSize: 10,
    color: "var(--text-muted)",
  },
  menu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    minWidth: 200,
    zIndex: 1000,
  },
  menuHeader: {
    padding: "12px 16px",
  },
  menuName: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text)",
    marginBottom: 4,
  },
  menuEmail: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  menuDivider: {
    height: 1,
    background: "var(--border)",
    margin: "8px 0",
  },
  menuItem: {
    width: "100%",
    padding: "10px 16px",
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 14,
    transition: "background 0.2s",
  },
};
