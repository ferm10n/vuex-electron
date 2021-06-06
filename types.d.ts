import type Store from 'electron-store';
import type { IpcMain, IpcRenderer } from 'electron';

export function createPersistedState (options?: {
  whitelist?: string[] | ((mutation: string) => boolean);
  blacklist?: string[] | ((mutation: string) => boolean);
  storage?: Store;
  storageKey?: string;
  storageName?: string;
}): () => any

export function createSharedMutations (options?: {
  type?: 'renderer' | 'main';
  icpMain?: IpcMain;
  ipcRenderer?: IpcRenderer;
}): () => any
