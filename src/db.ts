// IndexedDB 持久层：全部资料保存在本机浏览器，刷新可续做
import type { AppState } from './types';

const DB_NAME = 'garlic-drying-guide';
const DB_VERSION = 1;
const STORE = 'state';
const KEY = 'current';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadState(): Promise<AppState | undefined> {
  try {
    const value = await tx<AppState | undefined>('readonly', (s) => s.get(KEY));
    return value;
  } catch (err) {
    console.warn('读取本地存档失败：', err);
    return undefined;
  }
}

export async function saveState(state: AppState): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(state, KEY));
  } catch (err) {
    console.warn('写入本地存档失败：', err);
  }
}

export async function clearState(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch (err) {
    console.warn('清除本地存档失败：', err);
  }
}
