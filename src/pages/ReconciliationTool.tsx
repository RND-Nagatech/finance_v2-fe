import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Scale, ShieldAlert } from 'lucide-react';
import axiosInstance from '@/api/axiosInstance';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ReconciliationRow = {
  period_type: 'DAILY' | 'MONTHLY' | 'YEARLY';
  period_start: string;
  tahun_fiskal: number;
  bulan_fiskal?: number;
  bulan_fiskal_label?: string;
  kategori: string;
  sub_kategori: string;
  akun: string;
  detail_total: number;
  summary_total: number;
  selisih: number;
  detail_count: number;
  summary_count: number;
  summary_document_count: number;
  status: string;
};

type ReconciliationResult = {
  checked_at: string;
  source_detail_count: number;
  summary_document_count: number;
  skipped_invalid_key: number;
  mismatch_count: number;
  status_counts: Record<string, number>;
  rows: ReconciliationRow[];
  limit: number;
};

const formatNumber = (value?: number) => Number(value || 0).toLocaleString('id-ID');
const formatCurrency = (value?: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const statusClass: Record<string, string> = {
  MATCH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MISSING_SUMMARY: 'bg-amber-50 text-amber-700 border-amber-200',
  SUMMARY_GREATER_THAN_DETAIL: 'bg-red-50 text-red-700 border-red-200',
  DETAIL_GREATER_THAN_SUMMARY: 'bg-orange-50 text-orange-700 border-orange-200',
  DUPLICATE_SUMMARY: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function ReconciliationTool() {
  const { user } = useAppStore();
  const [enabled, setEnabled] = useState(false);
  const [search, setSearch] = useState('');
  const isSuperuser = user?.role === 'superuser';

  const { data, isFetching, error, refetch } = useQuery<ReconciliationResult>({
    queryKey: ['summary-v2-reconciliation'],
    queryFn: async () => {
      const response = await axiosInstance.get('/summary-v2/reconciliation?limit=1000');
      return response.data.data;
    },
    enabled: enabled && isSuperuser,
  });

  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) => (
      [
        row.period_type,
        row.period_start,
        row.tahun_fiskal,
        row.bulan_fiskal_label,
        row.kategori,
        row.sub_kategori,
        row.akun,
        row.status,
      ].join(' ').toUpperCase().includes(q)
    ));
  }, [data, search]);

  const runAudit = () => {
    setEnabled(true);
    refetch();
  };

  if (!isSuperuser) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8">
          <Card className="mx-auto mt-8 max-w-2xl rounded-lg border border-red-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <CardContent className="flex flex-col items-center py-14 text-center">
              <ShieldAlert className="mb-4 h-12 w-12 text-red-600" />
              <h1 className="text-2xl font-bold text-slate-900">Akses Ditolak</h1>
              <p className="mt-2 text-slate-500">Menu reconciliation hanya bisa dibuka oleh superuser.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Reconciliation Tool</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Audit read-only `tt_finance_details` vs `tt_summary_v2`.
            </p>
          </div>
          <Button
            type="button"
            onClick={runAudit}
            disabled={isFetching}
            className="h-11 rounded-md bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:bg-blue-700"
          >
            {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            {isFetching ? 'Menjalankan audit...' : 'Run Reconciliation'}
          </Button>
        </div>

        <Card className="rounded-lg border border-blue-200 bg-blue-50/70 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <CardContent className="flex gap-4 p-5">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-blue-700" />
            <div>
              <h2 className="font-bold text-blue-950">Read-only audit</h2>
              <p className="mt-1 text-sm leading-6 text-blue-800">
                Tool ini tidak mengubah database. Hasil mismatch dipakai untuk memastikan summary dashboard sama dengan detail valid.
              </p>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="rounded-lg border border-red-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <CardContent className="py-5 text-sm text-red-600">Gagal menjalankan reconciliation.</CardContent>
          </Card>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard label="Detail Valid" value={data.source_detail_count} />
              <MetricCard label="Summary Docs" value={data.summary_document_count} />
              <MetricCard label="Mismatch" value={data.mismatch_count} tone={data.mismatch_count > 0 ? 'red' : 'green'} />
              <MetricCard label="Invalid Key Skip" value={data.skipped_invalid_key} />
              <MetricCard label="Limit Rows" value={data.limit} />
            </div>

            <Card className="rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>Mismatch Detail</CardTitle>
                    <CardDescription>
                      Last checked: {new Date(data.checked_at).toLocaleString('id-ID')}
                    </CardDescription>
                  </div>
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Cari kategori / akun / status"
                    className="h-12 max-w-md rounded-md border-slate-200 bg-white px-4 text-[15px] shadow-none outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {data.mismatch_count === 0 ? (
                  <div className="flex flex-col items-center py-14 text-center">
                    <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-600" />
                    <h3 className="text-xl font-bold text-slate-900">Summary sudah match</h3>
                    <p className="mt-1 text-slate-500">Tidak ada mismatch antara detail valid dan summary v2.</p>
                  </div>
                ) : (
                  <div className="overflow-auto rounded-lg border border-slate-200">
                    <Table className="min-w-[1200px]">
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead>Period</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>Tahun</TableHead>
                          <TableHead>Bulan</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Sub Kategori</TableHead>
                          <TableHead>Akun</TableHead>
                          <TableHead className="text-right">Detail</TableHead>
                          <TableHead className="text-right">Summary</TableHead>
                          <TableHead className="text-right">Selisih</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.map((row, index) => (
                          <TableRow key={`${row.period_type}-${row.period_start}-${row.kategori}-${row.sub_kategori}-${row.akun}-${index}`}>
                            <TableCell className="font-semibold">{row.period_type}</TableCell>
                            <TableCell>{String(row.period_start).slice(0, 10)}</TableCell>
                            <TableCell>{row.tahun_fiskal}</TableCell>
                            <TableCell>{row.bulan_fiskal_label || '-'}</TableCell>
                            <TableCell>{row.kategori}</TableCell>
                            <TableCell>{row.sub_kategori}</TableCell>
                            <TableCell>{row.akun}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.detail_total)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.summary_total)}</TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(row.selisih)}</TableCell>
                            <TableCell>
                              <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${statusClass[row.status] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                {row.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Scale className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Belum ada hasil audit</h2>
              <p className="mt-2 max-w-2xl text-slate-500">
                Klik `Run Reconciliation` untuk membandingkan detail valid dengan summary v2.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'red' | 'green' }) {
  const colorClass = tone === 'red'
    ? 'border-red-200 bg-red-50 text-red-700'
    : tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-white text-slate-950';
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${colorClass}`}>
      <p className="text-xs font-semibold uppercase opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-extrabold">{formatNumber(value)}</p>
    </div>
  );
}
