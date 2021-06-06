import type Store from 'electron-store';
import type { IpcMain, IpcRenderer } from 'electron';
import { Mutation } from 'vuex';

export function createPersistedState<S> (options?: {
  whitelist?: string[] | ((mutation: Mutation<S>) => boolean);
  blacklist?: string[] | ((mutation: Mutation<S>) => boolean);
  storage?: Store;
  storageKey?: string;
  storageName?: string;
}): () => any

export function createSharedMutations (options?: {
  type?: 'renderer' | 'main';
  icpMain?: IpcMain;
  ipcRenderer?: IpcRenderer;
}): () => any
