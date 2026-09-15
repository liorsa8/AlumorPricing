import { firestoreRequest } from '../db/firestoreApi';

// Same api.get/post/put/delete(url) surface every page already calls — only the transport
// underneath changed, from IndexedDB (db/localApi.ts) to Firestore (db/firestoreApi.ts).
export const api = {
  get: <T>(url: string) => firestoreRequest<T>('GET', url),
  post: <T>(url: string, data?: unknown) => firestoreRequest<T>('POST', url, data),
  put: <T>(url: string, data?: unknown) => firestoreRequest<T>('PUT', url, data),
  delete: <T>(url: string) => firestoreRequest<T>('DELETE', url),
};
