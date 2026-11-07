import api from './api';

export const getPurchaseConfiguration = async (signal) => (
  await api.get('/admin/purchases/configuration', { signal })
).data.data;

export const searchPurchaseRecords = async (kind, search, signal) => {
  if (!['suppliers', 'products'].includes(kind)) throw new Error('Invalid lookup');
  return (await api.get(`/admin/purchases/${kind}`, {
    params: { search },
    signal,
  })).data.data;
};

export const previewPurchase = async (body) => (
  await api.post('/admin/purchases/preview', body, { timeout: 180000 })
).data.data;

export const savePurchase = async (token) => (
  await api.post('/admin/purchases/save', { token }, { timeout: 120000 })
).data.data;

export const getPurchaseStatus = async (token) => (
  await api.get(`/admin/purchases/requests/${encodeURIComponent(token)}`, {
    timeout: 60000,
  })
).data.data;

export const getPurchasePdf = async (token) => (
  await api.post(`/admin/purchases/requests/${encodeURIComponent(token)}/pdf`, {}, {
    responseType: 'blob',
    timeout: 90000,
  })
).data;