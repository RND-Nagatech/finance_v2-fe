import axiosInstance from './axiosInstance';

export async function fetchFiscalYears() {
  const res = await axiosInstance.get('/fiscal/years');
  // backend may return { years: [...] } or an array directly
  return res.data?.years ?? res.data ?? [];
}

export async function fetchFiscalMonths(tahun: number | string) {
  const res = await axiosInstance.get(`/fiscal/months?tahun=${tahun}`);
  return res.data?.months ?? res.data ?? [];
}

export async function fetchActiveFiscalYear() {
  const res = await axiosInstance.get('/fiscal/active');
  return res.data?.activeYear ?? null;
}
