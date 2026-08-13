import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import axiosInstance from '@/api/axiosInstance';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ModalForm } from '@/components/ModalForm';
import { AppSelect } from '@/components/AppSelect';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface SubKategori {
  _id?: string;
  sub_kategori: string;
  kode: string;
  kategori: string; // ObjectId
  kategori_nama?: string;
  input_date?: string;
  update_date?: string;
  delete_date?: string | null;
  input_by: string;
  update_by?: string | null;
  delete_by?: string | null;
}

interface Kategori {
  _id: string;
  kategori: string;
}

export default function SubKategori() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SubKategori>({
    sub_kategori: '',
    kode: '',
    kategori: '',
    input_by: '',
  });
  const { user } = useAppStore();

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['kategori'],
    queryFn: async () => {
      const response = await axiosInstance.get('/master/kategori');
      return response.data || [];
    },
  });

  // Fetch subkategori
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['subkategori'],
    queryFn: async () => {
      const response = await axiosInstance.get('/master/subkategori');
      return response.data || [];
    },
  });

  // Create/Update mutation
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async (payload: SubKategori) => {
      if (editId) {
        return axiosInstance.put(`/master/subkategori/${editId}`, {
          ...payload,
          update_by: user?.name || 'Unknown',
        });
      }
      // Cek apakah data sudah ada dan non-aktif
      const existing = data.find(
        (s) => s.kode === payload.kode || s.sub_kategori.toLowerCase() === payload.sub_kategori.toLowerCase()
      );
      if (existing && existing.status_aktv === false) {
        setReactivateId(existing._id);
        setShowReactivateDialog(true);
        return;
      }
      return axiosInstance.post('/master/subkategori', { sub_kategori: payload.sub_kategori, kategori: payload.kategori, input_by: payload.input_by });
    },
    onSuccess: () => { /* handled in onSettled */ },
    onError: () => { /* handled in onSettled */ },
    onSettled: (data: any, error: any, vars: any) => {
      queryClient.invalidateQueries({ queryKey: ['subkategori'] });
      const serverMsg = data?.data?.message || error?.response?.data?.message;
      if (serverMsg) {
        if (error) toast.error(serverMsg); else toast.success(serverMsg);
      } else {
        if (error) toast.error('Gagal menyimpan data. Silakan coba lagi.'); else toast.success('Data berhasil disimpan.');
      }
      // Reactivate flow: if backend returned code 11000 earlier it will still be in data.response; keep existing re-activate dialog logic
      if (!error) handleCloseModal();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => axiosInstance.delete(`/master/subkategori/${id}`, {
      data: { delete_by: user?.name || 'Unknown' },
    }),
    onSuccess: (resp: any) => {
      queryClient.invalidateQueries({ queryKey: ['subkategori'] });
      const msg = resp?.data?.message || 'Sub kategori berhasil dihapus!';
      toast.success(msg);
    },
    onError: (error: any) => {
      const serverMsg = error?.response?.data?.message;
      if (serverMsg) {
        toast.error(serverMsg);
      } else {
        toast.error('Gagal menghapus sub kategori!');
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, input_by: user?.name || 'Unknown' };
    saveMutation.mutate(payload);
  };

  const handleEdit = (item: SubKategori) => {
    setEditId(item._id || null);
    setFormData(item);
    setModalOpen(true);
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKategori, setFilterKategori] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // ...existing code...

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    return (categories as Kategori[]).filter((cat) => {
      const kategori = String(cat.kategori || '').trim();
      if (!kategori || seen.has(kategori)) return false;
      seen.add(kategori);
      return true;
    });
  }, [categories]);

  const handleDelete = (id: string) => {
    setDeleteId(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setShowDeleteDialog(false);
      setDeleteId(null);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditId(null);
    setFormData({ sub_kategori: '', kode: '', kategori: '', input_by: '' });
  };

  const filteredSubKategoriList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data
      .filter((item) => filterKategori === 'ALL' || item.kategori === filterKategori)
      .filter((item) =>
        !q ? true : `${item.kode} ${item.sub_kategori} ${item.kategori}`.toLowerCase().includes(q)
      );
  }, [data, filterKategori, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSubKategoriList.length / pageSize));
  const displayRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSubKategoriList.slice(start, start + pageSize);
  }, [filteredSubKategoriList, page, pageSize]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Master Sub Kategori</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">Kelola sub kategori transaksi dengan mudah dan efisien.</p>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="h-11 rounded-md bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Sub Kategori
          </Button>
        </div>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="grid gap-5 md:grid-cols-[minmax(260px,390px)_160px_120px]">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Cari Kategori</Label>
              <Input
                id="search-subkategori"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari kode / sub kategori / kategori"
                className="h-12 rounded-md border-slate-200 bg-white pl-4 text-[15px] shadow-none w-full outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Filter Kategori</Label>
              <AppSelect
                value={filterKategori}
                onValueChange={(value) => {
                  setFilterKategori(value);
                  setPage(1);
                }}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  ...uniqueCategories.map((cat) => ({ value: cat.kategori, label: cat.kategori })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Per Halaman</Label>
              <AppSelect
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
                options={[
                  { value: '10', label: '10' },
                  { value: '25', label: '25' },
                  { value: '50', label: '50' },
                ]}
              />
            </div>
          </div>
        </div>
        <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-20 px-6 py-5 text-sm font-bold text-slate-900">Kode</TableHead>
                <TableHead className="w-64 px-6 py-5 text-sm font-bold text-slate-900">Sub Kategori</TableHead>
                <TableHead className="w-48 px-6 py-5 text-sm font-bold text-slate-900">Kategori</TableHead>
                <TableHead className="w-48 px-6 py-5 text-sm font-bold text-slate-900">Input By</TableHead>
                <TableHead className="w-32 px-6 py-5 text-right text-sm font-bold text-slate-900">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-8 h-8 border-4 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-600 font-medium">Memuat data sub kategori...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSubKategoriList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-[360px] text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-blue-600">
                        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="mt-5 text-base font-bold text-slate-900">Belum ada data sub kategori</p>
                      <p className="mt-2 text-sm font-medium text-slate-500">Mulai dengan menambahkan sub kategori baru.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((item) => (
                  <TableRow key={item._id} className="hover:bg-slate-50 transition-colors duration-200 border-b border-slate-100">
                    <TableCell className="w-20 px-6 py-4 font-semibold text-slate-900">{item.kode}</TableCell>
                    <TableCell className="w-64 px-6 py-4 font-medium text-slate-900">{item.sub_kategori}</TableCell>
                    <TableCell className="w-48 px-6 py-4 text-slate-700">{item.kategori}</TableCell>
                    <TableCell className="w-48 px-6 py-4 text-slate-700">{item.input_by}</TableCell>
                    <TableCell className="w-32 px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          className="border-slate-200 text-slate-600 hover:bg-slate-50 transition-all duration-200"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => item._id && handleDelete(item._id)}
                          className="border-slate-200 text-red-600 hover:bg-red-50 transition-all duration-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="grid gap-4 border-t border-slate-200 px-6 py-5 text-sm font-medium text-slate-600 md:grid-cols-3 md:items-center">
            <div>Total Data: {filteredSubKategoriList.length}</div>
            <div className="text-center">Halaman {page} dari {totalPages}</div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <span className="mr-2">Sebelumnya</span>
              </Button>
              <Button variant="outline" size="sm" className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <span className="mr-2">Berikutnya</span>
              </Button>
            </div>
          </div>
        </div>

        <ModalForm open={modalOpen} onOpenChange={handleCloseModal} title={editId ? 'Edit Sub Kategori' : 'Tambah Sub Kategori'} contentClassName="sm:max-w-xl">
          <form onSubmit={handleSubmit} className="max-w-[520px] space-y-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="kategori" className="text-sm font-semibold text-slate-600">Kategori</Label>
              <AppSelect
                value={formData.kategori}
                onValueChange={(value) => setFormData({ ...formData, kategori: value })}
                placeholder="Pilih kategori"
                triggerClassName="h-11"
                options={uniqueCategories.map((cat) => ({
                  value: cat.kategori,
                  label: cat.kategori,
                }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub_kategori" className="text-sm font-semibold text-slate-600">Nama Sub Kategori</Label>
              <Input
                id="sub_kategori"
                value={formData.sub_kategori}
                onChange={(e) => setFormData({ ...formData, sub_kategori: e.target.value })}
                placeholder="Masukkan nama sub kategori"
                className="h-11 border-2 border-slate-200 transition-all duration-200"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                className="border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="rounded-md bg-blue-600 px-6 font-bold text-white hover:bg-blue-700"
              >
                {editId ? 'Simpan Perubahan' : 'Tambah Sub Kategori'}
              </Button>
            </div>
          </form>
        </ModalForm>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-white shadow-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-slate-900">Konfirmasi Hapus</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 text-base">Yakin ingin menghapus sub kategori ini? Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel className="border-slate-200 text-slate-600 hover:bg-slate-50">Batal</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700 rounded-md px-6 py-2 font-semibold">Hapus Sub Kategori</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
          <AlertDialogContent className="bg-white shadow-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-slate-900">Data Sudah Ada</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 text-base">Data ini sudah ada, aktifkan kembali?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel onClick={() => setShowReactivateDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50">Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (reactivateId) {
                    await axiosInstance.put(`/master/subkategori/${reactivateId}`, {
                      status_aktv: true,
                      update_by: user?.name || 'Unknown',
                    });
                    await queryClient.invalidateQueries({ queryKey: ['subkategori'] });
                    setShowReactivateDialog(false);
                    handleCloseModal();
                    toast.success('Sub Kategori diaktifkan kembali!');
                  }
                }}
                className="bg-green-600 text-white hover:bg-green-700 rounded-md px-6 py-2 font-semibold"
              >
                Aktifkan Kembali
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
