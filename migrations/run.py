#!/usr/bin/env python3
"""Run database migrations manually.

Usage:
    python3 migrations/run.py
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.database import engine
from migrations.runner import run_migrations
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
)

if __name__ == "__main__":
    print("Running database migrations...")
    run_migrations(engine)
    print("✅ Migrations complete")
