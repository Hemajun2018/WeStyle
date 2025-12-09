export interface StoredImageMeta {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  originalSize?: number;
  compressedSize?: number;
  createdAt: number;
}

const DB_NAME = 'EasyPubImages';
const STORE_NAME = 'images';
const DB_VERSION = 1;

export class ImageStore {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveImage(meta: StoredImageMeta, blob: Blob): Promise<void> {
    await this.init();
    const db = this.db!;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ ...meta, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // Overload-friendly: allow saving original blob along with preview blob
  async saveImageWithOriginal(meta: StoredImageMeta, previewBlob: Blob, originalBlob?: Blob | null): Promise<void> {
    await this.init();
    const db = this.db!;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const value: any = { ...meta, blob: previewBlob };
      if (originalBlob) value.origBlob = originalBlob;
      store.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async getImageBlob(id: string): Promise<Blob | null> {
    await this.init();
    const db = this.db!;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v?.blob || null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getImageOriginalBlob(id: string): Promise<Blob | null> {
    await this.init();
    const db = this.db!;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v?.origBlob || v?.blob || null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getImageMeta(id: string): Promise<StoredImageMeta | null> {
    await this.init();
    const db = this.db!;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const v = req.result;
        if (!v) return resolve(null);
        const { blob, ...rest } = v;
        resolve(rest as StoredImageMeta);
      };
      req.onerror = () => reject(req.error);
    });
  }
}

export const imageStore = new ImageStore();
