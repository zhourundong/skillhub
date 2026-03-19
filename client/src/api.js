import axios from 'axios';
import { clearAuthSession, getStoredToken } from './utils/authStorage';

const api = axios.create({ baseURL: '/api' });

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
      // Only redirect to login if user was trying to access protected routes
      // Public routes like viewing skills should not redirect
      const protectedPaths = ['/channels', '/users'];
      const isProtectedRoute = protectedPaths.some(p => window.location.pathname.startsWith(p));
      if (isProtectedRoute) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  changePassword: (oldPassword, newPassword) => api.put('/auth/password', { oldPassword, newPassword }).then(r => r.data),
};

export const usersApi = {
  list: (params) => api.get('/users', { params }).then(r => r.data),
  create: (data) => api.post('/users', data).then(r => r.data),
  update: (id, data) => api.put(`/users/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/users/${id}`).then(r => r.data),
  resetPassword: (id, newPassword) => api.put(`/users/${id}/reset-password`, { newPassword }).then(r => r.data),
};

export const skillsApi = {
  list: (params) => api.get('/skills', { params }).then(r => r.data),
  get: (id) => api.get(`/skills/${id}`).then(r => r.data),
  getRaw: (id) => fetch(`/api/skills/${id}/raw`).then(r => r.text()),
  create: (data) => api.post('/skills', data).then(r => r.data),
  update: (id, data) => api.put(`/skills/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/skills/${id}`).then(r => r.data),
  publish: (id, channelId) => api.post(`/skills/${id}/publish`, { channelId }).then(r => r.data),
  unpublish: (id) => api.post(`/skills/${id}/unpublish`).then(r => r.data),
  records: (id) => api.get(`/skills/${id}/records`).then(r => r.data),
  importZip: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/skills/import-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },

  // Assets
  listAssets: (id) => api.get(`/skills/${id}/assets`).then(r => r.data),
  uploadAsset: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/skills/${id}/assets`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  deleteAsset: (id, filename) => api.delete(`/skills/${id}/assets/${encodeURIComponent(filename)}`).then(r => r.data),

  // Scripts
  listScripts: (id) => api.get(`/skills/${id}/scripts`).then(r => r.data),
  getScript: (id, filename) => api.get(`/skills/${id}/scripts/${encodeURIComponent(filename)}`).then(r => r.data),
  saveScript: (id, filename, content) => api.put(`/skills/${id}/scripts/${encodeURIComponent(filename)}`, { content }).then(r => r.data),
  deleteScript: (id, filename) => api.delete(`/skills/${id}/scripts/${encodeURIComponent(filename)}`).then(r => r.data),

  // References
  listReferences: (id) => api.get(`/skills/${id}/references`).then(r => r.data),
  getReference: (id, filename) => api.get(`/skills/${id}/references/${encodeURIComponent(filename)}`).then(r => r.data),
  saveReference: (id, filename, content) => api.put(`/skills/${id}/references/${encodeURIComponent(filename)}`, { content }).then(r => r.data),
  deleteReference: (id, filename) => api.delete(`/skills/${id}/references/${encodeURIComponent(filename)}`).then(r => r.data),

  // Custom Directories
  listCustomDirs: (id) => api.get(`/skills/${id}/custom-dirs`).then(r => r.data),
  createCustomDir: (id, data) => api.post(`/skills/${id}/custom-dirs`, data).then(r => r.data),
  renameCustomDir: (id, dirId, name) => api.put(`/skills/${id}/custom-dirs/${dirId}`, { name }).then(r => r.data),
  deleteCustomDir: (id, dirId) => api.delete(`/skills/${id}/custom-dirs/${dirId}`).then(r => r.data),
  listCustomDirFiles: (id, dirPath) => api.get(`/skills/${id}/custom-dirs/${encodeURIComponent(dirPath)}/files`).then(r => r.data),
  getCustomFile: (id, filePath) => api.get(`/skills/${id}/custom-files/${encodeURIComponent(filePath)}`).then(r => r.data),
  saveCustomFile: (id, filePath, content) => api.put(`/skills/${id}/custom-files/${encodeURIComponent(filePath)}`, { content }).then(r => r.data),
  deleteCustomFile: (id, filePath) => api.delete(`/skills/${id}/custom-files/${encodeURIComponent(filePath)}`).then(r => r.data),
  uploadCustomFile: (id, dirPath, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/skills/${id}/custom-dirs/${encodeURIComponent(dirPath)}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
};

export const channelsApi = {
  list: () => api.get('/channels').then(r => r.data),
  create: (data) => api.post('/channels', data).then(r => r.data),
  update: (id, data) => api.put(`/channels/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/channels/${id}`).then(r => r.data),
  test: (id) => api.post(`/channels/${id}/test`).then(r => r.data),
  testConfig: (type, config) => api.post('/channels/test-config', { type, config }).then(r => r.data),
};
