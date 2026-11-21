import type { Migration } from '../migrate.ts'

export const migration002: Migration = {
  version: 2,
  name: 'note_search',
  up(db) {
    db.exec(`
      CREATE VIRTUAL TABLE note_search USING fts5(id UNINDEXED, title, body_text, tokenize='trigram');
      INSERT INTO note_search SELECT id, title, body_text FROM notes WHERE deleted_at IS NULL;
      CREATE TRIGGER notes_search_insert AFTER INSERT ON notes WHEN new.deleted_at IS NULL BEGIN
        INSERT INTO note_search VALUES (new.id, new.title, new.body_text);
      END;
      CREATE TRIGGER notes_search_delete AFTER DELETE ON notes BEGIN
        DELETE FROM note_search WHERE id = old.id;
      END;
      CREATE TRIGGER notes_search_update AFTER UPDATE ON notes BEGIN
        DELETE FROM note_search WHERE id = old.id;
        INSERT INTO note_search SELECT new.id, new.title, new.body_text WHERE new.deleted_at IS NULL;
      END;
    `)
  },
}
