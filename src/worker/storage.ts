import type { WorldState } from '../sim';

// One save slot in IndexedDB, reachable from the worker.
const DB_NAME = 'grimm-idle';
const STORE = 'saves';
const KEY = 'world';

export interface Save {
  world: WorldState;
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadSave(): Promise<Save | null> {
  try {
    const save = await run<Save | undefined>('readonly', (s) => s.get(KEY));
    return save?.world?.version === 1 ? save : null;
  } catch {
    return null;
  }
}

export async function writeSave(world: WorldState): Promise<void> {
  try {
    await run('readwrite', (s) => s.put({ world, savedAt: Date.now() } satisfies Save, KEY));
  } catch {
    // Private mode or blocked storage: the world simply won't persist.
  }
}

export async function clearSave(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // nothing to clear
  }
}
