// Minimal promise wrapper over IndexedDB. Three object stores:
//   rows    every synced table row, keyed by [table, key]
//   outbox  queued writes, auto-incrementing seq = send order
//   meta    small key/value state (sync cursors, cached profile, ...)

const DB_NAME = "halaqat";
const DB_VERSION = 1;

export type RowRecord = { table: string; key: string; row: Record<string, unknown> };

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows", { keyPath: ["table", "key"] });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: "rows" | "outbox" | "meta"): Promise<T[]> {
  const db = await open();
  return request(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function putRows(records: RowRecord[]): Promise<void> {
  if (!records.length) return;
  const db = await open();
  const tx = db.transaction("rows", "readwrite");
  const s = tx.objectStore("rows");
  for (const r of records) s.put(r);
  await done(tx);
}

export async function deleteRow(table: string, key: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("rows", "readwrite");
  tx.objectStore("rows").delete([table, key]);
  await done(tx);
}

/** Writes rows and appends an outbox item in one transaction, so a write is never half-recorded. */
export async function putRowsAndEnqueue<T extends object>(records: RowRecord[], item: T): Promise<number> {
  const db = await open();
  const tx = db.transaction(["rows", "outbox"], "readwrite");
  const rows = tx.objectStore("rows");
  for (const r of records) rows.put(r);
  const seq = await request(tx.objectStore("outbox").add(item));
  await done(tx);
  return seq as number;
}

export async function putOutbox<T extends object>(item: T): Promise<void> {
  const db = await open();
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").put(item);
  await done(tx);
}

export async function deleteOutbox(seq: number): Promise<void> {
  const db = await open();
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").delete(seq);
  await done(tx);
}

export async function getMeta<T>(k: string): Promise<T | undefined> {
  const db = await open();
  const rec = (await request(db.transaction("meta").objectStore("meta").get(k))) as { k: string; v: T } | undefined;
  return rec?.v;
}

export async function setMeta(k: string, v: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ k, v });
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction(["rows", "outbox", "meta"], "readwrite");
  tx.objectStore("rows").clear();
  tx.objectStore("outbox").clear();
  tx.objectStore("meta").clear();
  await done(tx);
}
