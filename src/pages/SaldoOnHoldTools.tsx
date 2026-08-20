import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, WalletCards } from 'lucide-react';
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

interface RebuildSaldoOnHoldResult {
  pending_detail_count: number;
  pending_marked_count: number;
  rekening_updated_count: number;
}

const formatNumber = (value?: number) => Number(value || 0).toLocaleString('id-ID');

export default function SaldoOnHoldTools() {
  const queryClient = useQueryClient();
  const { user } = useAppStore();
  const [result, setResult] = useState<RebuildSaldoOnHoldResult | null>(null);
  const isSuperuser = user?.role === 'superuser';

  const rebuildMutation = useMutation({
    mutationFn: async () => {
      const response = await axiosInstance.post('/master/rekening/rebuild-saldo-on-hold');
      return response.data.data as RebuildSaldoOnHoldResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
      toast.success('Saldo on hold berhasil direbuild.');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal rebuild saldo on hold.');
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
              <p className="mt-2 text-slate-500">Menu saldo on hold hanya bisa dibuka oleh superuser.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-8 px-5 pb-8 pt-0 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Saldo On Hold</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Rebuild saldo pending rekening dari transaksi yang belum divalidasi.
          </p>
        </div>

        <Card className="rounded-lg border border-amber-200 bg-amber-50/70 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <CardContent className="flex gap-4 p-5">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <h2 className="font-bold text-amber-900">Gunakan untuk sinkronisasi pending lama</h2>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Proses ini menghitung ulang `saldo_on_hold` dari transaksi belum valid, belum deleted, dan masih memengaruhi rekening.
                `saldo` valid tidak diubah.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <WalletCards className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Rebuild saldo_on_hold</CardTitle>
                <CardDescription className="mt-1">
                  Jalankan sekali setelah fitur ini deploy, atau saat perlu audit ulang nilai pending rekening.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Sistem akan reset `saldo_on_hold` semua rekening ke 0, menghitung ulang dari transaksi pending, lalu menandai transaksi tersebut sudah masuk hold.
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
                      Rebuild Saldo On Hold
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-slate-200 bg-white shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Rebuild saldo_on_hold sekarang?</AlertDialogTitle>
                  <AlertDialogDescription>
                    `saldo` rekening tidak akan diubah. Hanya `saldo_on_hold` yang dihitung ulang dari transaksi belum valid.
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
                  <CardDescription>Saldo on hold rekening sudah disinkronkan.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard label="Pending Dihitung" value={result.pending_detail_count} />
                <MetricCard label="Pending Ditandai" value={result.pending_marked_count} />
                <MetricCard label="Rekening Update" value={result.rekening_updated_count} />
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
