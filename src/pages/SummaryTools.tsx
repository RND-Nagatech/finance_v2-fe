import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, DatabaseZap, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '@/api/axiosInstance';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface RebuildResult {
  source_detail_count: number;
  summary_before_count: number;
  summary_after_count: number;
  daily_count: number;
  monthly_count: number;
  yearly_count: number;
  skipped_invalid_key: number;
  rebuilt_at: string;
}

const formatNumber = (value?: number) => Number(value || 0).toLocaleString('id-ID');

export default function SummaryTools() {
  const { user } = useAppStore();
  const [result, setResult] = useState<RebuildResult | null>(null);
  const isSuperuser = user?.role === 'superuser';

  const rebuildMutation = useMutation({
    mutationFn: async () => {
      const response = await axiosInstance.post('/summary-v2/rebuild');
      return response.data.data as RebuildResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success('tt_summary_v2 berhasil direbuild.');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal rebuild tt_summary_v2.');
    },
  });

  if (!isSuperuser) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8">
          <Card className="mx-auto mt-8 max-w-2xl rounded-lg border border-red-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <CardContent className="flex flex-col items-center py-14 text-center">
              <ShieldAlert className="mb-4 h-12 w-12 text-red-600" />
              <h1 className="text-2xl font-bold text-slate-900">Akses Ditolak</h1>
              <p className="mt-2 text-slate-500">Menu rebuild summary hanya bisa dibuka oleh superuser.</p>
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
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Summary Tools</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Rebuild `tt_summary_v2` dari source of truth `tt_finance_details`.
            </p>
          </div>
        </div>

        <Card className="rounded-lg border border-amber-200 bg-amber-50/70 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <CardContent className="flex gap-4 p-5">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <h2 className="font-bold text-amber-900">Perhatian sebelum rebuild</h2>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Proses ini akan menghapus isi `tt_summary_v2`, lalu menghitung ulang dari `tt_finance_details`
                dengan aturan data valid: validated, tidak deleted, dan bukan SPECIAL. Data transaksi utama tidak diubah.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <DatabaseZap className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Rebuild tt_summary_v2</CardTitle>
                <CardDescription className="mt-1">
                  Pakai tool ini setelah import besar, perubahan master, atau saat perlu memastikan dashboard sesuai detail.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Output summary akan dipakai dashboard daily, monthly, dan yearly. Proses berjalan atomic memakai MongoDB transaction.
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={rebuildMutation.isPending}
                  className="h-11 rounded-md bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:bg-blue-700"
                >
                  {rebuildMutation.isPending ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Rebuild berjalan...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-5 w-5" />
                      Rebuild Summary
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-slate-200 bg-white shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Rebuild tt_summary_v2 sekarang?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isi `tt_summary_v2` akan dihitung ulang dari `tt_finance_details`. Data transaksi utama tidak akan dihapus atau diubah.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={rebuildMutation.isPending}>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => rebuildMutation.mutate()}
                    disabled={rebuildMutation.isPending}
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Ya, rebuild
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {result && (
          <Card className="rounded-lg border border-emerald-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <div>
                  <CardTitle>Rebuild selesai</CardTitle>
                  <CardDescription>
                    Terakhir rebuild: {new Date(result.rebuilt_at).toLocaleString('id-ID')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Detail Valid" value={result.source_detail_count} />
                <MetricCard label="Summary Sebelum" value={result.summary_before_count} />
                <MetricCard label="Summary Sesudah" value={result.summary_after_count} />
                <MetricCard label="Invalid Key Skip" value={result.skipped_invalid_key} />
                <MetricCard label="Daily" value={result.daily_count} />
                <MetricCard label="Monthly" value={result.monthly_count} />
                <MetricCard label="Yearly" value={result.yearly_count} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(value)}</p>
    </div>
  );
}
