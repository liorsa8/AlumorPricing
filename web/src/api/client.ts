import { localRequest } from '../db/localApi';

// Same api.get/post/put/delete(url) surface every page already calls — only the transport
// underneath changed, from an HTTP fetch to a local server, to a call straight into the
// in-browser IndexedDB-backed data layer (see db/localApi.ts). No page had to change.
export const api = {
  get: <T>(url: string) => localRequest<T>('GET', url),
  post: <T>(url: string, data?: unknown) => localRequest<T>('POST', url, data),
  put: <T>(url: string, data?: unknown) => localRequest<T>('PUT', url, data),
  delete: <T>(url: string) => localRequest<T>('DELETE', url),
};
