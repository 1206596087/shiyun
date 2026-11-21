import type { DatabaseSync } from 'node:sqlite'

/**
 * 迁移 001：初始表结构。
 *
 * 内容与 docs/DATABASE_SCHEMA（DATABASE_SCHEMA.md）第 3 节逐字对应。
 * 已经发布的迁移禁止修改，任何结构调整都必须新增一个版本。
 */
export const migration001 = {
  version: 1,
  name: 'init',
  up(db: DatabaseSync) {
    db.exec(`
      -- migrate.ts 为了记录版本会先建这张表，这里用 IF NOT EXISTS 保证首次建库不冲突。
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE folders (
        id         TEXT PRIMARY KEY,
        parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        CHECK (parent_id IS NULL OR parent_id <> id)
      );
      CREATE INDEX idx_folders_parent ON folders(parent_id) WHERE deleted_at IS NULL;

      CREATE TABLE books (
        id             TEXT PRIMARY KEY,
        folder_id      TEXT REFERENCES folders(id) ON DELETE SET NULL,
        title          TEXT NOT NULL,
        author         TEXT,
        format         TEXT NOT NULL CHECK (format IN ('pdf', 'epub')),
        file_path      TEXT NOT NULL,
        file_hash      TEXT,
        file_size      INTEGER,
        page_count     INTEGER,
        cover_path     TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        last_opened_at TEXT,
        deleted_at     TEXT
      );
      CREATE INDEX idx_books_folder ON books(folder_id) WHERE deleted_at IS NULL;
      CREATE UNIQUE INDEX idx_books_hash ON books(file_hash)
        WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

      CREATE TABLE reading_states (
        book_id      TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        page         INTEGER,
        cfi          TEXT,
        zoom         REAL NOT NULL DEFAULT 1.0,
        scroll_ratio REAL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE highlights (
        id           TEXT PRIMARY KEY,
        book_id      TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        locator_type TEXT NOT NULL CHECK (locator_type IN ('pdf_page', 'epub_cfi')),
        page         INTEGER,
        cfi          TEXT,
        quote        TEXT NOT NULL,
        prefix       TEXT,
        suffix       TEXT,
        rect_json    TEXT,
        color        TEXT NOT NULL DEFAULT 'gold',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        CHECK (
          (locator_type = 'pdf_page' AND page IS NOT NULL) OR
          (locator_type = 'epub_cfi' AND cfi  IS NOT NULL)
        )
      );
      CREATE INDEX idx_highlights_book ON highlights(book_id, page);

      CREATE TABLE notes (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT '',
        body_text  TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX idx_notes_updated ON notes(updated_at DESC) WHERE deleted_at IS NULL;

      CREATE TABLE highlight_notes (
        highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
        note_id      TEXT NOT NULL REFERENCES notes(id)      ON DELETE CASCADE,
        created_at   TEXT NOT NULL,
        PRIMARY KEY (highlight_id, note_id)
      );
      CREATE INDEX idx_highlight_notes_note ON highlight_notes(note_id);

      CREATE TABLE knowledge_links (
        id            TEXT PRIMARY KEY,
        source_kind   TEXT NOT NULL CHECK (source_kind IN ('book','highlight','note','topic')),
        source_id     TEXT NOT NULL,
        target_kind   TEXT NOT NULL CHECK (target_kind IN ('book','highlight','note','topic')),
        target_id     TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        CHECK (source_id <> target_id)
      );
      CREATE INDEX idx_links_source ON knowledge_links(source_kind, source_id);
      CREATE INDEX idx_links_target ON knowledge_links(target_kind, target_id);
      CREATE UNIQUE INDEX idx_links_unique ON knowledge_links(source_id, target_id, relation_type);

      CREATE TABLE graph_layouts (
        node_kind  TEXT NOT NULL CHECK (node_kind IN ('book','highlight','note','topic')),
        node_id    TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
        pinned     INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (node_kind, node_id)
      );

      CREATE TABLE app_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  },
}
