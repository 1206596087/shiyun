export interface TrashItem { id: string; title: string; kind: 'book' | 'note'; deletedAt: string }
export interface MaintenanceStatus {
  dataDir: string
  logDir: string
  schemaVersion: number
  lastBackupAt: string | null
}
export interface MaintenanceApi {
  exportBundle: () => Promise<string | null>
  status: () => Promise<MaintenanceStatus>
  trash: () => Promise<TrashItem[]>
  restore: (kind: 'book' | 'note', id: string) => Promise<void>
  openDirectory: (kind: 'data' | 'logs') => Promise<void>
  backup: () => Promise<void>
}
