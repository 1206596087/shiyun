import { join } from 'node:path'

export interface DataPaths {
  /** userData 根目录，Windows 上是 %APPDATA%\shiyun */
  root: string
  dbFile: string
  booksDir: string
  backupsDir: string
}

export function resolveDataPaths(userDataDir: string): DataPaths {
  return {
    root: userDataDir,
    dbFile: join(userDataDir, 'shiyun.db'),
    booksDir: join(userDataDir, 'books'),
    backupsDir: join(userDataDir, 'backups'),
  }
}
