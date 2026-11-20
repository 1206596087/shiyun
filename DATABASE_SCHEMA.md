# 数据库设计（SQLite）

> **状态：计划中，尚未实现。** M1 结束时数据仍在 `localStorage`（键 `shiyun-prototype-knowledge-v1`）。本文是 M2 的实现契约：先按此建表，再把渲染进程改为通过 IPC 读写。落地前请勿在代码或文档里声称"已接入数据库"。

## 1. 存储位置与文件

| 项 | 值 |
| --- | --- |
| 数据目录 | `app.getPath('userData')`，Windows 实际为 `%APPDATA%\shiyun` |
| 主库 | `%APPDATA%\shiyun\shiyun.db` |
| 日志模式 | `PRAGMA journal_mode = WAL` |
| 外键 | `PRAGMA foreign_keys = ON`（每个连接都要设） |
| 备份 | `%APPDATA%\shiyun\backups\shiyun-YYYYMMDD-HHmmss.db` |
| 用户导入的原始书籍 | `%APPDATA%\shiyun\books\<bookId>\source.<ext>`（复制而非引用，避免源文件被移动后失效） |

数据库连接只存在于主进程。渲染进程没有文件系统与 `node` 访问能力，只能通过 `window.shiyunDesktop.library.*` 调用。

## 2. ID 策略

- 所有主键都是字符串（`TEXT PRIMARY KEY`），由应用生成 `crypto.randomUUID()`。
- 不使用自增整数：需要跨设备/跨备份合并时不冲突，且导出 JSON 时可读。
- 关联表用复合主键，不额外造 ID。
- 已有演示数据（`book-*`、`note-*`、`highlight-*` 前缀）在迁移时原样保留，不做重新编号。

## 3. 表结构

```sql
-- 迁移记录：只增不改，禁止修改已应用版本的内容
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 文件夹：树形，最多三层（业务层约束，不写进 SQL）
CREATE TABLE folders (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,                       -- 软删除
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_folders_parent ON folders(parent_id) WHERE deleted_at IS NULL;

-- 书籍：一本书一条记录，文件本体另存
CREATE TABLE books (
  id             TEXT PRIMARY KEY,
  folder_id      TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  author         TEXT,
  format         TEXT NOT NULL CHECK (format IN ('pdf', 'epub')),
  file_path      TEXT NOT NULL,          -- 相对 %APPDATA%\shiyun 的路径
  file_hash      TEXT,                   -- sha256，导入时用于去重
  file_size      INTEGER,
  page_count     INTEGER,                -- PDF 页数 / EPUB 章节数（可空，解析后回填）
  cover_path     TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  last_opened_at TEXT,
  deleted_at     TEXT                    -- 软删除；回收站可恢复
);
CREATE INDEX idx_books_folder ON books(folder_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_books_hash ON books(file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;

-- 阅读状态：一本书一条
CREATE TABLE reading_states (
  book_id      TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  page         INTEGER,
  cfi          TEXT,                     -- EPUB 定位
  zoom         REAL NOT NULL DEFAULT 1.0,
  scroll_ratio REAL,                     -- 0–1，跨渲染器近似恢复用
  updated_at   TEXT NOT NULL
);

-- 划线：必须带可重建的定位信息，禁止只存像素坐标
CREATE TABLE highlights (
  id           TEXT PRIMARY KEY,
  book_id      TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  locator_type TEXT NOT NULL CHECK (locator_type IN ('pdf_page', 'epub_cfi')),
  page         INTEGER,                  -- locator_type = 'pdf_page' 时必填
  cfi          TEXT,                     -- locator_type = 'epub_cfi' 时必填
  quote        TEXT NOT NULL,            -- 被划的原文
  prefix       TEXT,                     -- 前文 40 字，用于同页多处相同文本时消歧
  suffix       TEXT,                     -- 后文 40 字
  rect_json    TEXT,                     -- 仅供首屏快速定位高亮框，缺失时必须能靠上面四项重建
  color        TEXT NOT NULL DEFAULT 'gold',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (
    (locator_type = 'pdf_page'  AND page IS NOT NULL) OR
    (locator_type = 'epub_cfi'  AND cfi  IS NOT NULL)
  )
);
CREATE INDEX idx_highlights_book ON highlights(book_id, page);

-- 笔记：独立实体，删除书籍不得删除笔记
CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',    -- M4 起为 TipTap JSON 字符串
  body_text  TEXT NOT NULL DEFAULT '',    -- 纯文本投影，供搜索
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC) WHERE deleted_at IS NULL;

-- 划线 ↔ 笔记：多对多（一条划线可有多篇笔记，一篇笔记可引用多条划线）
CREATE TABLE highlight_notes (
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  note_id      TEXT NOT NULL REFERENCES notes(id)      ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (highlight_id, note_id)
);
CREATE INDEX idx_highlight_notes_note ON highlight_notes(note_id);

-- 知识关系：节点可以是 book / highlight / note / topic，多对多、可跨书跨学科
CREATE TABLE knowledge_links (
  id            TEXT PRIMARY KEY,
  source_kind   TEXT NOT NULL CHECK (source_kind IN ('book','highlight','note','topic')),
  source_id     TEXT NOT NULL,
  target_kind   TEXT NOT NULL CHECK (target_kind IN ('book','highlight','note','topic')),
  target_id     TEXT NOT NULL,
  relation_type TEXT NOT NULL,            -- 例如 'explains' / 'contradicts' / 'derived_from'
  description   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  CHECK (source_id <> target_id)
);
CREATE INDEX idx_links_source ON knowledge_links(source_kind, source_id);
CREATE INDEX idx_links_target ON knowledge_links(target_kind, target_id);
CREATE UNIQUE INDEX idx_links_unique ON knowledge_links(source_id, target_id, relation_type);

-- 星图坐标：与知识实体分离，重建星图不改变身份
CREATE TABLE graph_layouts (
  node_kind  TEXT NOT NULL CHECK (node_kind IN ('book','highlight','note','topic')),
  node_id    TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (node_kind, node_id)
);

-- 应用设置：键值对，不含大数据
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,               -- JSON 字符串
  updated_at TEXT NOT NULL
);
```

> `knowledge_links` 故意不加外键：节点种类多样，`source_id` 可能指向 `books` / `highlights` / `notes`，多态外键在 SQLite 里只能靠触发器模拟，收益不抵复杂度。删除实体时由应用层清理关联行；**删除关系本身永远不删除实体**。

## 4. 删除语义（硬性要求）

| 操作 | 结果 |
| --- | --- |
| 删除书籍 | `books.deleted_at` 置位（进回收站）；`highlights` 随书籍物理删除时才级联；`notes` **绝不**级联删除 |
| 删除划线 | 删除 `highlights` 行与 `highlight_notes` 关联行；`notes` 保留，变成"无划线笔记" |
| 删除笔记 | 软删除 `notes`；`highlight_notes` 关联行删除；划线保留 |
| 删除关系 | 只删 `knowledge_links` 行，两端实体不变 |
| 删除文件夹 | 软删除文件夹；子文件夹随之隐藏；书籍 `folder_id` 置空并落到「未分类」，不删除书籍 |

## 5. 迁移

- 版本号存在 `schema_migrations` 表（不用 `PRAGMA user_version`，因为它无法携带名称与时间）。
- 迁移是**只进不退**的：每个版本一个事务，失败即回滚并拒绝启动，提示用户恢复备份。
- 迁移前必须复制一份备份到 `backups/`，并在设置页显示最近一次备份时间。
- 迁移脚本放 `electron/main/db/migrations/00X_<name>.ts`，导出 `{ version, name, up(db) }`。
- 不允许在迁移里读取用户文件内容（解析 PDF 属于 M3 的独立任务），只许改结构。

## 6. 从 localStorage 一次性迁移

M2 首次启动时：

1. 若 `shiyun.db` 不存在 → 建库、跑全量迁移。
2. 若旧键 `shiyun-prototype-knowledge-v1` 存在 → 读取并校验，按 `type` 写入 `books / highlights / notes / knowledge_links / graph_layouts`；文件名、页码等缺失字段用演示值补齐并在 `app_settings['migration.notes']` 记录降级情况。
3. 迁移成功后把旧键改名为 `shiyun-prototype-knowledge-v1.migrated` **保留不删**，供用户回退；再写入 `app_settings['migration.prototype.importedAt']`。

## 7. 备份与恢复

- 自动：每次启动若距上次备份超过 24 小时，复制一份库文件到 `backups/`；最多保留 14 份，超出按时间删除最旧的。
- 手动：设置页「立即备份 / 打开备份目录 / 从备份恢复」。恢复前先关闭数据库连接并把当前库另存为 `pre-restore-<time>.db`。
- 备份只复制 `shiyun.db`（WAL 模式先执行 `PRAGMA wal_checkpoint(TRUNCATE)`），不复制 `books/` 源文件；导出为可迁移包（M7）时再打 zip。
