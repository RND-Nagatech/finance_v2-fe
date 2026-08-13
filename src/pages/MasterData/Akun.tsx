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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

interface Akun {
  _id?: string;
  nama: string;
  kode: string;
  subkategori_id: string;
  subkategori_nama?: string;
  input_by: string;
  akun?: string;
  sub_kategori?: string;
}

interface SubKategori {
  _id: string;
  sub_kategori: string;
  kategori: string;
  status_aktv?: boolean;
}

export default function Akun() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Akun>({
    nama: '',
    kode: '',
    subkategori_id: '', // tetap simpan id untuk dropdown
    input_by: '',
  });
  const { user } = useAppStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubKategori, setFilterSubKategori] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch sub categories
  const { data: subCategories = [] } = useQuery({
    queryKey: ['subkategori'],
    queryFn: async () => {
      const response = await axiosInstance.get('/master/subkategori');
      return response.data || [];
    },
  });

  // Fetch akun
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['akun'],
    queryFn: async () => {
      const response = await axiosInstance.get('/master/akun');
      return response.data || [];
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editId) {
        return axiosInstance.put(`/master/akun/${editId}`, payload);
      }
      return axiosInstance.post('/master/akun', payload);
    },
    onSuccess: () => { /* handled in onSettled */ },
    onError: () => { /* handled in onSettled */ },
    onSettled: (data: any, error: any) => {
      queryClient.invalidateQueries({ queryKey: ['akun'] });
      const serverMsg = data?.data?.message || error?.response?.data?.message;
      if (serverMsg) {
        if (error) toast.error(serverMsg); else toast.success(serverMsg);
      } else {
        if (error) toast.error('Gagal menyimpan data. Silakan coba lagi.'); else toast.success('Data berhasil disimpan.');
      }
      // custom re-activate logic preserved
      if (error?.response?.data?.code === 'REACTIVATE' && error?.response?.data?.id) {
        setReactivateId(error.response.data.id);
        setShowReactivateDialog(true);
      }
      if (!error) handleCloseModal();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => axiosInstance.delete(`/master/akun/${id}`, {
      data: { delete_by: user?.name || 'Unknown' },
    }),
    onSuccess: (resp: any) => {
      queryClient.invalidateQueries({ queryKey: ['akun'] });
      const msg = resp?.data?.message || 'Akun berhasil dihapus!';
      toast.success(msg);
      setShowDeleteDialog(false);
      setDeleteId(null);
    },
    onError: (error: any) => {
      const serverMsg = error?.response?.data?.message;
      if (serverMsg) {
        toast.error(serverMsg);
      } else {
        toast.error('Gagal menghapus data. Silakan coba lagi.');
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subkategori_id) {
      toast.error('Sub Kategori wajib dipilih!');
      return;
    }
    if (!formData.nama) {
      toast.error('Nama Akun wajib diisi!');
      return;
    }
    // Kirim _id sub kategori ke backend
    const payload = {
      sub_kategori: formData.subkategori_id,
      akun: formData.nama,
      input_by: user?.name || 'Unknown',
    };
    saveMutation.mutate(payload);
  };

  const handleEdit = (item: Akun) => {
    const subKategoriObj = subCategories.find(
      (sub) => sub.sub_kategori === item.sub_kategori
    );
    setEditId(item._id || null);
    setFormData({
      ...item,
      nama: item.nama || item.akun || '',
      subkategori_id: subKategoriObj ? subKategoriObj._id : '',
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditId(null);
    setFormData({ nama: '', kode: '', subkategori_id: '', input_by: '' });
  };

  const filteredAkunList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data
      .filter((item) => filterSubKategori === 'ALL' || (item.sub_kategori || '') === filterSubKategori)
      .filter((item) =>
        !q ? true : `${item.kode || ''} ${item.akun || item.nama || ''} ${item.sub_kategori || ''}`
          .toLowerCase()
          .includes(q)
      );
  }, [data, filterSubKategori, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAkunList.length / pageSize));
  const displayRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAkunList.slice(start, start + pageSize);
  }, [filteredAkunList, page, pageSize]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Master Akun</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">Kelola akun transaksi dengan mudah dan efisien.</p>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            className="h-11 rounded-md bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Akun
          </Button>
        </div>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="grid gap-5 md:grid-cols-[minmax(260px,390px)_160px_120px]">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Cari</Label>
              <Input
                id="search-akun"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Cari kode / nama akun / sub kategori"
                className="h-12 rounded-md border-slate-200 bg-white pl-4 text-[15px] shadow-none w-full outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Filter Sub Kategori</Label>
              <AppSelect
                value={filterSubKategori}
                onValueChange={(value) => { setFilterSubKategori(value); setPage(1); }}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  ...Array.from(new Set((data || []).map((item: any) => item.sub_kategori).filter(Boolean))).map((sub) => ({
                    value: String(sub),
                    label: String(sub),
                  })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Per Halaman</Label>
              <AppSelect
                value={String(pageSize)}
                onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}
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
                <TableHead className="w-64 px-6 py-5 text-sm font-bold text-slate-900">Nama Akun</TableHead>
                <TableHead className="w-48 px-6 py-5 text-sm font-bold text-slate-900">Sub Kategori</TableHead>
                <TableHead className="w-32 px-6 py-5 text-sm font-bold text-slate-900">Input By</TableHead>
                <TableHead className="w-32 px-6 py-5 text-right text-sm font-bold text-slate-900">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-8 h-8 border-4 border-slate-300 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-600 font-medium">Memuat data akun...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAkunList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-[360px] text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-blue-600">
                        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="mt-5 text-base font-bold text-slate-900">Belum ada data akun</p>
                      <p className="mt-2 text-sm font-medium text-slate-500">Mulai dengan menambahkan akun baru.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((item) => (
                  <TableRow key={item._id} className="hover:bg-slate-50 transition-colors duration-200 border-b border-slate-100">
                    <TableCell className="w-20 px-6 py-4 font-semibold text-slate-900">{item.kode}</TableCell>
                    <TableCell className="w-64 px-6 py-4 font-medium text-slate-900">{item.akun || item.nama}</TableCell>
                    <TableCell className="w-48 px-6 py-4 text-slate-700">
                      {subCategories.find((sub) => sub._id === item.sub_kategori)?.sub_kategori || item.sub_kategori}
                    </TableCell>
                    <TableCell className="w-32 px-6 py-4 text-slate-700">{item.input_by}</TableCell>
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
                          onClick={() => {
                            setDeleteId(item._id || null);
                            setShowDeleteDialog(true);
                          }}
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
            <div>Total Data: {filteredAkunList.length}</div>
            <div className="text-center">Halaman {page} dari {totalPages}</div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Sebelumnya
              </Button>
              <Button variant="outline" size="sm" className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Berikutnya
              </Button>
            </div>
          </div>
        </div>
        <ModalForm open={modalOpen} onOpenChange={handleCloseModal} title={editId ? 'Edit Akun' : 'Tambah Akun'} contentClassName="sm:max-w-xl">
          <form onSubmit={handleSubmit} className="max-w-[520px] space-y-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="subkategori" className="text-sm font-semibold text-slate-600">Sub Kategori</Label>
              <AppSelect
                value={formData.subkategori_id}
                onValueChange={(value) => setFormData({ ...formData, subkategori_id: value })}
                placeholder="Pilih sub kategori"
                triggerClassName="h-11"
                options={subCategories
                    .filter((data) => data.status_aktv !== false)
                    .sort((a, b) => a.kategori.localeCompare(b.kategori))
                    .map((data) => ({
                      value: data._id,
                      label: `(${data.kategori}) ${data.sub_kategori}`,
                    }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nama" className="text-sm font-semibold text-slate-600">Nama Akun</Label>
              <Input
                id="nama"
                value={formData.nama}
                onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                placeholder="Masukkan nama akun"
                className="h-11 border-2 border-slate-200 transition-all duration-200"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseModal} className="border-slate-200 text-slate-600 hover:bg-slate-50">Batal</Button>
              <Button type="submit" className="rounded-md bg-blue-600 px-6 font-bold text-white hover:bg-blue-700">{editId ? 'Simpan Perubahan' : 'Tambah Akun'}</Button>
            </div>
          </form>
        </ModalForm>
        {/* Custom Delete Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="bg-white shadow-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900">Konfirmasi Hapus</DialogTitle>
              <DialogDescription className="text-slate-600 text-base">Yakin ingin menghapus akun ini? Tindakan ini tidak dapat dibatalkan.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50">Batal</Button>
              <Button variant="destructive" onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700 rounded-md px-6 py-2 font-semibold">Hapus Akun</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Custom Reactivate Dialog */}
        <Dialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
          <DialogContent className="bg-white shadow-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900">Data Sudah Ada</DialogTitle>
              <DialogDescription className="text-slate-600 text-base">Data ini sudah ada, aktifkan kembali?</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setShowReactivateDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50">Batal</Button>
              <Button variant="default" onClick={async () => {
                if (reactivateId) {
                  await axiosInstance.put(`/master/akun/${reactivateId}`, {
                    status_aktv: true,
                    update_by: user?.name || 'Unknown',
                  });
                  await queryClient.invalidateQueries({ queryKey: ['akun'] });
                  setShowReactivateDialog(false);
                  handleCloseModal();
                  toast.success('Akun diaktifkan kembali!');
                }
              }} className="bg-green-600 text-white hover:bg-green-700 rounded-md px-6 py-2 font-semibold">Aktifkan Kembali</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
