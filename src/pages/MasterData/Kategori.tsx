import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import axiosInstance from '@/api/axiosInstance';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ChevronLeft, ChevronRight, Inbox, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

interface Kategori {
  _id?: string;
  kategori: string;
  kode: string;
  status_aktv?: boolean;
  input_date?: string;
  update_date?: string;
  delete_date?: string | null;
  input_by: string;
  update_by?: string | null;
  delete_by?: string | null;
}

export default function Kategori() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Kategori>({ kategori: '', kode: '', input_by: '' });
  const { user } = useAppStore();

  // Fetch kategori
  // Ambil semua data kategori (aktif dan non-aktif) untuk validasi input
  const { data: allKategoriList = [], isLoading } = useQuery<Kategori[]>({
    queryKey: ['kategori-all'],
    queryFn: async () => {
      const res = await axiosInstance.get('/master/kategori?all=true');
      return res.data || [];
    },
  });

  // Filter hanya yang aktif untuk ditampilkan di tabel
  const kategoriList = allKategoriList.filter((k) => k.status_aktv !== false);

  // Create / Update
  const saveMutation = useMutation({
    mutationFn: async (payload: Kategori) => {
      if (editId) {
        return axiosInstance.put(`/master/kategori/${editId}`, {
          ...payload,
          update_by: user?.name || 'Unknown',
        });
      }
      // Cek apakah data sudah ada dan non-aktif
      const existing = allKategoriList.find(
        (k) => k.kode === payload.kode || k.kategori.toLowerCase() === payload.kategori.toLowerCase()
      );
      if (existing && existing.status_aktv === false) {
        setReactivateId(existing._id);
        setShowReactivateDialog(true);
        return;
      }
      return axiosInstance.post('/master/kategori', { kategori: payload.kategori, input_by: payload.input_by });
    },
    onSuccess: () => {
      return; // handled in onSettled
    },
    onError: () => { /* handled in onSettled */ },
    onSettled: (data: any, error: any) => {
      queryClient.invalidateQueries({ queryKey: ['kategori'] });
      queryClient.invalidateQueries({ queryKey: ['kategori-all'] });
      const serverMsg = data?.data?.message || error?.response?.data?.message;
      if (serverMsg) {
        if (error) toast.error(serverMsg); else toast.success(serverMsg);
      } else {
        if (error) toast.error('Gagal menyimpan kategori!'); else toast.success('Data berhasil disimpan.');
      }
      if (!error) handleCloseModal();
    },
  });

  // Delete (soft delete)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => axiosInstance.delete(`/master/kategori/${id}`, {
      data: { delete_by: user?.name || 'Unknown' },
    }),
    onSuccess: (resp: any) => {
      queryClient.invalidateQueries({ queryKey: ['kategori'] });
      queryClient.invalidateQueries({ queryKey: ['kategori-all'] });
      const msg = resp?.data?.message || 'Kategori berhasil dihapus!';
      toast.success(msg);
    },
    onError: (error: any) => {
      const serverMsg = error?.response?.data?.message;
      if (serverMsg) {
        toast.error(serverMsg);
      } else {
        toast.error('Gagal menghapus kategori!');
      }
    },
  });
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ ...formData, input_by: user?.name || 'Unknown' });
  };

  const handleEdit = (item: Kategori) => {
    setEditId(item._id || null);
    setFormData(item);
    setModalOpen(true);
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
    setFormData({ kategori: '', kode: '', input_by: '' });
  };

  const filteredKategoriList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return kategoriList;
    return kategoriList.filter((k) =>
      `${k.kode} ${k.kategori}`.toLowerCase().includes(q)
    );
  }, [kategoriList, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredKategoriList.length / pageSize));
  const displayRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredKategoriList.slice(start, start + pageSize);
  }, [filteredKategoriList, page, pageSize]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">
              Master Kategori
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">Kelola kategori transaksi dengan mudah dan efisien.</p>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="h-11 rounded-md bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Kategori
          </Button>
        </div>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="grid gap-5 md:grid-cols-[minmax(260px,390px)_160px]">
            <div className="space-y-2">
              <Label htmlFor="search-kategori" className="text-sm font-semibold text-slate-600">Cari Kategori</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  id="search-kategori"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari kode / kategori"
                  className="h-12 rounded-md border-slate-200 bg-white pl-12 text-[15px] shadow-none"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-size-kategori" className="text-sm font-semibold text-slate-600">Per Halaman</Label>
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
                <TableHead className="w-28 px-6 py-5 text-sm font-bold text-slate-900">Kode</TableHead>
                <TableHead className="w-64 px-6 py-5 text-sm font-bold text-slate-900">Kategori</TableHead>
                <TableHead className="w-48 px-6 py-5 text-sm font-bold text-slate-900">Input By</TableHead>
                <TableHead className="w-32 px-6 py-5 text-right text-sm font-bold text-slate-900">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-[360px] text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                      <p className="text-sm font-semibold text-slate-600">Memuat data kategori...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredKategoriList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-[360px] text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-blue-600">
                        <Inbox className="h-7 w-7" />
                      </div>
                      <p className="mt-5 text-base font-bold text-slate-900">Belum ada data kategori</p>
                      <p className="mt-2 text-sm font-medium text-slate-500">Mulai dengan menambahkan kategori baru.</p>
                      <Button
                        onClick={() => setModalOpen(true)}
                        variant="outline"
                        className="mt-7 h-11 min-w-[220px] rounded-md border-blue-500 text-sm font-bold text-blue-600 hover:bg-slate-50 hover:text-blue-700"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah Kategori
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((item) => (
                  <TableRow key={item._id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                    <TableCell className="w-28 px-6 py-4 font-semibold text-slate-900">{item.kode}</TableCell>
                    <TableCell className="w-64 px-6 py-4 font-semibold text-slate-900">{item.kategori}</TableCell>
                    <TableCell className="w-48 px-6 py-4 text-slate-600">{item.input_by}</TableCell>
                    <TableCell className="w-32 px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          className="h-9 w-9 rounded-md border-slate-200 p-0 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => item._id && handleDelete(item._id)}
                          className="h-9 w-9 rounded-md border-slate-200 p-0 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
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
            <div>Total Data: {filteredKategoriList.length}</div>
            <div className="text-center">Halaman {page} dari {totalPages}</div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50"
              >
                Berikutnya
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <ModalForm
          open={modalOpen}
          onOpenChange={handleCloseModal}
          title={editId ? 'Edit Kategori' : 'Tambah Kategori'}
          contentClassName="sm:max-w-xl"
        >
          <form onSubmit={handleSubmit} className="max-w-[520px] space-y-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="kategori" className="text-sm font-semibold text-gray-700">Nama Kategori</Label>
              <Input
                id="kategori"
                value={formData.kategori}
                onChange={e => setFormData({ ...formData, kategori: e.target.value })}
                placeholder="Masukkan nama kategori"
                className="h-11 border-2 border-gray-200 transition-all duration-200"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseModal}
                className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="rounded-md bg-blue-600 px-6 py-2 font-semibold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] transition-colors hover:bg-blue-700"
              >
                {editId ? 'Simpan Perubahan' : 'Tambah Kategori'}
              </Button>
            </div>
          </form>
        </ModalForm>

        <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
          <AlertDialogContent className="border-slate-200 bg-white shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-slate-900">
                Data Sudah Ada
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600 text-base">
                Data ini sudah ada, aktifkan kembali?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel
                onClick={() => setShowReactivateDialog(false)}
                className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
              >
                Batal
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (reactivateId) {
                    await axiosInstance.put(`/master/kategori/${reactivateId}`, {
                      status_aktv: true,
                      update_by: user?.name || 'Unknown',
                    });
                    await queryClient.invalidateQueries({ queryKey: ['kategori'] });
                    await queryClient.invalidateQueries({ queryKey: ['kategori-all'] });
                    setShowReactivateDialog(false);
                    handleCloseModal();
                    toast.success('Kategori diaktifkan kembali!');
                  }
                }}
                className="bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
              >
                Aktifkan Kembali
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="border-slate-200 bg-white shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-slate-900">
                Konfirmasi Hapus
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600 text-base">
                Yakin ingin menghapus kategori ini? Tindakan ini tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel className="border-gray-300 hover:bg-gray-50 transition-all duration-200">
                Batal
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
              >
                Hapus Kategori
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
