import { WallpaperItem } from '../types/launcher';

const DB_NAME = 'ambient_tv_launcher_albums';
const STORE_NAME = 'local_photos';
const DB_VERSION = 1;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/heic',
  'image/heif',
]);

const activeBlobUrls = new Map<string, string>();

interface StoredPhotoRecord {
  id: string;
  title: string;
  creator: string;
  blob: Blob;
  createdAt: number;
}

function registerBlobUrl(id: string, blob: Blob): string {
  const existing = activeBlobUrls.get(id);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  const url = URL.createObjectURL(blob);
  activeBlobUrls.set(id, url);
  return url;
}

function openAlbumDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function cleanFileName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Local Album Photo';
}

export async function saveLocalAlbumFiles(files: FileList | File[]): Promise<WallpaperItem[]> {
  const imageFiles = Array.from(files).filter((file) =>
    ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())
  );
  if (imageFiles.length === 0) return [];

  const db = await openAlbumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const createdItems: WallpaperItem[] = [];

  for (const file of imageFiles) {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const relativeFolder =
      'webkitRelativePath' in file &&
      typeof file.webkitRelativePath === 'string' &&
      file.webkitRelativePath.includes('/')
        ? file.webkitRelativePath.split('/')[0]
        : 'Device Album';

    const title = cleanFileName(file.name);
    const creator = relativeFolder;
    const record: StoredPhotoRecord = {
      id,
      title,
      creator,
      blob: file,
      createdAt: Date.now(),
    };
    store.put(record);
    createdItems.push({
      id,
      title,
      creator,
      sourceUrl: `local-album://${encodeURIComponent(relativeFolder)}/${encodeURIComponent(file.name)}`,
      imageUrl: registerBlobUrl(id, file),
      sourceType: 'local-album',
    });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return createdItems;
}

export async function loadLocalAlbumWallpapers(): Promise<WallpaperItem[]> {
  try {
    const db = await openAlbumDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const records: StoredPhotoRecord[] = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredPhotoRecord[]) || []);
      req.onerror = () => reject(req.error);
    });

    records.sort((a, b) => a.createdAt - b.createdAt);
    return records.map((rec) => ({
      id: rec.id,
      title: rec.title,
      creator: rec.creator,
      sourceUrl: `local-album://${encodeURIComponent(rec.creator)}/${encodeURIComponent(rec.title)}`,
      imageUrl: registerBlobUrl(rec.id, rec.blob),
      sourceType: 'local-album' as const,
    }));
  } catch {
    return [];
  }
}

export async function removeLocalAlbumPhoto(id: string): Promise<void> {
  const existingUrl = activeBlobUrls.get(id);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
    activeBlobUrls.delete(id);
  }
  const db = await openAlbumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateLocalAlbumMetadata(
  id: string,
  title: string,
  creator: string
): Promise<void> {
  const db = await openAlbumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const existing = await new Promise<StoredPhotoRecord | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredPhotoRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) {
    store.put({
      ...existing,
      title,
      creator,
    });
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLocalAlbumPhotos(): Promise<void> {
  for (const url of activeBlobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  activeBlobUrls.clear();
  const db = await openAlbumDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
