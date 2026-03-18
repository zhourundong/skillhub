import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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
};

export const channelsApi = {
  list: () => api.get('/channels').then(r => r.data),
  create: (data) => api.post('/channels', data).then(r => r.data),
  update: (id, data) => api.put(`/channels/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/channels/${id}`).then(r => r.data),
  test: (id) => api.post(`/channels/${id}/test`).then(r => r.data),
};
