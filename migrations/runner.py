"""Migration runner that applies all pending migrations."""

import logging
from pathlib import Path
from importlib import import_module
from sqlalchemy import text

log = logging.getLogger("face-lapse.migrations")


def get_migration_modules():
    """Get all migration modules in order."""
    import sys
    import importlib.util
    
    migrations_dir = Path(__file__).parent
    migrations = []
    
    # Ensure migrations directory is in Python path
    project_root = migrations_dir.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    
    for file in sorted(migrations_dir.glob("*.py")):
        if file.name.startswith("__") or file.name in ("runner.py", "run.py"):
            continue
        
        # Load module directly from file
        try:
            spec = importlib.util.spec_from_file_location(file.stem, file)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                if hasattr(module, "up"):
                    migrations.append((file.stem, module))
        except Exception as e:
            log.warning("Failed to import migration %s: %s", file.name, e)
    
    return migrations


def run_migrations(engine):
    """Run all pending migrations."""
    migrations = get_migration_modules()
    
    if not migrations:
        return
    
    with engine.connect() as conn:
        # Ensure migrations table exists
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()
        
        # Get already applied migrations
        result = conn.execute(text("SELECT name FROM _migrations"))
        applied = {row[0] for row in result}
        
        # Apply pending migrations
        for name, module in migrations:
            if name in applied:
                continue
            
            log.info("Applying migration: %s", name)
            try:
                applied_successfully = module.up(conn)
                if applied_successfully:
                    conn.execute(text("INSERT INTO _migrations (name) VALUES (:name)"), {"name": name})
                    conn.commit()
                    log.info("✅ Migration %s applied successfully", name)
                else:
                    log.info("⏭️  Migration %s skipped (already applied or not needed)", name)
            except Exception as e:
                log.error("❌ Migration %s failed: %s", name, e, exc_info=True)
                raise


if __name__ == "__main__":
    # Allow running migrations directly
    import sys
    from pathlib import Path
    
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from backend.app.database import engine
    
    logging.basicConfig(level=logging.INFO)
    run_migrations(engine)
