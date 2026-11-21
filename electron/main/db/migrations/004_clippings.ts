import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '../migrate.ts'

/**
 * 迁移 004：网页摘录（WebClipping）+ 放宽两张表的节点种类 CHECK。
 *
 * 为什么要重建 `knowledge_links` 与 `graph_layouts`：SQLite 不能 ALTER 一个 CHECK 约束，
 * 而摘录要作为新种类 `clipping` 出现在银河与关系里。按 DATABASE_SCHEMA 第 5 节与 prompt4 第三节：
 * 新建改过结构的表 → 全量复制 → 核对行数 → 换名替换，整个过程在 migrate.ts 给的事务里。
 */
function countRows(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number } | undefined
  return Number(row?.total ?? 0)
}

export const migration004: Migration = {
  version: 4,
  name: 'clippings',
  up(db: DatabaseSync) {
    db.exec(`
      CREATE TABLE web_clippings (
        id           TEXT PRIMARY KEY,
        quote        TEXT NOT NULL,
        page_title   TEXT NOT NULL DEFAULT '',
        url          TEXT NOT NULL,
        captured_at  TEXT NOT NULL,
        prefix       TEXT,
        suffix       TEXT,
        user_note    TEXT NOT NULL DEFAULT '',
        note_id      TEXT REFERENCES notes(id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        deleted_at   TEXT,
        CHECK (length(quote) > 0)
      );
      CREATE INDEX idx_web_clippings_created ON web_clippings(captured_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX idx_web_clippings_note ON web_clippings(note_id);
      CREATE INDEX idx_web_clippings_host ON web_clippings(url);
    `)

    // —— knowledge_links：多一个 clipping 种类 ——
    const linkCount = countRows(db, 'knowledge_links')
    db.exec(`
      CREATE TABLE knowledge_links_v4 (
        id            TEXT PRIMARY KEY,
        source_kind   TEXT NOT NULL CHECK (source_kind IN ('book','highlight','note','topic','clipping')),
        source_id     TEXT NOT NULL,
        target_kind   TEXT NOT NULL CHECK (target_kind IN ('book','highlight','note','topic','clipping')),
        target_id     TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        CHECK (source_id <> target_id)
      );
      INSERT INTO knowledge_links_v4 (id, source_kind, source_id, target_kind, target_id, relation_type, description, created_at)
        SELECT id, source_kind, source_id, target_kind, target_id, relation_type, description, created_at
          FROM knowledge_links;
    `)
    if (countRows(db, 'knowledge_links_v4') !== linkCount) {
      throw new Error(`knowledge_links 复制后行数不一致（原 ${linkCount} 行）`)
    }
    db.exec(`
      DROP TABLE knowledge_links;
      ALTER TABLE knowledge_links_v4 RENAME TO knowledge_links;
      CREATE INDEX idx_links_source ON knowledge_links(source_kind, source_id);
      CREATE INDEX idx_links_target ON knowledge_links(target_kind, target_id);
      CREATE UNIQUE INDEX idx_links_unique ON knowledge_links(source_id, target_id, relation_type);
    `)

    // —— graph_layouts：同上，多一个 clipping 种类 ——
    const layoutCount = countRows(db, 'graph_layouts')
    db.exec(`
      CREATE TABLE graph_layouts_v4 (
        node_kind  TEXT NOT NULL CHECK (node_kind IN ('book','highlight','note','topic','clipping')),
        node_id    TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
        pinned     INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (node_kind, node_id)
      );
      INSERT INTO graph_layouts_v4 (node_kind, node_id, x, y, z, pinned, updated_at)
        SELECT node_kind, node_id, x, y, z, pinned, updated_at FROM graph_layouts;
    `)
    if (countRows(db, 'graph_layouts_v4') !== layoutCount) {
      throw new Error(`graph_layouts 复制后行数不一致（原 ${layoutCount} 行）`)
    }
    db.exec(`
      DROP TABLE graph_layouts;
      ALTER TABLE graph_layouts_v4 RENAME TO graph_layouts;
    `)
  },
}
