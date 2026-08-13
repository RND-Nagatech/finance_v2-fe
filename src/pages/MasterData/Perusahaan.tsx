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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AppSelect } from '@/components/AppSelect';

interface Perusahaan {
  _id?: string;
  kode_perusahaan: string;
  nama_perusahaan: string;
}

export default function Perusahaan() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Perusahaan>({ kode_perusahaan: '', nama_perusahaan: '' });
  const { user } = useAppStore();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch perusahaan
  const { data: perusahaanList = [], isLoading } = useQuery<Perusahaan[]>({
    queryKey: ['perusahaan-all'],
    queryFn: async () => {
      const res = await axiosInstance.get('/master/perusahaan?all=true');
      return res.data || [];
    },
  });

  // Create / Update
  const saveMutation = useMutation({
    mutationFn: async (payload: Perusahaan) => {
      if (editId) {
        return axiosInstance.put(`/master/perusahaan/${editId}`, payload);
      }
      return axiosInstance.post('/master/perusahaan', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perusahaan-all'] });
      toast.success('Data berhasil disimpan.');
      handleCloseModal();
    },
    onError: () => {
      toast.error('Gagal menyimpan data perusahaan!');
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return axiosInstance.delete(`/master/perusahaan/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perusahaan-all'] });
      toast.success('Data berhasil dihapus.');
    },
    onError: () => {
      toast.error('Gagal menghapus data perusahaan!');
    },
  });

  const handleOpenModal = (perusahaan?: Perusahaan) => {
    if (perusahaan) {
      setEditId(perusahaan._id || null);
      setFormData({
        kode_perusahaan: perusahaan.kode_perusahaan,
        nama_perusahaan: perusahaan.nama_perusahaan,
      });
    } else {
      setEditId(null);
      setFormData({ kode_perusahaan: '', nama_perusahaan: '' });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditId(null);
    setFormData({ kode_perusahaan: '', nama_perusahaan: '' });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Auto uppercase for both fields
    setFormData({ ...formData, [name]: value.toUpperCase() });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

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

  const filteredPerusahaanList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return perusahaanList;
    return perusahaanList.filter((p) =>
      `${p.kode_perusahaan} ${p.nama_perusahaan}`.toLowerCase().includes(q)
    );
  }, [perusahaanList, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPerusahaanList.length / pageSize));
  const displayRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPerusahaanList.slice(start, start + pageSize);
  }, [filteredPerusahaanList, page, pageSize]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Master Perusahaan</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">Kelola data perusahaan</p>
          </div>
          <Button
            onClick={() => handleOpenModal()}
            className="h-11 rounded-md bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Perusahaan
          </Button>
        </div>

        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="grid gap-5 md:grid-cols-[minmax(260px,390px)_160px]">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-600">Cari</Label>
              <div className="relative">
                <Input
                  id="search-perusahaan"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari kode / nama perusahaan"
                  className="h-12 rounded-md border-slate-200 bg-white pl-12 text-[15px] shadow-none"
                />
              </div>
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
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="w-40 px-6 py-4 font-semibold text-slate-900">Kode Perusahaan</TableHead>
                <TableHead className="w-96 px-6 py-4 font-semibold text-slate-900">Nama Perusahaan</TableHead>
                <TableHead className="w-32 px-6 py-4 text-right font-semibold text-slate-900">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-12">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-600 font-medium">Memuat data perusahaan...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredPerusahaanList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-12">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="text-slate-600 font-medium">Belum ada data perusahaan</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((p) => (
                  <TableRow key={p._id} className="hover:bg-slate-50 transition-colors duration-200 border-b border-slate-100">
                    <TableCell className="w-40 px-6 py-4 font-semibold text-slate-900">{p.kode_perusahaan}</TableCell>
                    <TableCell className="w-96 px-6 py-4 font-medium text-slate-900">{p.nama_perusahaan}</TableCell>
                    <TableCell className="w-32 px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenModal(p)}
                          className="border-slate-200 hover:bg-slate-50 transition-all duration-200"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => p._id && handleDelete(p._id)}
                          className="border-slate-200 hover:bg-red-50 text-red-600 hover:text-red-700 transition-all duration-200"
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
            <div>Total Data: {filteredPerusahaanList.length}</div>
            <div className="text-center">Halaman {page} dari {totalPages}</div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <span className="mr-2">Sebelumnya</span>
              </Button>
              <Button variant="outline" size="sm" className="h-10 rounded-md border-slate-200 px-5 text-slate-500 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <span>Berikutnya</span>
              </Button>
            </div>
          </div>
        </div>

        <ModalForm open={modalOpen} onOpenChange={setModalOpen} title={editId ? 'Edit Perusahaan' : 'Tambah Perusahaan'} contentClassName="sm:max-w-xl">
          <form onSubmit={handleSubmit} className="max-w-[520px] space-y-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="kode_perusahaan" className={`text-sm font-semibold transition-colors duration-200 ${editId ? 'text-slate-400' : 'text-slate-700'}`}>Kode Perusahaan</Label>
              <Input
                id="kode_perusahaan"
                name="kode_perusahaan"
                value={formData.kode_perusahaan}
                onChange={handleChange}
                required
                maxLength={10}
                className={`uppercase tracking-widest font-mono h-12 rounded-md border border-slate-200 transition-all duration-200 px-4 ${editId ? 'bg-gray-100 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary'}`}
                autoComplete="off"
                placeholder="Masukkan kode perusahaan"
                readOnly={!!editId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nama_perusahaan" className="text-sm font-semibold transition-colors duration-200 text-slate-700">Nama Perusahaan</Label>
              <Input
                id="nama_perusahaan"
                name="nama_perusahaan"
                value={formData.nama_perusahaan}
                onChange={handleChange}
                required
                maxLength={100}
                className="h-12 rounded-md border border-slate-200 transition-all duration-200 px-4 text-slate-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                autoComplete="off"
                placeholder="Masukkan nama perusahaan"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleCloseModal} className="border-slate-200 hover:bg-slate-50 transition-all duration-200">Batal</Button>
              <Button type="submit" className="rounded-md bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Menyimpan...' : (editId ? 'Simpan Perubahan' : 'Tambah Perusahaan')}
              </Button>
            </div>
          </form>
        </ModalForm>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-white border-slate-200 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-slate-900">Konfirmasi Hapus</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 text-base">Apakah Anda yakin ingin menghapus data perusahaan ini?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-3">
              <AlertDialogCancel className="">Batal</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Hapus</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
