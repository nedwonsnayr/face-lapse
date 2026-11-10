"""Recoverable photo deletion; files stay in place until explicit permanent deletion."""
from sqlalchemy import text


def up(conn):
    columns = {row[1] for row in conn.execute(text('PRAGMA table_info(images)'))}
    if 'deleted_at' not in columns:
        conn.execute(text('ALTER TABLE images ADD COLUMN deleted_at DATETIME'))
    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_images_profile_active ON images(profile_id, deleted_at)'))
    conn.commit()
    return True


def down(conn):
    raise NotImplementedError('Preserve trash metadata; roll forward rather than removing the column')
