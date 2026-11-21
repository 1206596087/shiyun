import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '../migrate.ts'

export const migration003: Migration = {
  version: 3,
  name: 'galaxies',
  up(db: DatabaseSync) {
    db.exec(`
      CREATE TABLE galaxies (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color       TEXT NOT NULL DEFAULT '#8da6ff',
        is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );
      CREATE UNIQUE INDEX idx_galaxies_single_default ON galaxies(is_default)
        WHERE is_default = 1 AND deleted_at IS NULL;

      CREATE TABLE galaxy_layouts (
        galaxy_id      TEXT PRIMARY KEY REFERENCES galaxies(id) ON DELETE CASCADE,
        x              REAL NOT NULL,
        y              REAL NOT NULL,
        z              REAL NOT NULL,
        scale          REAL NOT NULL DEFAULT 1,
        density        REAL NOT NULL DEFAULT 1,
        arm_count      INTEGER NOT NULL DEFAULT 4 CHECK (arm_count BETWEEN 2 AND 8),
        tightness      REAL NOT NULL DEFAULT 1.18,
        rotation_speed REAL NOT NULL DEFAULT 0.018,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE galaxy_memberships (
        galaxy_id TEXT NOT NULL REFERENCES galaxies(id) ON DELETE CASCADE,
        node_id   TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (galaxy_id, node_id)
      );
      CREATE INDEX idx_galaxy_memberships_node ON galaxy_memberships(node_id);

      INSERT INTO galaxies (id, name, description, color, is_default, created_at, updated_at)
      VALUES ('galaxy-default', '我的知识星系', '尚未分类到其他星系的知识会安全地停留在这里。', '#8da6ff', 1, datetime('now'), datetime('now'));
      INSERT INTO galaxy_layouts (galaxy_id, x, y, z, scale, density, arm_count, tightness, rotation_speed, updated_at)
      VALUES ('galaxy-default', 0, 0, 0, 1.08, 1, 4, 1.18, 0.018, datetime('now'));
    `)
  },
}
