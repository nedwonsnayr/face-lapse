#!/usr/bin/env python3
"""Check for duplicate images in the originals folder by comparing file hashes."""

import hashlib
from collections import defaultdict
from pathlib import Path
import sys
import os

# Add parent directory to path to import config
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.config import ORIGINALS_DIR

# Try to import database stuff, but make it optional
try:
    from backend.app.database import SessionLocal
    from backend.app.models import Image
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False


def get_file_hash(filepath: Path) -> str:
    """Calculate MD5 hash of a file."""
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def main():
    if not ORIGINALS_DIR.exists():
        print(f"Originals directory not found: {ORIGINALS_DIR}")
        return

    print(f"Scanning {ORIGINALS_DIR} for duplicates...\n")
    
    # Connect to database to check which files are registered (if available)
    db_images = {}
    if DB_AVAILABLE:
        try:
            db = SessionLocal()
            db_images = {img.original_filename: img for img in db.query(Image).all()}
            db.close()
        except Exception as e:
            print(f"Note: Could not connect to database ({e}). Showing file info only.\n")
    
    # Group files by hash
    hash_to_files = defaultdict(list)
    total_files = 0
    
    for filepath in ORIGINALS_DIR.iterdir():
        if filepath.is_file() and not filepath.name.startswith("_"):
            total_files += 1
            file_hash = get_file_hash(filepath)
            hash_to_files[file_hash].append(filepath)
    
    # Find duplicates
    duplicates_found = False
    duplicate_groups = []
    
    for file_hash, files in hash_to_files.items():
        if len(files) > 1:
            duplicates_found = True
            duplicate_groups.append((file_hash, files))
            print(f"Duplicate found (hash: {file_hash[:8]}...):")
            for filepath in files:
                size = filepath.stat().st_size
                img = db_images.get(filepath.name)
                if img:
                    status = []
                    if img.face_detected:
                        status.append("face detected")
                    if img.included_in_video:
                        status.append("included in video")
                    if img.aligned_path:
                        status.append("aligned")
                    status_str = f" [DB: {', '.join(status) if status else 'not aligned'}]"
                else:
                    status_str = " [NOT IN DATABASE]"
                print(f"  - {filepath.name} ({size:,} bytes){status_str}")
            print()
    
    if not duplicates_found:
        print(f"✅ No duplicates found in {total_files} files.")
    else:
        duplicate_count = sum(len(files) - 1 for _, files in duplicate_groups)
        print(f"\n⚠️  Found {duplicate_count} duplicate file(s) across {len(duplicate_groups)} duplicate group(s).")
        
        # Check if any duplicates are included in videos
        video_duplicates = []
        for file_hash, files in duplicate_groups:
            included = [f for f in files if db_images.get(f.name) and db_images[f.name].included_in_video]
            if len(included) > 1:
                video_duplicates.append((file_hash, included))
        
        if video_duplicates:
            print(f"\n🚨 WARNING: {len(video_duplicates)} duplicate group(s) have multiple files included in video generation!")
            print("   This will cause the same image to appear multiple times in your timelapse.")
            for file_hash, included in video_duplicates:
                print(f"   - Hash {file_hash[:8]}...: {', '.join(f.name for f in included)}")


if __name__ == "__main__":
    main()
