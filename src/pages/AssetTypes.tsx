import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { createAssetType, deleteAssetType, fetchAssetTypes, updateAssetType, type AssetType } from '@/api/assets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const currency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const rupiahInput = (value: string | number) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `Rp ${new Intl.NumberFormat('id-ID').format(Number(digits))}` : '';
};
const rupiahValue = (value: string) => value.replace(/\D/g, '');
const emptyForm = { code: '', name: '', unit: '', current_price: '' };

export default function AssetTypes() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<AssetType | null>(null);
  const [deleteItem, setDeleteItem] = useState<AssetType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const { data: assetTypes = [], isLoading } = useQuery({ queryKey: ['asset-types'], queryFn: fetchAssetTypes });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assetTypes;
    return assetTypes.filter((item) => `${item.code} ${item.name} ${item.unit}`.toLowerCase().includes(q));
  }, [assetTypes, search]);

  const reset = () => {
    setDialogOpen(false);
    setEditItem(null);
    setForm(emptyForm);
  };

  const openEdit = (item: AssetType) => {
    setEditItem(item);
    setForm({ code: item.code || '', name: item.name || '', unit: item.unit || '', current_price: String(item.current_price || 0) });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { code: form.code, name: form.name, unit: form.unit, current_price: Number(form.current_price || 0) };
      return editItem ? updateAssetType(editItem._id, payload) : createAssetType(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-types'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets-summary'] });
      toast.success(editItem ? 'Jenis asset berhasil diperbarui' : 'Jenis asset berhasil ditambahkan');
      reset();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal menyimpan jenis asset'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAssetType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-types'] });
      toast.success('Jenis asset berhasil dihapus');
      setDeleteItem(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Gagal menghapus jenis asset'),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-3 gap-2 px-0 text-slate-600 hover:bg-transparent">
            <Link to="/assets"><ArrowLeft className="h-4 w-4" />Kembali ke Asset</Link>
          </Button>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Jenis Asset</h1>
          <p className="mt-2 text-gray-600">Kelola master jenis asset, satuan, dan harga sekarang.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <Plus className="h-4 w-4" />Tambah Jenis Asset
        </Button>
      </div>

      <Card className="border-2 border-dashed border-blue-200 bg-white/70">
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Daftar Jenis Asset</CardTitle>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, nama, atau satuan" className="md:w-80" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Satuan</TableHead><TableHead>Harga Sekarang</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-500">Memuat data...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-500">Belum ada jenis asset.</TableCell></TableRow>
              ) : filtered.map((item) => (
                <TableRow key={item._id}>
                  <TableCell className="font-semibold">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>{currency(item.current_price)} / {item.unit}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" className="border-red-200 text-red-600" onClick={() => setDeleteItem(item)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : reset())}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? 'Edit Jenis Asset' : 'Tambah Jenis Asset'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-2"><Label>Kode</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></div>
            <div className="grid gap-2"><Label>Nama</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid gap-2"><Label>Satuan</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></div>
            <div className="grid gap-2">
              <Label>Harga Sekarang</Label>
              <Input
                inputMode="numeric"
                value={rupiahInput(form.current_price)}
                onChange={(e) => setForm({ ...form, current_price: rupiahValue(e.target.value) })}
                placeholder="Rp 0"
              />
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={reset}>Batal</Button><Button type="submit" disabled={saveMutation.isPending}>Simpan</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus Jenis Asset?</AlertDialogTitle><AlertDialogDescription>Jenis asset akan dinonaktifkan jika belum dipakai asset.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem._id)} className="bg-red-600 text-white hover:bg-red-700">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
