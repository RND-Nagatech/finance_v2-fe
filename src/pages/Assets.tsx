import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BarChart3, Coins, LineChart, Minus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '@/api/axiosInstance';
import {
  createAsset,
  deleteAsset,
  fetchAssetLedgerHistory,
  fetchAssets,
  fetchAssetSummary,
  fetchAssetTransfers,
  fetchAssetTypePriceHistory,
  fetchAssetTypes,
  reduceAssetStock,
  transferAssetToRekening,
  transferRekeningToAsset,
  updateAssetTypeCurrentPrice,
  type AssetItem,
  type AssetLedger,
  type AssetTransfer,
  type AssetTypePriceHistory,
  type AssetType,
} from '@/api/assets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Perusahaan {
  _id: string;
  nama_perusahaan: string;
}

interface RekeningOption {
  _id: string;
  kode_bank?: string;
  no_rekening: string;
  nama_rekening?: string;
  saldo?: number;
}

const currency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const numberFmt = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(Number(value || 0));
const rupiahInput = (value: string | number) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `Rp ${new Intl.NumberFormat('id-ID').format(Number(digits))}` : '';
};
const rupiahValue = (value: string) => value.replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);

export default function Assets() {
  const queryClient = useQueryClient();
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [reduceDialogOpen, setReduceDialogOpen] = useState(false);
  const [rekeningToAssetOpen, setRekeningToAssetOpen] = useState(false);
  const [assetToRekeningOpen, setAssetToRekeningOpen] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AssetType | null>(null);
  const [deleteAssetItem, setDeleteAssetItem] = useState<AssetItem | null>(null);
  const [assetForm, setAssetForm] = useState({ asset_type_id: '', asset_name: '', perusahaan_id: 'none', qty: '', harga_beli_per_unit: '' });
  const [reduceForm, setReduceForm] = useState({ asset_id: '', qty: '', unit_price: '', tanggal: today(), keterangan: '' });
  const [rekeningToAssetForm, setRekeningToAssetForm] = useState({ rekening_id: '', asset_id: '', nominal: '', unit_price: '', asset_qty: '', tanggal: today(), keterangan: '' });
  const [assetToRekeningForm, setAssetToRekeningForm] = useState({ asset_id: '', rekening_id: '', nominal: '', unit_price: '', asset_qty: '', tanggal: today(), keterangan: '' });
  const [priceText, setPriceText] = useState('');
  const [priceNote, setPriceNote] = useState('');

  const { data: assetTypes = [] } = useQuery({ queryKey: ['asset-types'], queryFn: fetchAssetTypes });
  const { data: assets = [], isLoading } = useQuery({ queryKey: ['assets'], queryFn: fetchAssets });
  const { data: summary } = useQuery({ queryKey: ['assets-summary'], queryFn: fetchAssetSummary });
  const { data: assetLedgerHistory = [] } = useQuery({ queryKey: ['asset-ledger-history'], queryFn: fetchAssetLedgerHistory });
  const { data: assetTransfers = [] } = useQuery({ queryKey: ['asset-transfers'], queryFn: fetchAssetTransfers });
  const { data: priceHistory = [] } = useQuery({ queryKey: ['asset-type-price-history'], queryFn: () => fetchAssetTypePriceHistory() });
  const { data: rekeningList = [] } = useQuery({
    queryKey: ['rekening-all'],
    queryFn: async () => {
      const res = await axiosInstance.get('/master/rekening?all=true');
      return res.data || [];
    },
  });
  const { data: perusahaanList = [] } = useQuery({
    queryKey: ['perusahaan-all'],
    queryFn: async () => {
      const res = await axiosInstance.get('/master/perusahaan?all=true');
      return res.data || [];
    },
  });

  const typeLookup = useMemo(() => {
    const map = new Map<string, AssetType>();
    assetTypes.forEach((item) => map.set(item._id, item));
    return map;
  }, [assetTypes]);

  const resolveAssetType = (asset: AssetItem) => {
    if (asset.asset_type && typeof asset.asset_type === 'object') return asset.asset_type;
    if (asset.asset_type_id && typeof asset.asset_type_id === 'object') return asset.asset_type_id as AssetType;
    return typeLookup.get(String(asset.asset_type_id || ''));
  };

  const invalidateAssetData = () => {
    queryClient.invalidateQueries({ queryKey: ['assets'] });
    queryClient.invalidateQueries({ queryKey: ['assets-summary'] });
    queryClient.invalidateQueries({ queryKey: ['asset-ledger-history'] });
    queryClient.invalidateQueries({ queryKey: ['asset-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
    queryClient.invalidateQueries({ queryKey: ['rekeningList'] });
  };

  const selectedReduceAsset = assets.find((asset) => asset._id === reduceForm.asset_id);
  const selectedRekeningToAsset = assets.find((asset) => asset._id === rekeningToAssetForm.asset_id);
  const selectedAssetToRekening = assets.find((asset) => asset._id === assetToRekeningForm.asset_id);
  const selectedReduceAssetType = selectedReduceAsset ? resolveAssetType(selectedReduceAsset) : undefined;
  const totalGrowthClass = Number(summary?.growth_nominal || 0) >= 0 ? 'text-emerald-700' : 'text-red-700';

  const resolveLedgerTone = (row: AssetLedger) => {
    if (row.movement_type === 'OUT') return 'text-red-700';
    if (row.movement_type === 'ROLLBACK') return 'text-blue-700';
    return 'text-emerald-700';
  };

  const setTransferDefaults = (asset: AssetItem | undefined, setter: (updater: any) => void) => {
    if (!asset) return;
    const unitPrice = Number(asset.current_price || asset.harga_beli_per_unit || 0);
    setter((prev: any) => ({ ...prev, asset_id: asset._id, unit_price: unitPrice ? String(unitPrice) : prev.unit_price }));
  };

  const createAssetMut = useMutation({
    mutationFn: () => createAsset({
      asset_type_id: assetForm.asset_type_id,
      asset_name: assetForm.asset_name,
      perusahaan_id: assetForm.perusahaan_id === 'none' ? undefined : assetForm.perusahaan_id,
      qty: Number(assetForm.qty || 0),
      harga_beli_per_unit: Number(assetForm.harga_beli_per_unit || 0),
    }),
    onSuccess: () => {
      invalidateAssetData();
      toast.success('Asset berhasil ditambahkan');
      setAssetDialogOpen(false);
      setAssetForm({ asset_type_id: '', asset_name: '', perusahaan_id: 'none', qty: '', harga_beli_per_unit: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal menambah asset'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => {
      invalidateAssetData();
      toast.success('Asset berhasil dinonaktifkan');
      setDeleteAssetItem(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal hapus asset'),
  });

  const updatePriceMut = useMutation({
    mutationFn: () => updateAssetTypeCurrentPrice(selectedType!._id, Number(priceText || 0), priceNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-types'] });
      queryClient.invalidateQueries({ queryKey: ['asset-type-price-history'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets-summary'] });
      toast.success('Harga sekarang berhasil diperbarui');
      setPriceDialogOpen(false);
      setSelectedType(null);
      setPriceText('');
      setPriceNote('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal update harga sekarang'),
  });

  const reduceMut = useMutation({
    mutationFn: () => reduceAssetStock({
      asset_id: reduceForm.asset_id,
      qty: Number(reduceForm.qty || 0),
      unit_price: Number(reduceForm.unit_price || 0),
      tanggal: reduceForm.tanggal,
      keterangan: reduceForm.keterangan,
    }),
    onSuccess: () => {
      invalidateAssetData();
      toast.success('Pengurangan asset berhasil dicatat');
      setReduceDialogOpen(false);
      setReduceForm({ asset_id: '', qty: '', unit_price: '', tanggal: today(), keterangan: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal mengurangi asset'),
  });

  const rekeningToAssetMut = useMutation({
    mutationFn: () => transferRekeningToAsset({
      rekening_id: rekeningToAssetForm.rekening_id,
      asset_id: rekeningToAssetForm.asset_id,
      nominal: Number(rekeningToAssetForm.nominal || 0),
      unit_price: Number(rekeningToAssetForm.unit_price || 0),
      asset_qty: Number(rekeningToAssetForm.asset_qty || 0),
      tanggal: rekeningToAssetForm.tanggal,
      keterangan: rekeningToAssetForm.keterangan,
    }),
    onSuccess: () => {
      invalidateAssetData();
      toast.success('Transfer rekening ke asset berhasil');
      setRekeningToAssetOpen(false);
      setRekeningToAssetForm({ rekening_id: '', asset_id: '', nominal: '', unit_price: '', asset_qty: '', tanggal: today(), keterangan: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal transfer rekening ke asset'),
  });

  const assetToRekeningMut = useMutation({
    mutationFn: () => transferAssetToRekening({
      asset_id: assetToRekeningForm.asset_id,
      rekening_id: assetToRekeningForm.rekening_id,
      nominal: Number(assetToRekeningForm.nominal || 0),
      unit_price: Number(assetToRekeningForm.unit_price || 0),
      asset_qty: Number(assetToRekeningForm.asset_qty || 0),
      tanggal: assetToRekeningForm.tanggal,
      keterangan: assetToRekeningForm.keterangan,
    }),
    onSuccess: () => {
      invalidateAssetData();
      toast.success('Transfer asset ke rekening berhasil');
      setAssetToRekeningOpen(false);
      setAssetToRekeningForm({ asset_id: '', rekening_id: '', nominal: '', unit_price: '', asset_qty: '', tanggal: today(), keterangan: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal transfer asset ke rekening'),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createAssetMut.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Asset Investasi</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola emas, mata uang asing, dan asset lain dengan valuasi harga sekarang.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2"><Link to="/assets/types"><Plus className="h-4 w-4" />Jenis Asset</Link></Button>
          <Button variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setReduceDialogOpen(true)}><Minus className="h-4 w-4" />Pengurangan Asset</Button>
          <Button onClick={() => setAssetDialogOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Tambah Asset</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-slate-600"><Coins className="h-4 w-4" />Total Harga Beli</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-slate-950">{currency(summary?.total_harga_beli || 0)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-slate-600"><BarChart3 className="h-4 w-4" />Total Harga Sekarang</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-slate-950">{currency(summary?.total_harga_sekarang || 0)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-slate-600"><LineChart className="h-4 w-4" />Growth</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totalGrowthClass}`}>{currency(summary?.growth_nominal || 0)}</div><div className="text-sm text-slate-500">{numberFmt(summary?.growth_percent || 0)}%</div></CardContent></Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle>Daftar Asset</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Jenis</TableHead><TableHead>Qty</TableHead><TableHead>Harga Beli</TableHead><TableHead>Harga Sekarang</TableHead><TableHead>Growth</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-500">Memuat data...</TableCell></TableRow>
                ) : assets.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-500">Belum ada asset.</TableCell></TableRow>
                ) : assets.map((asset) => {
                  const type = resolveAssetType(asset);
                  const growth = Number(asset.growth_nominal || 0);
                  return (
                    <TableRow key={asset._id}>
                      <TableCell><div className="font-semibold">{asset.asset_name}</div><div className="text-xs text-slate-500">{asset.asset_code} - {asset.nama_perusahaan || 'Tanpa perusahaan'}</div></TableCell>
                      <TableCell>{type?.name || '-'}</TableCell>
                      <TableCell>{numberFmt(asset.qty)} {type?.unit || asset.unit || ''}</TableCell>
                      <TableCell><div>{currency(asset.total_harga_beli || 0)}</div><div className="text-xs text-slate-500">{currency(asset.harga_beli_per_unit)} / {type?.unit || '-'}</div></TableCell>
                      <TableCell><div>{currency(asset.total_harga_sekarang || 0)}</div><div className="text-xs text-slate-500">{currency(asset.current_price || 0)} / {type?.unit || '-'}</div></TableCell>
                      <TableCell className={growth >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{currency(growth)}<div className="text-xs">{numberFmt(asset.growth_percent || 0)}%</div></TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDeleteAssetItem(asset)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Harga Sekarang</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {assetTypes.length === 0 ? (
              <div className="text-sm text-slate-500">Belum ada jenis asset.</div>
            ) : assetTypes.map((type) => (
              <div key={type._id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-semibold">{type.name}</div>
                  <div className="text-xs text-slate-500">{currency(type.current_price)} / {type.unit}</div>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                  setSelectedType(type);
                  setPriceText(String(type.current_price || 0));
                  setPriceNote('');
                  setPriceDialogOpen(true);
                }}>
                  <RefreshCw className="h-4 w-4" />
                  Update
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>History Harga Sekarang</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Jenis Asset</TableHead><TableHead>Harga Lama</TableHead><TableHead>Harga Baru</TableHead><TableHead>Update By</TableHead></TableRow></TableHeader>
              <TableBody>
                {priceHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-500">Belum ada history update harga.</TableCell></TableRow>
                ) : priceHistory.slice(0, 10).map((row: AssetTypePriceHistory) => (
                  <TableRow key={row._id}>
                    <TableCell>{row.changed_at ? new Date(row.changed_at).toLocaleString('id-ID') : '-'}</TableCell>
                    <TableCell><div className="font-medium">{row.name}</div><div className="text-xs text-slate-500">{row.code} / {row.unit}</div></TableCell>
                    <TableCell>{currency(row.old_price)}</TableCell>
                    <TableCell className="font-semibold text-emerald-700">{currency(row.new_price)}</TableCell>
                    <TableCell><div className="font-medium">{row.changed_by || '-'}</div>{row.keterangan && <div className="max-w-[180px] truncate text-xs text-slate-500">{row.keterangan}</div>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>History Movement Asset</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Asset</TableHead><TableHead>Movement</TableHead><TableHead>Qty</TableHead><TableHead>Harga</TableHead><TableHead>Total</TableHead><TableHead>Ref</TableHead></TableRow></TableHeader>
              <TableBody>
                {assetLedgerHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-500">Belum ada movement asset.</TableCell></TableRow>
                ) : assetLedgerHistory.slice(0, 10).map((row: AssetLedger) => (
                  <TableRow key={row._id}>
                    <TableCell>{row.tanggal || (row.created_at ? new Date(row.created_at).toLocaleDateString('id-ID') : '-')}</TableCell>
                    <TableCell><div className="font-medium">{row.asset_name || '-'}</div><div className="text-xs text-slate-500">{row.asset_code || '-'}</div></TableCell>
                    <TableCell className={`font-semibold ${resolveLedgerTone(row)}`}>{row.movement_type}</TableCell>
                    <TableCell>{numberFmt(row.qty_delta)} {row.unit}</TableCell>
                    <TableCell>{currency(row.unit_price_snapshot || 0)}</TableCell>
                    <TableCell>{currency(Math.abs(Number(row.qty_delta || 0)) * Number(row.unit_price_snapshot || 0))}</TableCell>
                    <TableCell><div className="text-xs font-medium text-slate-700">{row.ref_type || '-'}</div><div className="max-w-[180px] truncate text-xs text-slate-500">{row.keterangan || '-'}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Asset</DialogTitle>
            <DialogDescription>Qty awal akan dicatat sebagai saldo awal asset.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-2"><Label>Jenis Asset</Label><Select value={assetForm.asset_type_id} onValueChange={(value) => setAssetForm({ ...assetForm, asset_type_id: value })}><SelectTrigger><SelectValue placeholder="Pilih jenis asset" /></SelectTrigger><SelectContent>{assetTypes.map((type) => <SelectItem key={type._id} value={type._id}>{type.name} ({type.unit})</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Nama Asset</Label><Input value={assetForm.asset_name} onChange={(e) => setAssetForm({ ...assetForm, asset_name: e.target.value })} placeholder="Emas Antam" required /></div>
            <div className="grid gap-2"><Label>Perusahaan</Label><Select value={assetForm.perusahaan_id} onValueChange={(value) => setAssetForm({ ...assetForm, perusahaan_id: value })}><SelectTrigger><SelectValue placeholder="Pilih perusahaan" /></SelectTrigger><SelectContent><SelectItem value="none">Tanpa perusahaan</SelectItem>{(perusahaanList as Perusahaan[]).map((p) => <SelectItem key={p._id} value={p._id}>{p.nama_perusahaan}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Qty Awal</Label><Input type="number" min="0" step="any" value={assetForm.qty} onChange={(e) => setAssetForm({ ...assetForm, qty: e.target.value })} placeholder="700" /></div>
              <div className="grid gap-2">
                <Label>Harga Beli / Satuan</Label>
                <Input
                  inputMode="numeric"
                  value={rupiahInput(assetForm.harga_beli_per_unit)}
                  onChange={(e) => setAssetForm({ ...assetForm, harga_beli_per_unit: rupiahValue(e.target.value) })}
                  placeholder="Rp 0"
                />
              </div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setAssetDialogOpen(false)}>Batal</Button><Button type="submit" disabled={createAssetMut.isPending}>Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reduceDialogOpen} onOpenChange={setReduceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengurangan Asset</DialogTitle>
            <DialogDescription>Gunakan untuk mengeluarkan stok asset. Jurnal uangnya tetap dicatat dari menu Transaksi.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); reduceMut.mutate(); }} className="space-y-4">
            <div className="grid gap-2"><Label>Asset</Label><Select value={reduceForm.asset_id} onValueChange={(value) => {
              const asset = assets.find((item) => item._id === value);
              const type = asset ? resolveAssetType(asset) : undefined;
              setReduceForm((prev) => ({ ...prev, asset_id: value, unit_price: String(type?.current_price || asset?.current_price || asset?.harga_beli_per_unit || prev.unit_price || '') }));
            }}><SelectTrigger><SelectValue placeholder="Pilih asset" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset._id} value={asset._id}>{asset.asset_code} - {asset.asset_name} ({numberFmt(asset.qty)} {resolveAssetType(asset)?.unit || asset.unit || ''})</SelectItem>)}</SelectContent></Select>{selectedReduceAsset && <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">Qty saat ini: <span className="font-semibold">{numberFmt(selectedReduceAsset.qty)} {selectedReduceAssetType?.unit || selectedReduceAsset.unit || ''}</span></div>}</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Qty Keluar</Label><Input type="number" min="0" step="any" value={reduceForm.qty} onChange={(e) => setReduceForm({ ...reduceForm, qty: e.target.value })} required /></div>
              <div className="grid gap-2">
                <Label>Harga per Unit</Label>
                <Input
                  inputMode="numeric"
                  value={rupiahInput(reduceForm.unit_price)}
                  onChange={(e) => setReduceForm({ ...reduceForm, unit_price: rupiahValue(e.target.value) })}
                  placeholder="Rp 0"
                  required
                />
              </div>
            </div>
            {Number(reduceForm.qty || 0) > 0 && Number(reduceForm.unit_price || 0) > 0 && (
              <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                Nilai keluar: <span className="font-semibold">{currency(Number(reduceForm.qty || 0) * Number(reduceForm.unit_price || 0))}</span>
              </div>
            )}
            <div className="grid gap-2"><Label>Tanggal</Label><Input type="date" value={reduceForm.tanggal} onChange={(e) => setReduceForm({ ...reduceForm, tanggal: e.target.value })} required /></div>
            <div className="grid gap-2"><Label>Keterangan</Label><Input value={reduceForm.keterangan} onChange={(e) => setReduceForm({ ...reduceForm, keterangan: e.target.value })} placeholder="Contoh: Penjualan asset, stok keluar" /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setReduceDialogOpen(false)}>Batal</Button><Button type="submit" disabled={reduceMut.isPending}>Simpan Pengurangan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Harga Sekarang</DialogTitle>
            <DialogDescription>{selectedType?.name} per {selectedType?.unit}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Harga Sekarang</Label>
            <Input
              inputMode="numeric"
              value={rupiahInput(priceText)}
              onChange={(e) => setPriceText(rupiahValue(e.target.value))}
              placeholder="Rp 0"
            />
          </div>
          <div className="grid gap-2 py-2">
            <Label>Keterangan</Label>
            <Input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="Opsional" />
          </div>
          <DialogFooter><Button onClick={() => updatePriceMut.mutate()} disabled={!selectedType || updatePriceMut.isPending}>Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rekeningToAssetOpen} onOpenChange={setRekeningToAssetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Rekening ke Asset</DialogTitle></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); rekeningToAssetMut.mutate(); }} className="space-y-4">
            <div className="grid gap-2"><Label>Rekening Sumber</Label><Select value={rekeningToAssetForm.rekening_id} onValueChange={(value) => setRekeningToAssetForm({ ...rekeningToAssetForm, rekening_id: value })}><SelectTrigger><SelectValue placeholder="Pilih rekening sumber" /></SelectTrigger><SelectContent>{(rekeningList as RekeningOption[]).map((r) => <SelectItem key={r._id} value={r._id}>{r.kode_bank || '-'} - {r.no_rekening} - {r.nama_rekening || '-'} ({currency(r.saldo || 0)})</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Asset Tujuan</Label><Select value={rekeningToAssetForm.asset_id} onValueChange={(value) => {
              const asset = assets.find((item) => item._id === value);
              setTransferDefaults(asset, setRekeningToAssetForm);
            }}><SelectTrigger><SelectValue placeholder="Pilih asset" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset._id} value={asset._id}>{asset.asset_code} - {asset.asset_name}</SelectItem>)}</SelectContent></Select>{selectedRekeningToAsset && <p className="text-xs text-slate-500">Stok saat ini: {numberFmt(selectedRekeningToAsset.qty)} {resolveAssetType(selectedRekeningToAsset)?.unit || selectedRekeningToAsset.unit || ''}</p>}</div>
            <div className="grid gap-2"><Label>Nominal</Label><Input inputMode="numeric" value={rupiahInput(rekeningToAssetForm.nominal)} onChange={(e) => setRekeningToAssetForm({ ...rekeningToAssetForm, nominal: rupiahValue(e.target.value) })} placeholder="Rp 0" required /></div>
            <div className="grid gap-2"><Label>Harga per Unit</Label><Input inputMode="numeric" value={rupiahInput(rekeningToAssetForm.unit_price)} onChange={(e) => setRekeningToAssetForm({ ...rekeningToAssetForm, unit_price: rupiahValue(e.target.value) })} placeholder="Rp 0" required /></div>
            <div className="grid gap-2"><Label>Qty Asset</Label><Input type="number" min="0" step="any" value={rekeningToAssetForm.asset_qty} onChange={(e) => setRekeningToAssetForm({ ...rekeningToAssetForm, asset_qty: e.target.value })} placeholder="Kosongkan jika mau dihitung otomatis" /></div>
            <div className="grid gap-2"><Label>Tanggal</Label><Input type="date" value={rekeningToAssetForm.tanggal} onChange={(e) => setRekeningToAssetForm({ ...rekeningToAssetForm, tanggal: e.target.value })} required /></div>
            <div className="grid gap-2"><Label>Keterangan</Label><Input value={rekeningToAssetForm.keterangan} onChange={(e) => setRekeningToAssetForm({ ...rekeningToAssetForm, keterangan: e.target.value })} placeholder="Opsional" /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRekeningToAssetOpen(false)}>Batal</Button><Button type="submit" disabled={rekeningToAssetMut.isPending}>Simpan</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assetToRekeningOpen} onOpenChange={setAssetToRekeningOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Asset ke Rekening</DialogTitle></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); assetToRekeningMut.mutate(); }} className="space-y-4">
            <div className="grid gap-2"><Label>Asset Sumber</Label><Select value={assetToRekeningForm.asset_id} onValueChange={(value) => {
              const asset = assets.find((item) => item._id === value);
              setTransferDefaults(asset, setAssetToRekeningForm);
            }}><SelectTrigger><SelectValue placeholder="Pilih asset sumber" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset._id} value={asset._id}>{asset.asset_code} - {asset.asset_name}</SelectItem>)}</SelectContent></Select>{selectedAssetToRekening && <p className="text-xs text-slate-500">Stok saat ini: {numberFmt(selectedAssetToRekening.qty)} {resolveAssetType(selectedAssetToRekening)?.unit || selectedAssetToRekening.unit || ''}</p>}</div>
            <div className="grid gap-2"><Label>Rekening Tujuan</Label><Select value={assetToRekeningForm.rekening_id} onValueChange={(value) => setAssetToRekeningForm({ ...assetToRekeningForm, rekening_id: value })}><SelectTrigger><SelectValue placeholder="Pilih rekening tujuan" /></SelectTrigger><SelectContent>{(rekeningList as RekeningOption[]).map((r) => <SelectItem key={r._id} value={r._id}>{r.kode_bank || '-'} - {r.no_rekening} - {r.nama_rekening || '-'} ({currency(r.saldo || 0)})</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Nominal</Label><Input inputMode="numeric" value={rupiahInput(assetToRekeningForm.nominal)} onChange={(e) => setAssetToRekeningForm({ ...assetToRekeningForm, nominal: rupiahValue(e.target.value) })} placeholder="Rp 0" required /></div>
            <div className="grid gap-2"><Label>Harga per Unit</Label><Input inputMode="numeric" value={rupiahInput(assetToRekeningForm.unit_price)} onChange={(e) => setAssetToRekeningForm({ ...assetToRekeningForm, unit_price: rupiahValue(e.target.value) })} placeholder="Rp 0" required /></div>
            <div className="grid gap-2"><Label>Qty Asset</Label><Input type="number" min="0" step="any" value={assetToRekeningForm.asset_qty} onChange={(e) => setAssetToRekeningForm({ ...assetToRekeningForm, asset_qty: e.target.value })} placeholder="Kosongkan jika mau dihitung otomatis" /></div>
            <div className="grid gap-2"><Label>Tanggal</Label><Input type="date" value={assetToRekeningForm.tanggal} onChange={(e) => setAssetToRekeningForm({ ...assetToRekeningForm, tanggal: e.target.value })} required /></div>
            <div className="grid gap-2"><Label>Keterangan</Label><Input value={assetToRekeningForm.keterangan} onChange={(e) => setAssetToRekeningForm({ ...assetToRekeningForm, keterangan: e.target.value })} placeholder="Opsional" /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAssetToRekeningOpen(false)}>Batal</Button><Button type="submit" disabled={assetToRekeningMut.isPending}>Simpan</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAssetItem} onOpenChange={(open) => !open && setDeleteAssetItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus Asset?</AlertDialogTitle><AlertDialogDescription>Asset akan dinonaktifkan dan tidak muncul di pilihan transaksi.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => deleteAssetItem && deleteMut.mutate(deleteAssetItem._id)} className="bg-red-600 text-white hover:bg-red-700">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
