import React, { useState, useEffect, useMemo, useRef } from 'react';
// import * as XLSX from 'xlsx';
// Helper: extract year from fiscal month string (e.g. 'JAN-25' or 'JAN - 25')
function getFiscalMonthYear(bulanFiskal: string): number | null {
  if (!bulanFiskal) return null;
  const match = bulanFiskal.match(/\d{2}$/);
  if (!match) return null;
  // Assume fiscalYear is always 20xx, so '25' means 2025
  const year2Digit = parseInt(match[0], 10);
  return 2000 + year2Digit;
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import axiosInstance from '@/api/axiosInstance';
import { fetchUsers } from '@/api/users';
import { fetchAssets, type AssetItem } from '@/api/assets';
import { isProgramInternalSession } from '@/utils/programInternalRedirect';
import { useAppStore } from '@/store/useAppStore';
import { resolveAttachmentUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Pagination,
  PaginationContent,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CheckCircle2, FileText, FileUp, Loader2, Plus, XCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface IAttachment {
  path: string;
}

interface Transaksi {
  _id?: string;
  kategori_id: string;
  kategori_nama?: string;
  subkategori_id: string;
  subkategori_nama?: string;
  akun_id: string;
  akun_nama?: string;
  bulan_fiskal: string;
  nilai: number;
  input_by: string;
  keterangan?: string;
  created_at?: string;
  validated_at?: string;
  tanggal?: string; // tambahkan tanggal untuk date picker
  attachments?: IAttachment[];
  is_validated?: boolean;
  validator_notes?: string;
  status_final?: boolean;
  is_special_transaction?: boolean;
  transaction_mode?: 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY';
  source_type?: 'REKENING' | 'ASSET';
}


interface Option {
  _id: string;
  nama: string;
}

interface ImportReport {
  total: number;
  success: number;
  skipped?: number;
  failed: number;
  summary_rebuilt: number;
  errors: Array<{ row: number; reason: string; data?: any }>;
  successes?: Array<{ row: number; id: string }>;
  skips?: Array<{ row: number; reason: string; id?: string }>;
}

type ImportPhase = 'idle' | 'reading' | 'uploading' | 'processing' | 'completed' | 'failed';

interface ImportProgressState {
  phase: ImportPhase;
  total: number | null;
  uploadedPercent: number;
  processedCount: number;
  message: string;
}

type SplitDanaRow = {
  id: string;
  perusahaan_id: string;
  rekening_id: string;
  keluar_kategori_id: string;
  keluar_subkategori_id: string;
  keluar_akun_id: string;
  masuk_kategori_id: string;
  masuk_subkategori_id: string;
  masuk_akun_id: string;
  nominal: number;
  nominalDisplay: string;
  keterangan: string;
};

const initialImportProgress: ImportProgressState = {
  phase: 'idle',
  total: null,
  uploadedPercent: 0,
  processedCount: 0,
  message: 'Pilih file JSON atau CSV untuk mulai import.',
};

const parseImportCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((item) => item.trim());
};

const parseImportCsvContent = (content: string): any[] => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length <= 1) return [];
  const headers = parseImportCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseImportCsvLine(line);
    return headers.reduce((row: any, header, idx) => {
      row[header] = values[idx] ?? '';
      return row;
    }, {});
  });
};

const parseImportFileRows = async (file: File): Promise<any[]> => {
  const filename = file.name.toLowerCase();
  const content = await file.text();

  if (filename.endsWith('.json')) {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.data)) return parsed.data;
    if (Array.isArray(parsed?.documents)) return parsed.documents;
    throw new Error('File JSON harus berupa array atau memiliki field data/documents array.');
  }

  if (filename.endsWith('.csv')) return parseImportCsvContent(content);

  throw new Error('Format file belum didukung. Gunakan .json atau .csv.');
};

const estimateImportDocumentCount = async (file: File): Promise<number | null> => {
  return (await parseImportFileRows(file)).length;
};

const getReferenceId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return String(value._id || value.id || '');
  }
  return String(value);
};

const getReferenceIds = (values: any): string[] => {
  if (!values) return [];
  const list = Array.isArray(values) ? values : [values];
  return Array.from(new Set(list.map(getReferenceId).filter(Boolean)));
};


// Bulan fiskal dinamis dari backend
const currentYear = new Date().getFullYear();

interface UploadAttachmentsFormProps {
  transaksiId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function UploadAttachmentsForm({ transaksiId, onClose, onSuccess }: UploadAttachmentsFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('attachments', file);
      });

      await axiosInstance.post(`/transaksi/${transaksiId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success(`${files.length} file(s) uploaded successfully!`);
      setFiles([]); // Clear the list after successful upload
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal mengupload attachment.';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 ${isDragOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="flex flex-col items-center space-y-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
            <svg className={`w-5 h-5 ${isDragOver ? 'text-blue-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className={`text-sm font-medium ${isDragOver ? 'text-blue-700' : 'text-gray-700'}`}>
              {isDragOver ? 'Drop files here' : 'Click to add files or drag & drop'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, PDF, Excel files supported
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Files to upload ({files.length}):</p>
          <div className="max-h-40 overflow-y-auto space-y-2">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between bg-gray-50 rounded p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(idx)}
                  className="text-red-600 hover:text-red-800 hover:bg-red-50 ml-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
          {uploading ? 'Uploading...' : `Upload ${files.length > 0 ? `${files.length} File${files.length > 1 ? 's' : ''}` : 'Files'}`}
        </Button>
      </div>
    </div>
  );
}

export default function Transaksi() {
  // State untuk dialog validasi
  const [validateDialogOpen, setValidateDialogOpen] = useState(false);
  const [validateRow, setValidateRow] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [validatorNotes, setValidatorNotes] = useState('');

  // State untuk dialog validator notes terpisah
  const [validatorNotesDialogOpen, setValidatorNotesDialogOpen] = useState(false);
  const [validatorNotesRow, setValidatorNotesRow] = useState<any>(null);
  const [validatorNotesInput, setValidatorNotesInput] = useState('');
  const [savingValidatorNotes, setSavingValidatorNotes] = useState(false);
  const [attachmentPreviewDialogOpen, setAttachmentPreviewDialogOpen] = useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const [attachmentPreviewName, setAttachmentPreviewName] = useState('');

  // Tahun fiskal global dari store
  const { fiscalYear, user } = useAppStore();
  const isSsoSession = isProgramInternalSession();

  // Fetch rekening for dropdown
  const { data: rekeningList = [] } = useQuery({
    queryKey: ['rekening-all'],
    queryFn: async () => {
      try {
        const res = await axiosInstance.get('/master/rekening?all=true');
        return res.data || [];
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data rekening.';
        toast.error(msg);
        throw error;
      }
    },
  });

  // Fetch rekening for validation dialog
  const { data: validationRekening } = useQuery({
    queryKey: ['rekening-validation', validateRow?.rekening_id],
    queryFn: async () => {
      if (!validateRow?.rekening_id) return null;
      try {
        const res = await axiosInstance.get(`/master/rekening/${validateRow.rekening_id}`);
        return res.data;
      } catch (error: any) {
        console.error('Gagal mengambil data rekening untuk validasi:', error);
        return null;
      }
    },
    enabled: !!validateRow?.rekening_id && validateDialogOpen,
  });

  // Handler untuk validasi data hasil attachment
  // Handler untuk buka dialog validasi
  const handleValidate = (row: any) => {
    // Cari rekening_id berdasarkan kode_bank dan no_rekening jika belum ada
    let rekening_id = row.rekening_id;
    if (row.source_type !== 'ASSET' && !rekening_id && row.kode_bank && row.no_rekening) {
      const rekening = rekeningList.find((r) => r.kode_bank === row.kode_bank && r.no_rekening === row.no_rekening);
      rekening_id = rekening?._id;
    }
    setValidateRow({ ...row, rekening_id });
    setValidatorNotes('');
    setValidateDialogOpen(true);
  };

  // Handler untuk buka dialog validator notes
  const handleOpenValidatorNotes = (row: any) => {
    setValidatorNotesRow(row);
    setValidatorNotesInput(row.validator_notes || '');
    setValidatorNotesDialogOpen(true);
  };

  const handleOpenAttachmentPreviewDialog = (path: string, fileName?: string) => {
    if (!path) return;
    setAttachmentPreviewUrl(resolveAttachmentUrl(path));
    setAttachmentPreviewName(fileName || path.split('/').pop() || 'Preview Attachment');
    setAttachmentPreviewDialogOpen(true);
  };

  // Handler submit validasi
  const handleConfirmValidate = async () => {
    if (!validateRow) return;
    setValidating(true);
    try {
      await axiosInstance.post(`/transaksi/validate-attachment`, { id: validateRow._id, validator_notes: validatorNotes });
      toast.success('Data berhasil divalidasi!');
      setValidateDialogOpen(false);
      setValidateRow(null);
      setValidatorNotes('');
      if (refetch) refetch();
      // Invalidate rekening queries to update saldo
      queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets-summary'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal validasi data');
    } finally {
      setValidating(false);
    }
  };

  // Handler untuk menyimpan validator notes
  const handleSaveValidatorNotes = async () => {
    if (!validatorNotesRow) return;
    setSavingValidatorNotes(true);
    try {
      await axiosInstance.put(`/transaksi/validator-notes`, {
        id: validatorNotesRow._id,
        validator_notes: validatorNotesInput
      });
      toast.success('Validator notes berhasil disimpan!');
      setValidatorNotesDialogOpen(false);
      setValidatorNotesRow(null);
      setValidatorNotesInput('');
      if (refetch) refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Gagal menyimpan validator notes');
    } finally {
      setSavingValidatorNotes(false);
    }
  };

  // ...existing state declarations...

  // ...existing state declarations...

  // Place fiscal month validation hooks here, after all state declarations:
  // (already declared below after formData, editModalOpen, editData)



  // Sorting state for Kategori
  const [kategoriSort, setKategoriSort] = useState<'asc' | 'desc' | null>(null);

  // Handler for sorting Kategori
  const handleSortKategori = () => {
    setKategoriSort((prev) => {
      if (prev === 'asc') return 'desc';
      if (prev === 'desc') return null;
      return 'asc';
    });
  };
  // State for view keterangan modal
  const [viewKeteranganOpen, setViewKeteranganOpen] = useState(false);
  const [viewKeteranganText, setViewKeteranganText] = useState<string | null>(null);

  // Handler to open keterangan modal
  const handleViewKeterangan = (row: any) => {
    setViewKeteranganText(row.keterangan || '-');
    setViewKeteranganOpen(true);
  };
  // Expand rows (Detail): show keterangan like VPS page
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggleExpandedRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };
  // Filter states
  const [typeData, setTypeData] = useState<'Detail' | 'Rekap'>('Detail');
  // Reset pagination and cached data when switching between Detail/Rekap
  useEffect(() => {
    setPage(1);
    setExpandedRows({});
    // Clear previous query caches to avoid stale rows persisting
    queryClient.removeQueries({ queryKey: ['transaksi'] });
    queryClient.removeQueries({ queryKey: ['transaksi-aggregate'] });
  }, [typeData]);
  const [filterTanggalDari, setFilterTanggalDari] = useState('');
  const [filterTanggalSampai, setFilterTanggalSampai] = useState('');

  // Helper: get fiscal month date range (calendar month: 1..end-of-month)
  function getFiscalMonthRange(now: Date) {
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dari = `${year}-${pad(month + 1)}-01`;
    // last day of month: create date of first day next month, subtract 1 day
    const nextMonth = new Date(year, month + 1, 1);
    const lastDayDate = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
    const sampai = `${lastDayDate.getFullYear()}-${pad(lastDayDate.getMonth() + 1)}-${pad(lastDayDate.getDate())}`;
    return { dari, sampai };
  }



  // Set default filter tanggal for Detail mode to current fiscal month
  useEffect(() => {
    if (typeData === 'Detail') {
      const { dari, sampai } = getFiscalMonthRange(new Date());
      setFilterTanggalDari(dari);
      setFilterTanggalSampai(sampai);
    }
  }, [typeData, fiscalYear]);

  const [filterBulan, setFilterBulan] = useState('ALL');
  const [filterTahun, setFilterTahun] = useState(currentYear.toString());
  const [filterPerusahaan, setFilterPerusahaan] = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterSubKategori, setFilterSubKategori] = useState('');
  const [filterAkun, setFilterAkun] = useState('');
  const [filterInputBy, setFilterInputBy] = useState('');
  const [filterSpecialType, setFilterSpecialType] = useState<'ALL' | 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgressState>(initialImportProgress);
  // Helper untuk menentukan bulan fiskal dari tanggal (calendar month)
  function getFiscalMonthFromDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.getMonth(); // 0-based
    const year = date.getFullYear();
    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${monthShorts[month]}-${String(year).slice(-2)}`;
  }
  const [addModalOpen, setAddModalOpen] = useState(false);
  // Fetch fiscal months dari backend
  const {
    data: fiscalMonthsData,
    isLoading: isMonthsLoading,
    refetch: refetchFiscalMonths
  } = useQuery({
    queryKey: ['fiscal-months', fiscalYear],
    queryFn: async () => {
      try {
        const res = await axiosInstance.get(`/fiscal/months?tahun=${fiscalYear}`);
        return res.data.months || [];
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data bulan fiskal.';
        toast.error(msg);
        throw error;
      }
    },
  });

  // Refresh fiscal months setiap tahun fiskal berubah
  useEffect(() => {
    refetchFiscalMonths();
  }, [fiscalYear, refetchFiscalMonths]);
  // Reset bulan fiskal di form ketika tahun fiskal berubah agar tidak memegang nilai lama
  useEffect(() => {
    setFormData(prev => ({ ...prev, bulan_fiskal: '' }));
  }, [fiscalYear]);
  // Reset akun filter ketika kategori/sub kategori berubah
  useEffect(() => {
    setFilterAkun('');
  }, [filterKategori, filterSubKategori]);
  useEffect(() => {
    if (typeData !== 'Detail') {
      setFilterSpecialType('ALL');
    }
  }, [typeData]);
  // Reset halaman saat filter/opsi tabel berubah
  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    filterAkun,
    filterInputBy,
    filterTanggalDari,
    filterTanggalSampai,
    filterPerusahaan,
    filterBulan,
    filterTahun,
    filterKategori,
    filterSubKategori,
    filterSpecialType,
  ]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteData, setDeleteData] = useState<any>(null);
  const [deleteSecretCode, setDeleteSecretCode] = useState('');
  const [deletingTransaksi, setDeletingTransaksi] = useState(false);
  const [deleteAttachmentDialogOpen, setDeleteAttachmentDialogOpen] = useState(false);
  const [deleteAttachmentData, setDeleteAttachmentData] = useState<{ transaksiId: string; filename: string; fileUrl: string } | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadData, setUploadData] = useState<any>(null);

  // Handler edit transaksi (open modal) for flattened row
  const handleEdit = async (row: any) => {
    // Fetch detail data from tt_finance_detail by _id
    try {
      const res = await axiosInstance.get(`/transaksi/tt-finance-detail?id=${row._id}`);
      // Find the correct detail by _id
      let detail = null;
      if (res.data.data && Array.isArray(res.data.data)) {
        detail = res.data.data.find((d: any) => d._id === row._id) || row;
      } else {
        detail = row;
      }
      // Use bulan from detail, not from fiscalMonthsData
      const formattedValue = formatNumberInput(detail.nilai?.toString() || '0');
      setEditFormattedNilai(formattedValue);
      setEditData({
        id: detail._id,
        kategori: detail.kategori,
        sub_kategori: detail.sub_kategori,
        akun: detail.akun,
        bulan: getFiscalMonthFromDate(detail.tanggal || ''),
        nilai: detail.nilai,
        input_by: detail.input_by || detail.created_by,
        tanggal: detail.tanggal || '',
        keterangan: detail.keterangan || '',
        is_special_transaction: Boolean(detail.is_special_transaction),
        transaction_mode: detail.transaction_mode || (detail.is_special_transaction ? 'SPECIAL' : 'NORMAL'),
        status_final: detail.status_final !== false,
        source_type: detail.source_type || 'REKENING',
        asset_id: getReferenceId(detail.asset_id),
        asset_qty: detail.asset_qty ?? '',
        perusahaan_id: perusahaanList.find((p) => p.nama_perusahaan === detail.nama_perusahaan)?._id || '',
        rekening_id: rekeningList.find((r) => r.no_rekening === detail.no_rekening && r.kode_bank === detail.kode_bank)?._id || '',
      });
      setEditModalOpen(true);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal mengambil detail transaksi.';
      toast.error(msg);
    }
  };

  // Reset bulan fiskal in edit modal when tahun fiskal changes
  useEffect(() => {
    if (editModalOpen) {
      setEditData((prev) => prev ? { ...prev, bulan: '' } : prev);
    }
  }, [fiscalYear, editModalOpen]);

  // Handler simpan edit
  const handleEditSave = async () => {
    try {
      // Validasi field wajib
      if (!editData.perusahaan_id) {
        toast.error('Perusahaan wajib dipilih!');
        return;
      }
      // Nilai 0 dianggap valid, hanya undefined/null/kosong yang tidak valid
      if (
        !editData.kategori ||
        !editData.sub_kategori ||
        !editData.akun ||
        editData.nilai === undefined || editData.nilai === null || editData.nilai === '' ||
        !editData.tanggal
      ) {
        toast.error('Pastikan semua field wajib sudah diisi!');
        return;
      }
      const perusahaanObj = perusahaanList.find((p) => p._id === editData.perusahaan_id);
      let rekeningObj = null;
      const editSourceType = editData.source_type || 'REKENING';
      if (editSourceType === 'REKENING' && editData.rekening_id && editData.rekening_id !== 'none') {
        rekeningObj = rekeningList.find((r) => r._id === editData.rekening_id);
      }
      const editAssetQty = Number(editData.asset_qty);
      if (editSourceType === 'ASSET' && (!editData.asset_id || Number.isNaN(editAssetQty) || editAssetQty <= 0)) {
        toast.error('Asset dan qty asset wajib diisi dengan benar!');
        return;
      }
      const payload = {
        kategori: editData.kategori,
        sub_kategori: editData.sub_kategori,
        akun: editData.akun,
        bulan: editData.bulan,
        nilai: editData.nilai,
        input_by: editData.input_by,
        tanggal: editData.tanggal,
        keterangan: editData.keterangan,
        is_special_transaction: Boolean(editData.is_special_transaction),
        transaction_mode: editData.transaction_mode || (editData.is_special_transaction ? 'SPECIAL' : 'NORMAL'),
        status_final: editData.status_final !== false,
        kode_perusahaan: perusahaanObj?.kode_perusahaan || '',
        nama_perusahaan: perusahaanObj?.nama_perusahaan || '',
        source_type: editSourceType,
        kode_bank: editSourceType === 'REKENING' ? (rekeningObj?.kode_bank || '') : '',
        no_rekening: editSourceType === 'REKENING' ? (rekeningObj?.no_rekening || '') : '',
        asset_id: editSourceType === 'ASSET' ? editData.asset_id : undefined,
        asset_qty: editSourceType === 'ASSET' ? editAssetQty : undefined,
      };
      await axiosInstance.put(`/transaksi/${editData.id}`, payload);
      setEditModalOpen(false);
      setEditData(null);
      queryClient.invalidateQueries({ queryKey: ['transaksi'] });
      queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets-summary'] });
      toast.success('Transaksi berhasil diupdate!');
      queryClient.invalidateQueries({ queryKey: ['transaksi'] });
      queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
      toast.success('Transaksi berhasil diupdate!');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Gagal update transaksi.';
      toast.error(msg);
    }
  };

  // Handler hapus transaksi bulanan - open confirmation dialog
  const handleDelete = (row: any) => {
    setDeleteData(row);
    setDeleteSecretCode('');
    setDeleteDialogOpen(true);
  };

  const handleUploadAttachments = (row: any) => {
    setUploadData(row);
    setUploadModalOpen(true);
  };

  const handleDeleteAttachment = (transaksiId: string, filename: string, fileUrl: string) => {
    setDeleteAttachmentData({ transaksiId, filename, fileUrl });
    setDeleteAttachmentDialogOpen(true);
  };

  // Handler konfirmasi hapus
  const handleConfirmDelete = async () => {
    if (!deleteData) return;
    if (deleteData.is_validated && !deleteSecretCode.trim()) {
      toast.error('Secret code wajib diisi untuk menghapus transaksi yang sudah divalidasi.');
      return;
    }
    setDeletingTransaksi(true);
    try {
      const parentId = deleteData.parentId || deleteData._id;
      await axiosInstance.delete(`/transaksi/${parentId}`, {
        data: {
          deleted_by: user?.name || 'SYSTEM',
          ...(deleteData.is_validated ? { secret_code: deleteSecretCode.trim() } : {}),
        }
      });
      queryClient.invalidateQueries({ queryKey: ['transaksi'] });
      queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
      toast.success('Transaksi berhasil dihapus!');
      setDeleteDialogOpen(false);
      setDeleteData(null);
      setDeleteSecretCode('');
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal menghapus transaksi.';
      toast.error(msg);
    } finally {
      setDeletingTransaksi(false);
    }
  };

  // Handler konfirmasi hapus attachment
  const handleConfirmDeleteAttachment = async () => {
    if (!deleteAttachmentData) return;
    try {
      await axiosInstance.delete(`/transaksi/${deleteAttachmentData.transaksiId}/attachments/${deleteAttachmentData.filename}`);
      toast.success('Attachment berhasil dihapus!');
      setDeleteAttachmentDialogOpen(false);
      setDeleteAttachmentData(null);
      // Refresh data
      refetch();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal menghapus attachment.';
      toast.error(msg);
    }
  };

  const handleToggleStatusFinal = async (row: any) => {
    const nextStatus = row.status_final === false;
    try {
      await axiosInstance.put(`/transaksi/${row._id}/status-final`, { status_final: nextStatus });
      queryClient.setQueryData(['transaksi'], (oldData: any) => {
        if (!oldData?.data || !Array.isArray(oldData.data)) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((item: any) =>
            item._id === row._id ? { ...item, status_final: nextStatus } : item
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['transaksi'] });
      if (refetch) refetch();
      toast.success(nextStatus ? 'Transaksi ditandai final.' : 'Transaksi ditandai belum final.');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal mengubah status final.');
    }
  };
  // ...existing code...
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Fetch perusahaan for dropdown
  const { data: perusahaanList = [] } = useQuery({
    queryKey: ['perusahaan-all'],
    queryFn: async () => {
      try {
        const res = await axiosInstance.get('/master/perusahaan?all=true');
        return res.data || [];
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data perusahaan.';
        toast.error(msg);
        throw error;
      }
    },
  });

  const { data: usersList = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !isSsoSession,
  });
  const { data: assetList = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: fetchAssets,
  });

  const [formData, setFormData] = useState({
    kategori_id: '',
    subkategori_id: '',
    akun_id: '',
    bulan_fiskal: '',
    nilai: 0,
    input_by: '',
    keterangan: '',
    tanggal: '',
    perusahaan_id: '', // new
    rekening_id: '',   // new
    source_type: 'REKENING' as 'REKENING' | 'ASSET',
    asset_id: '',
    asset_qty: '',
    status_final: true,
    is_special_transaction: false,
    transaction_mode: 'NORMAL' as 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY',
  });
  const [createAttachments, setCreateAttachments] = useState<File[]>([]);
  const [creatingWithAttachments, setCreatingWithAttachments] = useState(false);
  const [splitDanaEnabled, setSplitDanaEnabled] = useState(false);
  const [splitDanaRows, setSplitDanaRows] = useState<SplitDanaRow[]>([]);

  // Fiscal month validation hooks (must be after formData, editModalOpen, editData)
  const [fiscalMonthInvalid, setFiscalMonthInvalid] = useState(false);
  const [fiscalMonthAlert, setFiscalMonthAlert] = useState('');

  useEffect(() => {
    if (!formData?.bulan_fiskal) {
      setFiscalMonthInvalid(false);
      setFiscalMonthAlert('');
      return;
    }
    const fiscalMonthYear = getFiscalMonthYear(formData.bulan_fiskal);
    if (fiscalMonthYear && fiscalMonthYear > fiscalYear) {
      setFiscalMonthInvalid(true);
      setFiscalMonthAlert('Bulan fiskal melebihi tahun fiskal yang diizinkan. Simpan dinonaktifkan.');
    } else {
      setFiscalMonthInvalid(false);
      setFiscalMonthAlert('');
    }
  }, [formData?.bulan_fiskal, fiscalYear]);

  useEffect(() => {
    if (!editModalOpen || !editData?.tanggal) {
      setFiscalMonthInvalid(false);
      setFiscalMonthAlert('');
      return;
    }
    const bulanFiskal = getFiscalMonthFromDate(editData.tanggal);
    const fiscalMonthYear = getFiscalMonthYear(bulanFiskal);
    if (fiscalMonthYear && fiscalMonthYear > fiscalYear) {
      setFiscalMonthInvalid(true);
      setFiscalMonthAlert('Bulan fiskal melebihi tahun fiskal yang diizinkan. Simpan dinonaktifkan.');
    } else {
      setFiscalMonthInvalid(false);
      setFiscalMonthAlert('');
    }
  }, [editModalOpen, editData?.tanggal, fiscalYear]);

  // Formatted input values for display
  const [formattedNilai, setFormattedNilai] = useState('');
  const [editFormattedNilai, setEditFormattedNilai] = useState('');
  const selectedAddPerusahaan = useMemo(
    () => perusahaanList.find((p) => p._id === formData.perusahaan_id),
    [perusahaanList, formData.perusahaan_id]
  );
  const filteredAddRekeningList = useMemo(() => {
    if (!formData.perusahaan_id) return [];
    return rekeningList.filter((r: any) => {
      const rekeningPerusahaanIds = getReferenceIds(r.perusahaan_ids);
      if (rekeningPerusahaanIds.length > 0) return rekeningPerusahaanIds.includes(String(formData.perusahaan_id));
      const rekeningPerusahaanId = getReferenceId(r.perusahaan_id);
      if (rekeningPerusahaanId) return rekeningPerusahaanId === String(formData.perusahaan_id);
      return (
        (selectedAddPerusahaan?.kode_perusahaan && r.kode_perusahaan === selectedAddPerusahaan.kode_perusahaan) ||
        (selectedAddPerusahaan?.nama_perusahaan && r.nama_perusahaan === selectedAddPerusahaan.nama_perusahaan)
      );
    });
  }, [rekeningList, formData.perusahaan_id, selectedAddPerusahaan]);
  const selectedEditPerusahaan = useMemo(
    () => perusahaanList.find((p) => p._id === editData?.perusahaan_id),
    [perusahaanList, editData?.perusahaan_id]
  );
  const filteredEditRekeningList = useMemo(() => {
    if (!editData?.perusahaan_id) return [];
    return rekeningList.filter((r: any) => {
      const rekeningPerusahaanIds = getReferenceIds(r.perusahaan_ids);
      if (rekeningPerusahaanIds.length > 0) return rekeningPerusahaanIds.includes(String(editData.perusahaan_id));
      const rekeningPerusahaanId = getReferenceId(r.perusahaan_id);
      if (rekeningPerusahaanId) return rekeningPerusahaanId === String(editData.perusahaan_id);
      return (
        (selectedEditPerusahaan?.kode_perusahaan && r.kode_perusahaan === selectedEditPerusahaan.kode_perusahaan) ||
        (selectedEditPerusahaan?.nama_perusahaan && r.nama_perusahaan === selectedEditPerusahaan.nama_perusahaan)
      );
    });
  }, [rekeningList, editData?.perusahaan_id, selectedEditPerusahaan]);
  const selectedAddRekening =
    formData.rekening_id && formData.rekening_id !== 'none'
      ? filteredAddRekeningList.find((r) => r._id === formData.rekening_id) || rekeningList.find((r) => r._id === formData.rekening_id)
      : null;
  const filteredAddAssetList = useMemo(() => {
    if (!formData.perusahaan_id) return assetList;
    const perusahaan = perusahaanList.find((p) => p._id === formData.perusahaan_id);
    return assetList.filter((asset: AssetItem) => {
      const assetPerusahaanId = getReferenceId(asset.perusahaan_id);
      if (assetPerusahaanId) return assetPerusahaanId === String(formData.perusahaan_id);
      return (
        !asset.nama_perusahaan ||
        (perusahaan?.kode_perusahaan && asset.kode_perusahaan === perusahaan.kode_perusahaan) ||
        (perusahaan?.nama_perusahaan && asset.nama_perusahaan === perusahaan.nama_perusahaan)
      );
    });
  }, [assetList, formData.perusahaan_id, perusahaanList]);
  const filteredEditAssetList = useMemo(() => {
    if (!editData?.perusahaan_id) return assetList;
    const perusahaan = perusahaanList.find((p) => p._id === editData.perusahaan_id);
    return assetList.filter((asset: AssetItem) => {
      const assetPerusahaanId = getReferenceId(asset.perusahaan_id);
      if (assetPerusahaanId) return assetPerusahaanId === String(editData.perusahaan_id);
      return (
        !asset.nama_perusahaan ||
        (perusahaan?.kode_perusahaan && asset.kode_perusahaan === perusahaan.kode_perusahaan) ||
        (perusahaan?.nama_perusahaan && asset.nama_perusahaan === perusahaan.nama_perusahaan)
      );
    });
  }, [assetList, editData?.perusahaan_id, perusahaanList]);
  const selectedAddAsset = formData.asset_id
    ? filteredAddAssetList.find((asset: AssetItem) => asset._id === formData.asset_id) || assetList.find((asset: AssetItem) => asset._id === formData.asset_id)
    : null;
  const selectedEditAsset = editData?.asset_id
    ? filteredEditAssetList.find((asset: AssetItem) => asset._id === editData.asset_id) || assetList.find((asset: AssetItem) => asset._id === editData.asset_id)
    : null;
  const getRekeningListForPerusahaan = (perusahaanId: string) => {
    const perusahaan = perusahaanList.find((p) => p._id === perusahaanId);
    if (!perusahaanId) return [];
    return rekeningList.filter((r: any) => {
      const rekeningPerusahaanIds = getReferenceIds(r.perusahaan_ids);
      if (rekeningPerusahaanIds.length > 0) return rekeningPerusahaanIds.includes(String(perusahaanId));
      const rekeningPerusahaanId = getReferenceId(r.perusahaan_id);
      if (rekeningPerusahaanId) return rekeningPerusahaanId === String(perusahaanId);
      return (
        (perusahaan?.kode_perusahaan && r.kode_perusahaan === perusahaan.kode_perusahaan) ||
        (perusahaan?.nama_perusahaan && r.nama_perusahaan === perusahaan.nama_perusahaan)
      );
    });
  };
  const totalSplitDana = splitDanaRows.reduce((sum, row) => sum + Number(row.nominal || 0), 0);
  const sisaSplitDana = Number(formData.nilai || 0) - totalSplitDana;

  // Persist selected bulan per fiscal year in localStorage so refresh keeps selection
  const selectedMonthKey = `transaksi_selected_bulan_${fiscalYear}`;

  // When fiscalMonthsData loads, pick a sensible default (stored selection or first month)
  useEffect(() => {
    if (!fiscalMonthsData || fiscalMonthsData.length === 0) return;
    const stored = localStorage.getItem(selectedMonthKey);
    // Normalize comparison to avoid issues with spacing/formatting
    const monthsNormalized = fiscalMonthsData.map((m: string) => (m || '').trim());
    if (stored) {
      const storedNorm = stored.trim();
      const matchIndex = monthsNormalized.findIndex((m: string) => m === storedNorm);
      if (matchIndex !== -1) {
        const matched = fiscalMonthsData[matchIndex];
        setFormData(prev => ({ ...prev, bulan_fiskal: matched }));
        return;
      }
    }
    // Prefer current month (formatted as e.g. 'MAR - 25') if present, otherwise default to first
    const now = new Date();
    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const prefer = `${monthShorts[now.getMonth()]} - ${now.getFullYear().toString().slice(-2)}`;
    const preferIndex = monthsNormalized.findIndex((m: string) => m === prefer);
    const defaultMonth = preferIndex !== -1 ? fiscalMonthsData[preferIndex] : fiscalMonthsData[0];
    setFormData(prev => ({ ...prev, bulan_fiskal: defaultMonth }));
    localStorage.setItem(selectedMonthKey, defaultMonth);
  }, [fiscalMonthsData, selectedMonthKey]);

  // Save user's selection when bulan_fiskal changes
  useEffect(() => {
    if (formData.bulan_fiskal) {
      localStorage.setItem(selectedMonthKey, formData.bulan_fiskal);
    }
  }, [formData.bulan_fiskal, selectedMonthKey]);

  useEffect(() => {
    setFormData((prev) => {
      if (!prev.perusahaan_id) {
        return prev.rekening_id ? { ...prev, rekening_id: '' } : prev;
      }
      if (!prev.rekening_id || prev.rekening_id === 'none') return prev;
      const exists = filteredAddRekeningList.some((r: any) => r._id === prev.rekening_id);
      return exists ? prev : { ...prev, rekening_id: '' };
    });
  }, [formData.perusahaan_id, filteredAddRekeningList]);

  useEffect(() => {
    if (!editData) return;
    setEditData((prev: any) => {
      if (!prev) return prev;
      if (!prev.perusahaan_id) {
        return prev.rekening_id ? { ...prev, rekening_id: 'none' } : prev;
      }
      if (!prev.rekening_id || prev.rekening_id === 'none') return prev;
      const exists = filteredEditRekeningList.some((r: any) => r._id === prev.rekening_id);
      return exists ? prev : { ...prev, rekening_id: 'none' };
    });
  }, [editData?.perusahaan_id, filteredEditRekeningList]);
  // ...existing code...

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['kategori'],
    queryFn: async () => {
      try {
        const response = await axiosInstance.get('/master/kategori');
        return response.data || [];
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data kategori.';
        toast.error(msg);
        throw error;
      }
    },
  });

  // Fetch all subcategories (no filter)
  const { data: subCategories = [] } = useQuery({
    queryKey: ['subkategori'],
    queryFn: async () => {
      try {
        const response = await axiosInstance.get('/master/subkategori');
        return response.data || [];
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data sub kategori.';
        toast.error(msg);
        throw error;
      }
    },
  });

  // Fetch all akun (no filter)
  const { data: accounts = [] } = useQuery({
    queryKey: ['akun'],
    queryFn: async () => {
      try {
        const response = await axiosInstance.get('/master/akun');
        return response.data || [];
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data akun.';
        toast.error(msg);
        throw error;
      }
    },
  });

  // Filter sub kategori sesuai kategori yang dipilih (backend: kategori = nama)
  const filteredSubCategories = formData.kategori_id
    ? subCategories.filter((sub) => {
      const selectedKategori = categories.find((cat) => cat._id === formData.kategori_id)?.kategori;
      return sub.kategori === selectedKategori;
    })
    : [];

  // Filter akun sesuai sub kategori yang dipilih (backend: sub_kategori = nama)
  const filteredAccounts = formData.subkategori_id && formData.kategori_id
    ? accounts.filter((acc) => {

      const selectedSubKategori = subCategories.find((sk) => sk._id === formData.subkategori_id);
      const selectedKategori = categories.find((cat) => cat._id === formData.kategori_id)?.kategori;
      console.log(selectedKategori);
      console.log(selectedSubKategori);
      console.log("MENCARI", selectedSubKategori?.sub_kategori);
      console.log("SUB KAREGORI KODE", selectedSubKategori?.kode);

      console.log(acc.sub_kategori === selectedSubKategori?.sub_kategori);
      console.log(acc.kategori === selectedKategori);
      console.log(acc.sub_kategori_kode === selectedSubKategori?.kode);

      console.log(acc.sub_kategori === selectedSubKategori?.sub_kategori &&
        acc.kategori === selectedKategori &&
        acc.sub_kategori_kode === selectedSubKategori?.kode);

      return (
        acc.sub_kategori === selectedSubKategori?.sub_kategori &&
        acc.kategori === selectedKategori &&
        acc.sub_kategori_kode === selectedSubKategori?.kode
      );
    })
    : [];

  // Filter untuk edit modal
  const editFilteredSubCategories = editData?.kategori
    ? subCategories.filter((sub) => sub.kategori === editData.kategori)
    : [];

  const editFilteredAccounts = editData?.sub_kategori && editData?.kategori
    ? accounts.filter((acc) => {
      // Temukan sub kategori yang cocok dengan nama dan kategori
      const selectedSubKategori = subCategories.find(
        (sk) => sk.sub_kategori === editData.sub_kategori && sk.kategori === editData.kategori
      );
      return (
        acc.sub_kategori === editData.sub_kategori &&
        acc.kategori === editData.kategori &&
        acc.sub_kategori_kode === selectedSubKategori?.kode
      );
    })
    : [];

  // Fetch data based on filter type
  const {
    data: transaksiResp,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [
      'transaksi',
      typeData,
      page,
      pageSize,
      filterTanggalDari,
      filterTanggalSampai,
      filterPerusahaan,
      filterBulan,
      filterTahun,
      filterKategori,
      filterSubKategori,
      filterAkun,
      filterInputBy,
      filterSpecialType,
      searchQuery,
      fiscalYear,
      kategoriSort,
    ],
    queryFn: async () => {
      try {
        const searching = (searchQuery || '').trim().length > 0;
        if (typeData === 'Detail') {
          // Query tt_finance_detail
          const params = new URLSearchParams();
          if (searching) params.append('q', searchQuery);
          if (filterTanggalDari) params.append('from', filterTanggalDari);
          if (filterTanggalSampai) params.append('to', filterTanggalSampai);
          if (!searching && filterPerusahaan && filterPerusahaan !== 'ALL') params.append('nama_perusahaan', filterPerusahaan);
          if (filterKategori && filterKategori !== 'ALL') params.append('kategori', filterKategori);
          if (filterSubKategori && filterSubKategori !== 'ALL') params.append('sub_kategori', filterSubKategori);
          if (filterAkun && filterAkun !== 'ALL') params.append('akun', filterAkun);
          if (filterInputBy && filterInputBy !== 'ALL') params.append('input_by', filterInputBy);
          if (filterSpecialType !== 'ALL') params.append('special_type', filterSpecialType);
          // When searching, fetch a large page to include all matches
          if (searching) {
            params.append('page', '1');
            params.append('limit', '10000');
          } else {
            params.append('page', String(page));
            params.append('limit', String(pageSize));
          }
          if (kategoriSort) params.append('sortKategori', kategoriSort);
          const response = await axiosInstance.get(`/transaksi/tt-finance-detail?${params.toString()}`);
          return { data: response.data.data, totalPages: searching ? 1 : (response.data.totalPages || 1) };
        } else {
          // Query tt_summary_v2 (rekap)
          const params = new URLSearchParams();
          if (searching) params.append('q', searchQuery);
          if (filterBulan && filterBulan !== 'ALL' && filterTahun) {
            const tahun2Digit = String(filterTahun).slice(-2);
            // Kirim satu format; backend sudah handle variasi spasi
            params.append('bulan', `${filterBulan}-${tahun2Digit}`);
          }
          if (filterTahun) params.append('tahun', filterTahun);
          if (!searching && filterPerusahaan) params.append('nama_perusahaan', filterPerusahaan);
          if (filterKategori && filterKategori !== 'ALL') params.append('kategori', filterKategori);
          if (filterSubKategori && filterSubKategori !== 'ALL') params.append('sub_kategori', filterSubKategori);
          if (filterAkun && filterAkun !== 'ALL') params.append('akun', filterAkun);
          if (filterInputBy && filterInputBy !== 'ALL') params.append('input_by', filterInputBy);
          params.append('flatten', '1');
          if (searching) {
            params.append('page', '1');
            params.append('limit', '10000');
          } else {
            params.append('page', String(page));
            params.append('limit', String(pageSize));
          }
          if (kategoriSort) params.append('sortKategori', kategoriSort);
          const response = await axiosInstance.get(`/transaksi?${params.toString()}`);
          return { data: response.data.data, totalPages: searching ? 1 : response.data.totalPages, total: response.data.total, totalNilai: response.data.totalNilai };
        }
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data transaksi.';
        toast.error(msg);
        throw error;
      }
    },
    // Always refetch on mount/key change and don't keep previous data
    refetchOnMount: 'always',
  });

  const transaksiList = (transaksiResp as any)?.data || [];
  // Apply client-side perusahaan filter as a safety net
  const perusahaanFilteredList = (() => {
    const arr = Array.isArray(transaksiList) ? transaksiList : [];
    // Hanya filter perusahaan pada Detail; Rekap tidak memiliki field perusahaan
    if (typeData === 'Detail' && filterPerusahaan && !searchQuery) {
      return arr.filter((row: any) => (row?.nama_perusahaan || '').trim() === filterPerusahaan);
    }
    return arr;
  })();
  // In search mode, rely on backend `q` filtering to avoid double-filtering.
  const searchFilteredList = (() => {
    const arr = [...perusahaanFilteredList];
    if (searchQuery && searchQuery.trim().length > 0) return arr;
    return arr;
  })();
  // Use backend-provided sorting; do not resort on client to keep pagination stable
  const sortedTransaksiList = searchFilteredList;
  // Use backend-provided total pages for both modes
  const totalPages = (transaksiResp as any)?.totalPages || 1;
  // Rows to display: backend already paginates Detail and Rekap
  const displayRows = sortedTransaksiList;
  const expandableRowIds = useMemo(
    () => (Array.isArray(displayRows) ? displayRows.map((row: any, idx: number) => row._id || String(idx)) : []),
    [displayRows]
  );
  const areAllRowsExpanded = useMemo(
    () => typeData === 'Detail' && expandableRowIds.length > 0 && expandableRowIds.every((id: string) => expandedRows[id]),
    [typeData, expandableRowIds, expandedRows]
  );
  const handleExpandAllRows = () => {
    setExpandedRows(
      expandableRowIds.reduce((acc: Record<string, boolean>, id: string) => {
        acc[id] = true;
        return acc;
      }, {})
    );
  };
  const handleCollapseAllRows = () => {
    setExpandedRows({});
  };
  useEffect(() => {
    if (typeData !== 'Detail') return;
    const validIds = new Set(expandableRowIds);
    setExpandedRows((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([id, value]) => {
        if (value && validIds.has(id)) next[id] = true;
      });
      return next;
    });
  }, [typeData, expandableRowIds]);
  // Totals based on currently displayed rows
  const totalDataDisplayed = Array.isArray(displayRows) ? displayRows.length : 0;
  const totalNilaiDisplayed = Array.isArray(displayRows)
    ? displayRows.reduce((sum: number, row: any) => sum + (Number(row?.nilai) || 0), 0)
    : 0;

  // Aggregate totals across all pages via backend aggregate
  const { data: aggregateTotals } = useQuery({
    queryKey: [
      'transaksi-aggregate',
      typeData,
      filterTanggalDari,
      filterTanggalSampai,
      filterBulan,
      filterTahun,
      filterPerusahaan,
      filterKategori,
      filterSubKategori,
      filterAkun,
      filterInputBy,
      filterSpecialType,
      searchQuery,
      fiscalYear,
    ],
    queryFn: async () => {
      try {
        if (typeData === 'Detail') {
          const params = new URLSearchParams();
          const searching = (searchQuery || '').trim().length > 0;
          if (searching) params.append('q', searchQuery);
          if (filterTanggalDari) params.append('from', filterTanggalDari);
          if (filterTanggalSampai) params.append('to', filterTanggalSampai);
          if (!searching && filterPerusahaan) params.append('nama_perusahaan', filterPerusahaan);
          if (filterKategori && filterKategori !== 'ALL') params.append('kategori', filterKategori);
          if (filterSubKategori && filterSubKategori !== 'ALL') params.append('sub_kategori', filterSubKategori);
          if (filterAkun && filterAkun !== 'ALL') params.append('akun', filterAkun);
          if (filterInputBy && filterInputBy !== 'ALL') params.append('input_by', filterInputBy);
          if (filterSpecialType !== 'ALL') params.append('special_type', filterSpecialType);
          params.append('aggregate', '1');
          const response = await axiosInstance.get(`/transaksi/tt-finance-detail?${params.toString()}`);
          return response.data || { totalNilai: 0, totalCount: 0 };
        } else {
          // For Rekap, totals are included in main response already
          return {
            totalNilai: (transaksiResp as any)?.totalNilai || 0,
            totalCount: (transaksiResp as any)?.total || 0,
          };
        }
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal mengambil data total agregat.';
        toast.error(msg);
        throw error;
      }
    },
    enabled: !!transaksiResp,
    refetchOnMount: 'always',
  });

  const totalDataAllPages = (aggregateTotals as any)?.totalCount || 0;
  const totalNilaiAllPages = (aggregateTotals as any)?.totalNilai || 0;
  // Reset to first page if pageSize changes
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // Reset to first page if date filters change
  useEffect(() => {
    setPage(1);
  }, [filterTanggalDari, filterTanggalSampai]);

  const resetImportModal = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportReport(null);
    setImportProgress(initialImportProgress);
  };

  const handleImportFileChange = async (file: File | null) => {
    setImportFile(file);
    setImportReport(null);

    if (!file) {
      setImportProgress(initialImportProgress);
      return;
    }

    setImportProgress({
      phase: 'reading',
      total: null,
      uploadedPercent: 0,
      processedCount: 0,
      message: 'Membaca file dan menghitung total dokumen...',
    });

    try {
      const total = await estimateImportDocumentCount(file);
      setImportProgress({
        phase: 'idle',
        total,
        uploadedPercent: 0,
        processedCount: 0,
        message: total === null
          ? 'File siap diimport. Total dokumen akan dihitung oleh server.'
          : `File siap diimport. Estimasi total dokumen: ${total}.`,
      });
    } catch (error: any) {
      setImportProgress({
        phase: 'failed',
        total: null,
        uploadedPercent: 0,
        processedCount: 0,
        message: error?.message || 'File tidak bisa dibaca. Pastikan format JSON/CSV valid.',
      });
      toast.error('File import tidak valid.');
    }
  };

  const handleImportDetails = async () => {
    if (!importFile) {
      toast.error('Pilih file JSON atau CSV terlebih dahulu.');
      return;
    }

    setImporting(true);
    setImportReport(null);
    setImportProgress((prev) => ({
      ...prev,
      phase: 'reading',
      uploadedPercent: 0,
      processedCount: 0,
      message: 'Membaca file import sebelum diproses...',
    }));
    try {
      const rows = await parseImportFileRows(importFile);
      const total = rows.length;
      const batchSize = 1;
      const aggregateReport: ImportReport = {
        total,
        success: 0,
        skipped: 0,
        failed: 0,
        summary_rebuilt: 0,
        errors: [],
        successes: [],
        skips: [],
      };

      setImportProgress({
        phase: 'processing',
        total,
        uploadedPercent: 0,
        processedCount: 0,
        message: `Memproses dokumen 0 / ${total}.`,
      });

      for (let start = 0; start < rows.length; start += batchSize) {
        const batchRows = rows.slice(start, start + batchSize);
        const response = await axiosInstance.post('/transaksi/import-details/batch', {
          rows: batchRows,
          startRow: start + 1,
          total,
        });
        const batchReport = response.data?.report as ImportReport;

        aggregateReport.success += batchReport?.success || 0;
        aggregateReport.skipped = (aggregateReport.skipped || 0) + (batchReport?.skipped || 0);
        aggregateReport.failed += batchReport?.failed || 0;
        aggregateReport.summary_rebuilt += batchReport?.summary_rebuilt || 0;
        aggregateReport.errors.push(...(batchReport?.errors || []));
        aggregateReport.successes?.push(...(batchReport?.successes || []));
        aggregateReport.skips?.push(...(batchReport?.skips || []));

        const processedCount = Math.min(start + batchRows.length, total);
        const uploadedPercent = total > 0 ? Math.round((processedCount * 100) / total) : 100;
        setImportReport({ ...aggregateReport });
        setImportProgress({
          phase: 'processing',
          total,
          uploadedPercent,
          processedCount,
          message: `Memproses dokumen ${processedCount} / ${total}. Sukses ${aggregateReport.success}, skip ${aggregateReport.skipped || 0}, gagal ${aggregateReport.failed}.`,
        });
      }

      setImportReport({ ...aggregateReport });
      setImportProgress({
        phase: 'completed',
        total,
        uploadedPercent: 100,
        processedCount: total,
        message: `Import selesai. Sukses ${aggregateReport.success}, skip ${aggregateReport.skipped || 0}, gagal ${aggregateReport.failed}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['transaksi'] });
      queryClient.invalidateQueries({ queryKey: ['transaksi-aggregate'] });
      toast.success(`Import selesai. Sukses ${aggregateReport.success}, skip ${aggregateReport.skipped || 0}, gagal ${aggregateReport.failed}.`);
    } catch (error: any) {
      setImportProgress((prev) => ({
        ...prev,
        phase: 'failed',
        message: error?.response?.data?.message || 'Import gagal.',
      }));
      toast.error(error?.response?.data?.message || 'Import gagal.');
    } finally {
      setImporting(false);
    }
  };

  // Create transaksi mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      try {
        const response = await axiosInstance.post('/transaksi', payload);
        return response.data;
      } catch (error: any) {
        const msg = error?.response?.data?.message || 'Gagal menyimpan transaksi.';
        toast.error(msg);
        throw error;
      }
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Gagal menyimpan transaksi. Silakan coba lagi.';
      toast.error(msg);
    },
  });

  const updateRekeningCacheAfterPendingCreate = (rekening: any, payload: any) => {
    const splitRowsPayload = Array.isArray(payload?.split_dana) ? payload.split_dana : [];
    if (!rekening || payload?.transaction_mode === 'FINANCE_ONLY') return;

    const nilai = Number(payload?.nilai || 0);
    if (!Number.isFinite(nilai) || nilai === 0) return;

    const delta = payload?.kategori === 'PENDAPATAN' ? nilai : -nilai;
    const sourceBaseDelta = splitRowsPayload.length > 0 ? nilai : delta;
    const splitOutDelta = splitRowsPayload.reduce((sum: number, split: any) => {
      const nominal = Number(split?.nominal || 0);
      return sum - nominal;
    }, 0);
    queryClient.setQueryData(['rekening-all'], (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((item: any) => {
        const isSourceRekening =
          (rekening._id && item._id === rekening._id) ||
          (item.kode_bank === rekening.kode_bank && item.no_rekening === rekening.no_rekening);
        const splitInDelta = splitRowsPayload.reduce((sum: number, split: any) => {
          const isTarget = item.kode_bank === split.kode_bank && item.no_rekening === split.no_rekening;
          const nominal = Number(split.nominal || 0);
          return sum + (isTarget ? nominal : 0);
        }, 0);

        const holdDelta = (isSourceRekening ? sourceBaseDelta + splitOutDelta : 0) + splitInDelta;

        if (holdDelta === 0) return item;
        return {
          ...item,
          saldo_on_hold: Number(item.saldo_on_hold || 0) + holdDelta,
        };
      });
    });
  };

  const addSplitDanaRow = () => {
    const defaultKeluarKategori = categories.find((cat) => String(cat.kategori || '').toUpperCase() === 'BIAYA');
    const defaultKeluarSubKategori = defaultKeluarKategori
      ? subCategories.find((sub) =>
        String(sub.kategori || '').toUpperCase() === 'BIAYA' &&
        String(sub.sub_kategori || '').toUpperCase() === 'LAIN LAIN'
      )
      : null;
    const defaultKeluarAkun = defaultKeluarKategori && defaultKeluarSubKategori
      ? accounts.find((acc) =>
        String(acc.kategori || '').toUpperCase() === 'BIAYA' &&
        String(acc.sub_kategori || '').toUpperCase() === 'LAIN LAIN' &&
        String(acc.akun || '').toUpperCase() === 'LAIN LAIN'
      )
      : null;

    setSplitDanaEnabled(true);
    setSplitDanaRows((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        perusahaan_id: '',
        rekening_id: '',
        keluar_kategori_id: defaultKeluarKategori?._id || '',
        keluar_subkategori_id: defaultKeluarSubKategori?._id || '',
        keluar_akun_id: defaultKeluarAkun?._id || '',
        masuk_kategori_id: '',
        masuk_subkategori_id: '',
        masuk_akun_id: '',
        nominal: 0,
        nominalDisplay: '',
        keterangan: '',
      },
    ]);
  };

  const updateSplitDanaRow = (id: string, patch: Partial<SplitDanaRow>) => {
    setSplitDanaRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeSplitDanaRow = (id: string) => {
    setSplitDanaRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validasi field wajib
    if (!formData.perusahaan_id) {
      toast.error('Perusahaan wajib dipilih!');
      return;
    }
    const nilaiNum = Number(formData.nilai);
    const nilaiInvalid =
      formData.nilai === undefined ||
      formData.nilai === null ||
      (formData as any).nilai === '' ||
      Number.isNaN(nilaiNum);

    if (!formData.kategori_id || !formData.subkategori_id || !formData.akun_id || !formData.bulan_fiskal || nilaiInvalid || !formData.tanggal) {
      toast.error('Pastikan semua field wajib sudah diisi!');
      return;
    }
    const activeSplitRows = splitDanaEnabled
      ? splitDanaRows.filter((row) =>
        row.rekening_id &&
        Number(row.nominal || 0) > 0 &&
        row.keluar_kategori_id &&
        row.keluar_subkategori_id &&
        row.keluar_akun_id &&
        row.masuk_kategori_id &&
        row.masuk_subkategori_id &&
        row.masuk_akun_id
      )
      : [];
    if (splitDanaEnabled) {
      if (!formData.rekening_id || formData.rekening_id === 'none') {
        toast.error('Rekening sumber wajib dipilih untuk split dana.');
        return;
      }
      if (activeSplitRows.length !== splitDanaRows.length || activeSplitRows.length === 0) {
        toast.error('Lengkapi rekening tujuan, nominal, serta kategori/sub kategori/akun keluar dan masuk split dana.');
        return;
      }
      if (totalSplitDana > nilaiNum) {
        toast.error('Total split dana tidak boleh melebihi nilai transaksi sumber.');
        return;
      }
      const hasSameSourceTarget = activeSplitRows.some((row) => row.rekening_id === formData.rekening_id);
      if (hasSameSourceTarget) {
        toast.error('Rekening tujuan split tidak boleh sama dengan rekening sumber.');
        return;
      }
    }
    const akunObj = accounts.find((a) => a._id === formData.akun_id);
    const subKategoriObj = subCategories.find((sk) => sk._id === formData.subkategori_id);
    const kategoriObj = categories.find((k) => k._id === formData.kategori_id);
    const perusahaanObj = perusahaanList.find((p) => p._id === formData.perusahaan_id);
    const sourceType = formData.source_type || 'REKENING';
    let rekeningObj = null;
    if (sourceType === 'REKENING' && formData.rekening_id && formData.rekening_id !== 'none') {
      rekeningObj = rekeningList.find((r) => r._id === formData.rekening_id);
    }
    const assetQty = Number(formData.asset_qty);
    if (sourceType === 'ASSET' && (!formData.asset_id || Number.isNaN(assetQty) || assetQty <= 0)) {
      toast.error('Asset dan qty asset wajib diisi dengan benar!');
      return;
    }
    const payload: any = {
      kategori: kategoriObj?.kategori || '',
      sub_kategori: subKategoriObj?.sub_kategori || '',
      akun: akunObj?.akun || '',
      bulan: formData.bulan_fiskal,
      nilai: nilaiNum,
      input_by: user?.name || 'Unknown',
      tanggal: formData.tanggal,
      keterangan: formData.keterangan || '',
      is_special_transaction: Boolean(formData.is_special_transaction),
      transaction_mode: formData.transaction_mode || (formData.is_special_transaction ? 'SPECIAL' : 'NORMAL'),
      status_final: formData.status_final !== false,
      // Properti perusahaan
      kode_perusahaan: perusahaanObj?.kode_perusahaan || '',
      nama_perusahaan: perusahaanObj?.nama_perusahaan || '',
      source_type: sourceType,
      kode_bank: sourceType === 'REKENING' ? (rekeningObj?.kode_bank || '') : '',
      no_rekening: sourceType === 'REKENING' ? (rekeningObj?.no_rekening || '') : '',
      asset_id: sourceType === 'ASSET' ? formData.asset_id : undefined,
      asset_qty: sourceType === 'ASSET' ? assetQty : undefined,
    };
    if (activeSplitRows.length > 0) {
      payload.split_dana = activeSplitRows.map((row) => {
        const rekeningSplit = rekeningList.find((r) => r._id === row.rekening_id);
        const perusahaanSplit = perusahaanList.find((p) => p._id === row.perusahaan_id);
        const keluarKategori = categories.find((k) => k._id === row.keluar_kategori_id);
        const keluarSubKategori = subCategories.find((sk) => sk._id === row.keluar_subkategori_id);
        const keluarAkun = accounts.find((a) => a._id === row.keluar_akun_id);
        const masukKategori = categories.find((k) => k._id === row.masuk_kategori_id);
        const masukSubKategori = subCategories.find((sk) => sk._id === row.masuk_subkategori_id);
        const masukAkun = accounts.find((a) => a._id === row.masuk_akun_id);
        return {
          nominal: Number(row.nominal || 0),
          keterangan: row.keterangan || '',
          keluar_kategori: keluarKategori?.kategori || '',
          keluar_sub_kategori: keluarSubKategori?.sub_kategori || '',
          keluar_akun: keluarAkun?.akun || '',
          masuk_kategori: masukKategori?.kategori || '',
          masuk_sub_kategori: masukSubKategori?.sub_kategori || '',
          masuk_akun: masukAkun?.akun || '',
          kode_perusahaan: perusahaanSplit?.kode_perusahaan || rekeningSplit?.kode_perusahaan || '',
          nama_perusahaan: perusahaanSplit?.nama_perusahaan || rekeningSplit?.nama_perusahaan || '',
          kode_bank: rekeningSplit?.kode_bank || '',
          no_rekening: rekeningSplit?.no_rekening || '',
          nama_rekening: rekeningSplit?.nama_rekening || '',
        };
      });
    }
    setCreatingWithAttachments(true);
    try {
      const created = await createMutation.mutateAsync(payload);

      if (createAttachments.length > 0) {
        if (!created?._id) {
          toast.error('Transaksi tersimpan, tetapi ID transaksi tidak ditemukan untuk upload attachment.');
        } else {
          const attachFormData = new FormData();
          createAttachments.forEach((file) => attachFormData.append('attachments', file));
          try {
            await axiosInstance.post(`/transaksi/${created._id}/attachments`, attachFormData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });
            toast.success(`${createAttachments.length} attachment berhasil diupload.`);
          } catch (error: any) {
            const msg = error?.response?.data?.message || 'Transaksi tersimpan, tetapi upload attachment gagal.';
            toast.error(msg);
          }
        }
      }

      updateRekeningCacheAfterPendingCreate(rekeningObj, payload);
      queryClient.invalidateQueries({ queryKey: ['transaksi'] });
      queryClient.invalidateQueries({ queryKey: ['rekening-all'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['assets-summary'] });
      toast.success('Transaksi berhasil ditambahkan!');
      setFormData({
        kategori_id: '',
        subkategori_id: '',
        akun_id: '',
        bulan_fiskal: '',
        nilai: 0,
        input_by: '',
        keterangan: '',
        tanggal: '',
        perusahaan_id: '',
        rekening_id: '',
        source_type: 'REKENING',
        asset_id: '',
        asset_qty: '',
        status_final: true,
        is_special_transaction: false,
        transaction_mode: 'NORMAL',
      });
      setFormattedNilai('');
      setCreateAttachments([]);
      setSplitDanaEnabled(false);
      setSplitDanaRows([]);
    } finally {
      setCreatingWithAttachments(false);
    }
  };

  const handleCreateAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    setCreateAttachments((prev) => [...prev, ...selected]);
    e.target.value = '';
  };

  const removeCreateAttachment = (index: number) => {
    setCreateAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const closeAddTransaksiModal = () => {
    setAddModalOpen(false);
    setCreateAttachments([]);
    setFormData({
      kategori_id: '',
      subkategori_id: '',
      akun_id: '',
      bulan_fiskal: '',
      nilai: 0,
      input_by: '',
      keterangan: '',
      tanggal: '',
      perusahaan_id: '',
      rekening_id: '',
      source_type: 'REKENING',
      asset_id: '',
      asset_qty: '',
      status_final: true,
      is_special_transaction: false,
      transaction_mode: 'NORMAL',
    });
    setFormattedNilai('');
    setSplitDanaEnabled(false);
    setSplitDanaRows([]);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
    }).format(value);
  };

  const formatDateTimeShort = (value?: string | Date | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const resolveTransactionMode = (row: any): 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY' => {
    const mode = String(row?.transaction_mode || '').toUpperCase();
    if (mode === 'SPECIAL' || mode === 'FINANCE_ONLY' || mode === 'NORMAL') return mode as any;
    return row?.is_special_transaction ? 'SPECIAL' : 'NORMAL';
  };

  const getTransactionTypeLabel = (modeOrRow: any) => {
    const mode = typeof modeOrRow === 'string' ? modeOrRow : resolveTransactionMode(modeOrRow);
    if (mode === 'SPECIAL') return 'Khusus (Rekening Only)';
    if (mode === 'FINANCE_ONLY') return 'Khusus (Dashboard Only)';
    return 'Normal';
  };

  const getTransactionTypeChipLabel = (modeOrRow: any) => {
    const mode = typeof modeOrRow === 'string' ? modeOrRow : resolveTransactionMode(modeOrRow);
    if (mode === 'SPECIAL') return 'Rekening Only';
    if (mode === 'FINANCE_ONLY') return 'Dashboard Only';
    return 'Normal';
  };

  const getTransactionTypeBadgeClass = (modeOrRow: any) => {
    const mode = typeof modeOrRow === 'string' ? modeOrRow : resolveTransactionMode(modeOrRow);
    if (mode === 'SPECIAL') return 'border-amber-300 bg-amber-100 text-amber-800';
    if (mode === 'FINANCE_ONLY') return 'border-blue-300 bg-blue-100 text-blue-800';
    return 'border-slate-200 bg-slate-100 text-slate-700';
  };

  // Format number for input display (Indonesian format: 100.000)
  const formatNumberInput = (value: string) => {
    const trimmed = value.trimStart();
    const isNegative = trimmed.startsWith('-');
    // Keep only numeric characters for grouping; sign is handled separately.
    const numericValue = value.replace(/[^\d]/g, '');
    // Format with dots as thousand separators
    const formatted = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (!formatted) return isNegative ? '-' : '';
    return isNegative ? `-${formatted}` : formatted;
  };

  // Parse formatted input back to number
  const parseFormattedInput = (value: string) => {
    const trimmed = value.trim();
    const isNegative = trimmed.startsWith('-');
    const numericValue = trimmed.replace(/[^\d]/g, '');
    if (!numericValue) return 0;
    const parsed = Number(numericValue);
    if (!Number.isFinite(parsed)) return 0;
    return isNegative ? -parsed : parsed;
  };

  // Export Excel handler
  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      const searching = (searchQuery || '').trim().length > 0;
      if (searching) params.append('q', searchQuery.trim());
      if (typeData === 'Detail') {
        if (filterTanggalDari) params.append('from', filterTanggalDari);
        if (filterTanggalSampai) params.append('to', filterTanggalSampai);
        if (!searching && filterPerusahaan && filterPerusahaan !== 'ALL') params.append('nama_perusahaan', filterPerusahaan);
        if (filterKategori && filterKategori !== 'ALL') params.append('kategori', filterKategori);
        if (filterSubKategori && filterSubKategori !== 'ALL') params.append('sub_kategori', filterSubKategori);
        if (filterAkun && filterAkun !== 'ALL') params.append('akun', filterAkun);
        if (filterInputBy && filterInputBy !== 'ALL') params.append('input_by', filterInputBy);
        if (filterSpecialType !== 'ALL') params.append('special_type', filterSpecialType);
      } else {
        if (filterBulan && filterBulan !== 'ALL' && filterTahun) {
          const tahun2Digit = String(filterTahun).slice(-2);
          params.append('bulan', `${filterBulan}-${tahun2Digit}`);
        }
        if (filterTahun) params.append('tahun', filterTahun);
        if (!searching && filterPerusahaan && filterPerusahaan !== 'ALL') params.append('nama_perusahaan', filterPerusahaan);
        if (filterKategori && filterKategori !== 'ALL') params.append('kategori', filterKategori);
        if (filterSubKategori && filterSubKategori !== 'ALL') params.append('sub_kategori', filterSubKategori);
        if (filterAkun && filterAkun !== 'ALL') params.append('akun', filterAkun);
        if (filterInputBy && filterInputBy !== 'ALL') params.append('input_by', filterInputBy);
        params.append('flatten', '1');
      }
      if (kategoriSort) params.append('sortKategori', kategoriSort);
      const response = await axiosInstance.get(`/transaksi/export-excel?${params.toString()}`, {
        responseType: 'blob',
      });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transaksi.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Gagal export data.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
      <div className="absolute top-0 right-0 -z-10">
        <div className="w-72 h-72 bg-gradient-to-bl from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl" />
      </div>
      <div className="absolute bottom-0 left-0 -z-10">
        <div className="w-96 h-96 bg-gradient-to-tr from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-6 py-8 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Transaksi
            </h1>
            <p className="text-gray-600 mt-2">Kelola transaksi dengan mudah dan efisien.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => {
                setImportModalOpen(true);
                setImportReport(null);
              }}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Import Data
            </Button>
            <Button
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={handleExportExcel}
            >
              Export Excel
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
              onClick={() => setAddModalOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Tambah Data
            </Button>
          </div>
        </div>
        {/* FILTER BAR - moved below title, above table */}
        <div className="bg-white/70 rounded-lg border-2 border-dashed border-blue-200 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            {/* Type Data */}
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="typeData" className="text-sm font-semibold text-slate-600">Type Data</Label>
              <Select value={typeData} onValueChange={v => setTypeData(v as 'Detail' | 'Rekap')}>
                <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Detail">Detail</SelectItem>
                  <SelectItem value="Rekap">Rekap</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Filter for Detail */}
            {typeData === 'Detail' && (
              <>
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="tanggalDari" className="text-sm font-semibold text-slate-600">Tanggal Dari</Label>
                  <Input id="tanggalDari" type="date" value={filterTanggalDari} onChange={e => setFilterTanggalDari(e.target.value)} className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] text-slate-700" />
                </div>
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="tanggalSampai" className="text-sm font-semibold text-slate-600">Tanggal Sampai</Label>
                  <Input id="tanggalSampai" type="date" value={filterTanggalSampai} onChange={e => setFilterTanggalSampai(e.target.value)} className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] text-slate-700" />
                </div>
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="filterPerusahaan" className="text-sm font-semibold text-slate-600">Perusahaan</Label>
                  <Select value={filterPerusahaan || 'ALL'} onValueChange={v => setFilterPerusahaan(v === 'ALL' ? '' : v)}>
                    <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                      <SelectValue placeholder="Semua" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua</SelectItem>
                      {perusahaanList.map((p) => (
                        <SelectItem key={p._id} value={p.nama_perusahaan}>{p.nama_perusahaan}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {/* Filter for Rekap */}
            {typeData === 'Rekap' && (
              <>
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="filterBulan" className="text-sm font-semibold text-slate-600">Bulan</Label>
                  <Select value={filterBulan} onValueChange={setFilterBulan}>
                    <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                      <SelectValue placeholder="Pilih Bulan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua</SelectItem>
                      {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((bulan) => (
                        <SelectItem key={bulan} value={bulan}>{bulan}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="filterTahun" className="text-sm font-semibold text-slate-600">Tahun</Label>
                  <Input id="filterTahun" type="number" value={filterTahun} onChange={e => setFilterTahun(e.target.value)} className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] text-slate-700" />
                </div>
              </>
            )}
            {/* Filter Kategori */}
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="filterKategori" className="text-sm font-semibold text-slate-600">Kategori</Label>
              <Select value={filterKategori || 'ALL'} onValueChange={v => setFilterKategori(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat._id} value={cat.kategori}>{cat.kategori}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Filter Sub Kategori */}
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="filterSubKategori" className="text-sm font-semibold text-slate-600">Sub Kategori</Label>
              <Select value={filterSubKategori || 'ALL'} onValueChange={v => setFilterSubKategori(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  {subCategories
                    .filter((sk) => !filterKategori || sk.kategori === filterKategori)
                    .map((sk) => (
                      <SelectItem key={sk._id} value={sk.sub_kategori}>{sk.sub_kategori}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {/* Filter Akun */}
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="filterAkun" className="text-sm font-semibold text-slate-600">Akun</Label>
              <Select value={filterAkun || 'ALL'} onValueChange={v => setFilterAkun(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  {accounts
                    .filter((acc) => (!filterKategori || acc.kategori === filterKategori) && (!filterSubKategori || acc.sub_kategori === filterSubKategori))
                    .map((acc) => (
                      <SelectItem key={acc._id} value={acc.akun}>{acc.akun}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {/* Filter Input By */}
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="filterInputBy" className="text-sm font-semibold text-slate-600">Input By</Label>
              <Select value={filterInputBy || 'ALL'} onValueChange={v => setFilterInputBy(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  {Array.from(new Set([
                    ...(usersList || []).map((u: any) => (u?.name || u?.username || '').trim()).filter(Boolean),
                    user?.name,
                  ].filter(Boolean))).map((userName) => (
                    <SelectItem key={userName} value={userName}>{userName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {typeData === 'Detail' && (
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="filterSpecialType" className="text-sm font-semibold text-slate-600">Jenis Transaksi</Label>
                <Select value={filterSpecialType} onValueChange={v => setFilterSpecialType(v as 'ALL' | 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY')}>
                  <SelectTrigger className="h-12 w-full rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                    <SelectValue placeholder="Semua" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Semua</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="SPECIAL">Khusus (Rekening Only)</SelectItem>
                    <SelectItem value="FINANCE_ONLY">Khusus (Dashboard Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Search */}
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label htmlFor="searchQuery" className="text-sm font-semibold text-slate-600">Cari</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  id="searchQuery"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari data di tabel"
                  className="h-12 w-full rounded-md border-slate-200 bg-white pl-12 text-[15px] shadow-none outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            {/* Totals Summary */}
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label className="text-sm font-semibold text-slate-600">Ringkasan</Label>
              <div className="flex h-12 flex-col justify-center rounded-md border border-slate-200 bg-white px-4 leading-tight">
                <div className="text-[15px] font-bold text-slate-800">
                  Total Nilai: {formatCurrency(totalNilaiAllPages)}
                </div>
                <div className="text-sm font-medium text-slate-600">
                  Total Data: {totalDataAllPages}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Dialog
          open={importModalOpen}
          onOpenChange={(open) => {
            if (open) {
              setImportModalOpen(true);
              return;
            }
            if (importing) {
              toast.info('Import masih berjalan. Tunggu proses selesai dulu ya.');
              return;
            }
            resetImportModal();
          }}
        >
          <DialogContent
            className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-none flex-col gap-0 overflow-hidden rounded-lg bg-white p-0 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl xl:max-w-7xl"
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (importing) event.preventDefault();
            }}
          >
            <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-2xl font-bold text-slate-900">Import tt_finance_details</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                Upload file JSON atau CSV hasil export dari program lama. Data akan masuk ke tt_finance_details dan summary valid akan dibentuk ulang ke tt_summary_v2.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <Label htmlFor="import-details-file" className="text-sm font-semibold text-slate-700">File Import</Label>
                <Input
                  id="import-details-file"
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={(event) => handleImportFileChange(event.target.files?.[0] || null)}
                  className="mt-2 h-auto min-h-11 bg-white text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Field wajib: tanggal, bulan, kategori, sub_kategori, akun, nilai. Field validasi/deleted/special akan dinormalisasi otomatis.
                </p>
              </div>

              {(importFile || importing || importProgress.phase !== 'idle') && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg ${importProgress.phase === 'completed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : importProgress.phase === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : importing || importProgress.phase === 'reading'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                        {importProgress.phase === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : importProgress.phase === 'failed' ? (
                          <XCircle className="h-5 w-5" />
                        ) : importing || importProgress.phase === 'reading' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {importProgress.phase === 'reading'
                            ? 'Membaca file'
                            : importProgress.phase === 'uploading'
                              ? 'Upload berjalan'
                              : importProgress.phase === 'processing'
                                ? 'Proses server berjalan'
                                : importProgress.phase === 'completed'
                                  ? 'Import selesai'
                                  : importProgress.phase === 'failed'
                                    ? 'Import gagal'
                                    : 'File siap import'}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{importProgress.message}</p>
                        {importFile && (
                          <p className="mt-1 text-xs text-slate-500">
                            {importFile.name} • {(importFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="w-full rounded-lg bg-slate-50 px-4 py-2 text-left sm:w-auto sm:min-w-[160px] sm:text-right">
                      <p className="text-xs font-semibold uppercase text-slate-500">Total Dokumen</p>
                      <p className="text-xl font-bold text-slate-900">
                        {importReport?.total ?? importProgress.total ?? '-'}
                      </p>
                      {importProgress.total !== null && (
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {importProgress.processedCount} / {importProgress.total}
                        </p>
                      )}
                    </div>
                  </div>

                  {(importing || importProgress.uploadedPercent > 0) && (
                    <div className="mt-4">
                      <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                        <span>Progress Dokumen</span>
                        <span>{importProgress.uploadedPercent}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all duration-300"
                          style={{ width: `${importProgress.uploadedPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importReport && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Total</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{importReport.total}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-semibold uppercase text-emerald-700">Success</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700">{importReport.success}</p>
                    </div>
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                      <p className="text-xs font-semibold uppercase text-orange-700">Skipped</p>
                      <p className="mt-1 text-2xl font-bold text-orange-700">{importReport.skipped || 0}</p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                      <p className="text-xs font-semibold uppercase text-red-700">Failed</p>
                      <p className="mt-1 text-2xl font-bold text-red-700">{importReport.failed}</p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold uppercase text-blue-700">Summary</p>
                      <p className="mt-1 text-2xl font-bold text-blue-700">{importReport.summary_rebuilt}</p>
                    </div>
                  </div>

                  {!importing && !!importReport.skips?.length && (
                    <div className="max-h-[30dvh] overflow-auto rounded-lg border border-orange-200">
                      <Table className="min-w-[760px]">
                        <TableHeader>
                          <TableRow className="bg-orange-50 hover:bg-orange-50">
                            <TableHead className="w-20 text-orange-900">Row</TableHead>
                            <TableHead className="text-orange-900">Alasan Skip</TableHead>
                            <TableHead className="text-orange-900">ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importReport.skips.map((item, idx) => (
                            <TableRow key={`${item.row}-${item.id || idx}`}>
                              <TableCell className="font-semibold text-slate-900">{item.row}</TableCell>
                              <TableCell className="whitespace-normal break-words text-slate-700">{item.reason}</TableCell>
                              <TableCell className="font-mono text-xs text-slate-500">{item.id || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {!importing && importReport.errors.length > 0 && (
                    <div className="max-h-[34dvh] overflow-auto rounded-lg border border-red-200">
                      <Table className="min-w-[720px]">
                        <TableHeader>
                          <TableRow className="bg-red-50 hover:bg-red-50">
                            <TableHead className="w-20 text-red-900">Row</TableHead>
                            <TableHead className="text-red-900">Alasan Gagal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importReport.errors.map((item, idx) => (
                            <TableRow key={`${item.row}-${idx}`}>
                              <TableCell className="font-semibold text-slate-900">{item.row}</TableCell>
                              <TableCell className="whitespace-normal break-words text-slate-700">{item.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={resetImportModal} disabled={importing} className="h-11">
                  Tutup
                </Button>
                <Button
                  type="button"
                  onClick={handleImportDetails}
                  disabled={!importFile || importing}
                  className="h-11 bg-blue-600 text-white hover:bg-blue-700"
                >
                  {importing ? 'Mengimport...' : 'Mulai Import'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Input Transaksi */}
        <Dialog
          open={addModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeAddTransaksiModal();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-0 shadow-2xl backdrop-blur-md">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                    Input Transaksi
                  </h3>
                  <p className="text-gray-600 mt-1">Tambah transaksi baru</p>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6">
                {fiscalMonthInvalid && fiscalMonthAlert && (
                  <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg px-4 py-2 mb-2 text-sm font-semibold">
                    {fiscalMonthAlert}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Perusahaan Dropdown */}
                  <div className="grid gap-2">
                    <Label htmlFor="perusahaan_id" className="text-sm font-semibold text-slate-700">Perusahaan</Label>
                    <Select
                      value={formData.perusahaan_id}
                      onValueChange={value => setFormData({ ...formData, perusahaan_id: value, rekening_id: '', asset_id: '' })}
                      required
                    >
                      <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                        <SelectValue placeholder="Pilih perusahaan" />
                      </SelectTrigger>
                      <SelectContent>
                        {perusahaanList.map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            {p.nama_perusahaan}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="source_type" className="text-sm font-semibold text-slate-700">Sumber Transaksi</Label>
                    <Select
                      value={formData.source_type}
                      onValueChange={(value: 'REKENING' | 'ASSET') => setFormData({
                        ...formData,
                        source_type: value,
                        rekening_id: value === 'REKENING' ? formData.rekening_id : '',
                        asset_id: value === 'ASSET' ? formData.asset_id : '',
                        asset_qty: value === 'ASSET' ? formData.asset_qty : '',
                      })}
                    >
                      <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                        <SelectValue placeholder="Pilih sumber" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="REKENING">Rekening</SelectItem>
                        <SelectItem value="ASSET">Asset</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.source_type === 'REKENING' && (
                  <div className="grid gap-2">
                    <Label htmlFor="rekening_id" className="text-sm font-semibold text-slate-700">No Rekening</Label>
                    <Select
                      value={formData.rekening_id}
                      onValueChange={value => setFormData({ ...formData, rekening_id: value })}
                      required={false}
                      disabled={!formData.perusahaan_id}
                    >
                      <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-100 disabled:text-slate-400">
                        <SelectValue placeholder={formData.perusahaan_id ? 'Pilih rekening (opsional)' : 'Pilih perusahaan dulu'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">(Kosongkan jika tidak ada)</SelectItem>
                        {filteredAddRekeningList.map((r) => (
                          <SelectItem key={r._id} value={r._id}>
                            {r.kode_bank} - {r.no_rekening}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  {formData.source_type === 'ASSET' && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="asset_id" className="text-sm font-semibold text-slate-700">Asset</Label>
                        <Select
                          value={formData.asset_id}
                          onValueChange={value => setFormData({ ...formData, asset_id: value })}
                        >
                          <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                            <SelectValue placeholder="Pilih asset" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredAddAssetList.map((asset: AssetItem) => (
                              <SelectItem key={asset._id} value={asset._id}>
                                {asset.asset_code} - {asset.asset_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="asset_qty" className="text-sm font-semibold text-slate-700">Qty Asset</Label>
                        <Input
                          id="asset_qty"
                          type="number"
                          min="0"
                          step="any"
                          value={formData.asset_qty}
                          onChange={e => setFormData({ ...formData, asset_qty: e.target.value })}
                          placeholder={selectedAddAsset?.unit ? `Masukkan qty (${selectedAddAsset.unit})` : 'Masukkan qty'}
                          className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </>
                  )}
                  {selectedAddRekening && (() => {
                    const saldoValid = Number(selectedAddRekening.saldo || 0);
                    const saldoOnHold = Number(selectedAddRekening.saldo_on_hold || 0);
                    const saldoPreview = saldoValid + saldoOnHold;
                    return (
                      <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              Saldo Rekening Estimasi
                            </p>
                            <p className="mt-1 text-2xl font-bold text-emerald-800">
                              {formatCurrency(saldoPreview)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-emerald-700">
                              <span>Saldo valid: {formatCurrency(saldoValid)}</span>
                              <span>On hold: {saldoOnHold >= 0 ? '+' : '-'}{formatCurrency(Math.abs(saldoOnHold))}</span>
                            </div>
                          </div>
                          <div className="text-right text-xs text-emerald-700">
                            <p>{selectedAddRekening.kode_bank || '-'}</p>
                            <p>{selectedAddRekening.no_rekening || '-'}</p>
                            <p>{selectedAddRekening.nama_rekening || '-'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {formData.source_type === 'ASSET' && selectedAddAsset && (
                    <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Qty Asset Saat Ini</p>
                          <p className="mt-1 text-2xl font-bold text-amber-800">
                            {Number(selectedAddAsset.qty || 0).toLocaleString('id-ID')} {selectedAddAsset.unit || ''}
                          </p>
                        </div>
                        <div className="text-right text-xs text-amber-700">
                          <p>{selectedAddAsset.asset_code || '-'}</p>
                          <p>{selectedAddAsset.asset_name || '-'}</p>
                          <p>{formatCurrency(Number(selectedAddAsset.current_price || 0))}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Tanggal */}
                  <div className="grid gap-2">
                    <Label htmlFor="tanggal" className="text-sm font-semibold text-slate-700">Tanggal</Label>
                    <Input
                      id="tanggal"
                      type="date"
                      value={formData.tanggal || ''}
                      onChange={e => {
                        const tanggal = e.target.value;
                        // Hitung bulan fiskal otomatis
                        const bulan_fiskal_otomatis = getFiscalMonthFromDate(tanggal);
                        setFormData({ ...formData, tanggal, bulan_fiskal: bulan_fiskal_otomatis });
                      }}
                      className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                  {/* Bulan Fiskal */}
                  <div className="grid gap-2">
                    <Label htmlFor="bulan_fiskal" className="text-sm font-semibold text-slate-700">Bulan Fiskal</Label>
                    <Input
                      id="bulan_fiskal"
                      type="text"
                      value={formData.bulan_fiskal || ''}
                      readOnly
                      disabled
                      className="h-12 rounded-md border border-blue-300 bg-blue-50 px-4 text-[15px] font-semibold text-blue-900 transition-colors duration-200 cursor-not-allowed placeholder:italic placeholder:text-blue-400"
                      placeholder="Bulan fiskal akan muncul di sini setelah tanggal dipilih"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="kategori" className="text-sm font-semibold text-slate-700">Kategori</Label>
                    <Select
                      value={formData.kategori_id}
                      onValueChange={(value) => {
                        setFormData({
                          ...formData,
                          kategori_id: value,
                          subkategori_id: '',
                          akun_id: '',
                        });
                      }}
                    >
                      <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary">
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat._id} value={cat._id}>
                            {cat.kategori}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Sub Kategori */}
                  <div className="grid gap-2">
                    <Label htmlFor="subkategori" className="text-sm font-semibold text-slate-700">Sub Kategori</Label>
                    <Select
                      value={formData.subkategori_id}
                      onValueChange={(value) => {
                        setFormData({ ...formData, subkategori_id: value, akun_id: '' });
                      }}
                      disabled={!formData.kategori_id}
                    >
                      <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-100 disabled:text-slate-400">
                        <SelectValue placeholder="Pilih sub kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredSubCategories.map((sub_kategori) => (
                          <SelectItem key={sub_kategori._id} value={sub_kategori._id}>
                            {sub_kategori.sub_kategori}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Akun */}
                  <div className="grid gap-2">
                    <Label htmlFor="akun" className="text-sm font-semibold text-slate-700">Akun</Label>
                    <Select
                      value={formData.akun_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, akun_id: value })
                      }
                      disabled={!formData.subkategori_id}
                    >
                      <SelectTrigger className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary disabled:opacity-100 disabled:text-slate-400">
                        <SelectValue placeholder="Pilih akun" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredAccounts.map((acc) => (
                          <SelectItem key={acc._id} value={acc._id}>
                            {acc.akun}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Nilai Transaksi (Rp) */}
                  <div className="grid gap-2">
                    <Label htmlFor="nilai" className="text-sm font-semibold text-slate-700">Nilai Transaksi (Rp)</Label>
                    <Input
                      id="nilai"
                      type="text"
                      value={formattedNilai}
                      onChange={(e) => {
                        const formatted = formatNumberInput(e.target.value);
                        const numericValue = parseFormattedInput(formatted);
                        setFormattedNilai(formatted);
                        setFormData({ ...formData, nilai: numericValue });
                      }}
                      placeholder="0"
                      className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                  <p className="-mt-2 text-[11px] text-slate-500 md:col-span-2">Gunakan tanda minus untuk retur/koreksi.</p>
                </div>
                {/* Keterangan */}
                <div className="grid gap-2 mt-2">
                  <Label className="text-sm font-semibold text-slate-700">Jenis Transaksi</Label>
                  <Select
                    value={formData.transaction_mode || (formData.is_special_transaction ? 'SPECIAL' : 'NORMAL')}
                    onValueChange={(value: 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY') =>
                      setFormData({
                        ...formData,
                        transaction_mode: value,
                        is_special_transaction: value === 'SPECIAL',
                      })
                    }
                  >
                    <SelectTrigger className="h-12 rounded-md border border-amber-300 bg-amber-50 px-4 text-[15px] font-medium text-slate-800 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-200">
                      <SelectValue placeholder="Pilih jenis transaksi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NORMAL">Normal (Dashboard + Rekening)</SelectItem>
                      <SelectItem value="SPECIAL">Khusus (Rekening Only)</SelectItem>
                      <SelectItem value="FINANCE_ONLY">Khusus (Dashboard Only)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-600">
                    Normal: memengaruhi dashboard dan rekening. Rekening Only: hanya rekening. Dashboard Only: hanya dashboard/agregasi.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="split_dana" className="text-sm font-semibold text-slate-700">Split Dana</Label>
                      <p className="mt-1 text-xs text-slate-500">Gunakan rekening di input utama sebagai sumber dana.</p>
                    </div>
                    <Switch
                      id="split_dana"
                      checked={splitDanaEnabled}
                      onCheckedChange={(checked) => {
                        setSplitDanaEnabled(checked);
                        if (checked && splitDanaRows.length === 0) addSplitDanaRow();
                        if (!checked) setSplitDanaRows([]);
                      }}
                    />
                  </div>

                  {splitDanaEnabled && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                        Sumber: {selectedAddRekening ? `${selectedAddRekening.kode_bank} - ${selectedAddRekening.no_rekening} - ${selectedAddRekening.nama_rekening}` : 'Pilih rekening sumber dulu'}
                      </div>

                      {splitDanaRows.map((row, index) => {
                        const rekeningOptions = getRekeningListForPerusahaan(row.perusahaan_id);
                        const keluarKategori = categories.find((cat) => cat._id === row.keluar_kategori_id)?.kategori;
                        const keluarSubCategories = row.keluar_kategori_id
                          ? subCategories.filter((sub) => sub.kategori === keluarKategori)
                          : [];
                        const keluarSubKategori = subCategories.find((sub) => sub._id === row.keluar_subkategori_id);
                        const keluarAccounts = row.keluar_subkategori_id && keluarKategori
                          ? accounts.filter((acc) => acc.sub_kategori === keluarSubKategori?.sub_kategori && acc.kategori === keluarKategori)
                          : [];
                        const masukKategori = categories.find((cat) => cat._id === row.masuk_kategori_id)?.kategori;
                        const masukSubCategories = row.masuk_kategori_id
                          ? subCategories.filter((sub) => sub.kategori === masukKategori)
                          : [];
                        const masukSubKategori = subCategories.find((sub) => sub._id === row.masuk_subkategori_id);
                        const masukAccounts = row.masuk_subkategori_id && masukKategori
                          ? accounts.filter((acc) => acc.sub_kategori === masukSubKategori?.sub_kategori && acc.kategori === masukKategori)
                          : [];
                        return (
                          <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-sm font-bold text-slate-700">Split #{index + 1}</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeSplitDanaRow(row.id)}
                                className="h-8 border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700"
                              >
                                Hapus
                              </Button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="grid gap-2">
                                <Label className="text-xs font-semibold text-slate-600">Perusahaan Tujuan</Label>
                                <Select
                                  value={row.perusahaan_id}
                                  onValueChange={(value) => updateSplitDanaRow(row.id, { perusahaan_id: value, rekening_id: '' })}
                                >
                                  <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white">
                                    <SelectValue placeholder="Pilih perusahaan" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {perusahaanList.map((p) => (
                                      <SelectItem key={p._id} value={p._id}>
                                        {p.nama_perusahaan}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-xs font-semibold text-slate-600">Rekening Tujuan</Label>
                                <Select
                                  value={row.rekening_id}
                                  onValueChange={(value) => updateSplitDanaRow(row.id, { rekening_id: value })}
                                  disabled={!row.perusahaan_id}
                                >
                                  <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white disabled:opacity-100">
                                    <SelectValue placeholder={row.perusahaan_id ? 'Pilih rekening' : 'Pilih perusahaan dulu'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {rekeningOptions.map((r: any) => (
                                      <SelectItem key={r._id} value={r._id}>
                                        {r.kode_bank} - {r.no_rekening}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 md:col-span-2">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-800">Keluar dari Sumber</p>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="grid gap-2">
                                    <Label className="text-xs font-semibold text-slate-600">Kategori Keluar</Label>
                                    <Select
                                      value={row.keluar_kategori_id}
                                      onValueChange={(value) => updateSplitDanaRow(row.id, {
                                        keluar_kategori_id: value,
                                        keluar_subkategori_id: '',
                                        keluar_akun_id: '',
                                      })}
                                    >
                                      <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white">
                                        <SelectValue placeholder="Kategori" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categories.map((cat) => (
                                          <SelectItem key={cat._id} value={cat._id}>{cat.kategori}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="grid gap-2">
                                    <Label className="text-xs font-semibold text-slate-600">Sub Kategori Keluar</Label>
                                    <Select
                                      value={row.keluar_subkategori_id}
                                      onValueChange={(value) => updateSplitDanaRow(row.id, {
                                        keluar_subkategori_id: value,
                                        keluar_akun_id: '',
                                      })}
                                      disabled={!row.keluar_kategori_id}
                                    >
                                      <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white disabled:opacity-100">
                                        <SelectValue placeholder="Sub kategori" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {keluarSubCategories.map((sub) => (
                                          <SelectItem key={sub._id} value={sub._id}>{sub.sub_kategori}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="grid gap-2">
                                    <Label className="text-xs font-semibold text-slate-600">Akun Keluar</Label>
                                    <Select
                                      value={row.keluar_akun_id}
                                      onValueChange={(value) => updateSplitDanaRow(row.id, { keluar_akun_id: value })}
                                      disabled={!row.keluar_subkategori_id}
                                    >
                                      <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white disabled:opacity-100">
                                        <SelectValue placeholder="Akun" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {keluarAccounts.map((acc) => (
                                          <SelectItem key={acc._id} value={acc._id}>{acc.akun}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 md:col-span-2">
                                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-emerald-800">Masuk ke Tujuan</p>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="grid gap-2">
                                    <Label className="text-xs font-semibold text-slate-600">Kategori Masuk</Label>
                                    <Select
                                      value={row.masuk_kategori_id}
                                      onValueChange={(value) => updateSplitDanaRow(row.id, {
                                        masuk_kategori_id: value,
                                        masuk_subkategori_id: '',
                                        masuk_akun_id: '',
                                      })}
                                    >
                                      <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white">
                                        <SelectValue placeholder="Kategori" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categories.map((cat) => (
                                          <SelectItem key={cat._id} value={cat._id}>{cat.kategori}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="grid gap-2">
                                    <Label className="text-xs font-semibold text-slate-600">Sub Kategori Masuk</Label>
                                    <Select
                                      value={row.masuk_subkategori_id}
                                      onValueChange={(value) => updateSplitDanaRow(row.id, {
                                        masuk_subkategori_id: value,
                                        masuk_akun_id: '',
                                      })}
                                      disabled={!row.masuk_kategori_id}
                                    >
                                      <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white disabled:opacity-100">
                                        <SelectValue placeholder="Sub kategori" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {masukSubCategories.map((sub) => (
                                          <SelectItem key={sub._id} value={sub._id}>{sub.sub_kategori}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="grid gap-2">
                                    <Label className="text-xs font-semibold text-slate-600">Akun Masuk</Label>
                                    <Select
                                      value={row.masuk_akun_id}
                                      onValueChange={(value) => updateSplitDanaRow(row.id, { masuk_akun_id: value })}
                                      disabled={!row.masuk_subkategori_id}
                                    >
                                      <SelectTrigger className="h-11 rounded-md border border-slate-200 bg-white disabled:opacity-100">
                                        <SelectValue placeholder="Akun" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {masukAccounts.map((acc) => (
                                          <SelectItem key={acc._id} value={acc._id}>{acc.akun}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-xs font-semibold text-slate-600">Nominal</Label>
                                <Input
                                  type="text"
                                  value={row.nominalDisplay}
                                  onChange={(e) => {
                                    const formatted = formatNumberInput(e.target.value);
                                    updateSplitDanaRow(row.id, {
                                      nominalDisplay: formatted,
                                      nominal: parseFormattedInput(formatted),
                                    });
                                  }}
                                  placeholder="0"
                                  className="h-11 rounded-md border border-slate-200 bg-white"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-xs font-semibold text-slate-600">Keterangan</Label>
                                <Input
                                  value={row.keterangan}
                                  onChange={(e) => updateSplitDanaRow(row.id, { keterangan: e.target.value.toUpperCase() })}
                                  placeholder="(Opsional)"
                                  className="h-11 rounded-md border border-slate-200 bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid gap-1 text-sm font-medium text-slate-600">
                          <span>Total split: <strong className="text-slate-900">{formatCurrency(totalSplitDana)}</strong></span>
                          <span className={sisaSplitDana < 0 ? 'text-red-600' : 'text-slate-600'}>
                            Sisa sumber: <strong>{formatCurrency(sisaSplitDana)}</strong>
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addSplitDanaRow}
                          className="h-10 border-blue-500 px-4 text-sm font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Tambah Split
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <Label htmlFor="status_final" className="text-sm font-semibold text-slate-700">Status Final</Label>
                    <p className="mt-1 text-xs text-slate-500">Matikan jika transaksi masih draft/belum final.</p>
                  </div>
                  <Switch
                    id="status_final"
                    checked={formData.status_final !== false}
                    onCheckedChange={(checked) => setFormData({ ...formData, status_final: checked })}
                  />
                </div>
                <div className="grid gap-2 mt-2">
                  <Label htmlFor="keterangan" className="text-sm font-semibold text-slate-700">Keterangan</Label>
                  <Input
                    id="keterangan"
                    type="text"
                    value={formData.keterangan || ''}
                    onChange={e => {
                      setFormData({ ...formData, keterangan: e.target.value.toUpperCase() });
                    }}
                    placeholder="(Opsional)"
                    className="h-12 rounded-md border border-slate-200 bg-white px-4 text-[15px] text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="grid gap-2 mt-2">
                  <Label htmlFor="create-attachments" className="text-sm font-semibold text-gray-700">
                    Attachment (Opsional)
                  </Label>
                  <Input
                    id="create-attachments"
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls"
                    onChange={handleCreateAttachmentChange}
                    className="border-2 border-gray-200 transition-all duration-200"
                  />
                  {createAttachments.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2 space-y-1">
                      {createAttachments.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-gray-700">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCreateAttachment(idx)}
                            className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            Hapus
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
                    disabled={fiscalMonthInvalid || createMutation.isPending || creatingWithAttachments}
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    {creatingWithAttachments ? 'Menyimpan...' : 'Simpan Transaksi'}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>

        {/* Daftar Transaksi */}
        <div className="bg-white/50 rounded-lg overflow-hidden border-2 border-dashed border-blue-200">
          {typeData === 'Detail' && (
            <div className="flex items-center justify-end gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExpandAllRows}
                disabled={expandableRowIds.length === 0 || areAllRowsExpanded}
              >
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCollapseAllRows}
                disabled={expandableRowIds.length === 0 || !Object.keys(expandedRows).length}
              >
                Collapse All
              </Button>
            </div>
          )}
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-50 hover:to-indigo-50 border-b border-blue-200/50">
                {typeData === 'Detail' && (
                  <TableHead className="w-10 px-2 py-4"></TableHead>
                )}
                {typeData === 'Detail' ? (
                  <>
                    <TableHead className="w-28 px-6 py-4 font-semibold text-slate-900">Tanggal</TableHead>
                    <TableHead className="w-24 px-6 py-4 font-semibold text-slate-900">Bulan Fiskal</TableHead>
                    <TableHead className="w-36 px-6 py-4 font-semibold text-slate-900">Input Date</TableHead>
                    <TableHead className="w-36 px-6 py-4 font-semibold text-slate-900">Validated Date</TableHead>
                  </>
                ) : (
                  <TableHead className="w-24 px-6 py-4 font-semibold text-slate-900">Bulan Fiskal</TableHead>
                )}
                <TableHead
                  className="group w-32 cursor-pointer select-none px-6 py-4 font-semibold text-slate-900"
                  onClick={handleSortKategori}
                  title="Urutkan Kategori"
                >
                  <div className="flex items-center gap-2">
                    Kategori
                    <span className="inline-block align-middle ml-2">
                      {kategoriSort === 'asc' && (
                        <svg className="inline h-4 w-4 text-slate-700" fill="none" viewBox="0 0 20 20"><path d="M10 6l-4 4h8l-4-4z" fill="currentColor" /></svg>
                      )}
                      {kategoriSort === 'desc' && (
                        <svg className="inline h-4 w-4 text-slate-700" fill="none" viewBox="0 0 20 20"><path d="M10 14l4-4H6l4 4z" fill="currentColor" /></svg>
                      )}
                      {!kategoriSort && (
                        <svg className="inline h-4 w-4 text-slate-400" fill="none" viewBox="0 0 20 20"><path d="M10 6l-4 4h8l-4-4z" fill="currentColor" /></svg>
                      )}
                    </span>
                  </div>
                </TableHead>
                <TableHead className="w-32 px-6 py-4 font-semibold text-slate-900">Sub Kategori</TableHead>
                <TableHead className="w-32 px-6 py-4 font-semibold text-slate-900">Akun</TableHead>
                <TableHead className="w-40 px-6 py-4 text-right font-semibold text-slate-900">Nilai</TableHead>
                {typeData === 'Detail' && (
                  <TableHead className="w-32 px-6 py-4 font-semibold text-slate-900">Validator Notes</TableHead>
                )}
                {/* <TableHead className="w-24 px-6 py-4 font-semibold text-gray-900">Input By</TableHead> */}
                {typeData === 'Detail' && (
                  <TableHead className="w-32 px-6 py-4 text-right font-semibold text-slate-900">Aksi</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={typeData === 'Detail' ? 12 : 7} className="h-[360px] text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                      <p className="text-sm font-semibold text-slate-600">Memuat data transaksi...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : transaksiList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={typeData === 'Detail' ? 12 : 7} className="h-[360px] text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-blue-600">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="mt-5 text-base font-bold text-slate-900">Belum ada data transaksi</p>
                      <p className="mt-2 text-sm font-medium text-slate-500">Mulai dengan menambahkan transaksi baru.</p>
                      <Button onClick={() => setAddModalOpen(true)} variant="outline" className="mt-7 h-11 min-w-[220px] rounded-md border-blue-500 text-sm font-bold text-blue-600 hover:bg-slate-50 hover:text-blue-700">
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah Data
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row: any, idx: number) => (
                  <React.Fragment key={row._id || row.parentId || idx}>
                    <TableRow
                      key={(row.parentId || row._id) + '-' + idx}
                      className={
                        `border-b border-slate-100 transition-colors hover:bg-slate-50` +
                        (typeData === 'Detail' && expandedRows[row._id || String(idx)] ? ' pb-6 align-top' : '') +
                        (row.is_validated ? ' bg-green-50 !border-green-300 hover:bg-green-200 hover:!border-green-400' : '') +
                        (typeData === 'Detail' && row.status_final === false ? ' bg-amber-50 !border-amber-300 hover:bg-amber-100 hover:!border-amber-400' : '')
                      }
                    >
                      {typeData === 'Detail' && (
                        <TableCell className="w-10 px-2 py-4">
                          <Button variant="ghost" size="sm" onClick={() => toggleExpandedRow(row._id || String(idx))} aria-label="Expand">
                            {expandedRows[row._id || String(idx)] ? '▾' : '▸'}
                          </Button>
                        </TableCell>
                      )}
                      {typeData === 'Detail' ? (
                        <>
                          <TableCell className="w-28 px-6 py-4 font-semibold text-gray-900">{row.tanggal}</TableCell>
                          <TableCell className="w-24 px-6 py-4 font-semibold text-gray-900">{row.bulan}</TableCell>
                          <TableCell className="w-36 px-6 py-4 text-xs font-medium text-gray-700">{formatDateTimeShort(row.created_at)}</TableCell>
                          <TableCell className="w-36 px-6 py-4 text-xs font-medium text-gray-700">{formatDateTimeShort(row.validated_at)}</TableCell>
                        </>
                      ) : (
                        <TableCell className="w-24 px-6 py-4 font-semibold text-gray-900">{row.bulan}</TableCell>
                      )}
                      <TableCell className="w-32 px-6 py-4 font-medium text-gray-900">
                        <div className="flex flex-col gap-1">
                          <span>{row.kategori}</span>
                          {typeData === 'Detail' && (
                            <div className="flex flex-wrap gap-1">
                              <span className={`inline-flex w-fit whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${getTransactionTypeBadgeClass(row)}`}>
                                {getTransactionTypeChipLabel(row)}
                              </span>
                              {row.status_final === false && (
                                <span className="inline-flex w-fit whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-amber-800">
                                  Belum Final
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-40 px-6 py-4 text-gray-700">{row.sub_kategori}</TableCell>
                      <TableCell className="w-40 px-6 py-4 text-gray-700">{row.akun}</TableCell>
                      <TableCell className="w-32 px-6 py-4 text-gray-700 text-right font-medium">
                        <span
                          className={`break-words whitespace-normal block ${Number(row?.nilai || 0) < 0 ? 'text-red-600 font-semibold' : ''
                            }`}
                        >
                          {formatCurrency(row.nilai)}
                        </span>
                      </TableCell>
                      {typeData === 'Detail' && (
                        <TableCell className="w-48 px-6 py-4 text-gray-700">
                          <span className="break-words whitespace-normal block">{row.validator_notes || '-'}</span>
                        </TableCell>
                      )}
                      {/* <TableCell className="w-24 px-6 py-4 text-gray-700">{row.input_by || row.created_by}</TableCell> */}
                      {typeData === 'Detail' && (
                        <TableCell className="w-32 px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {!row.is_validated ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleEdit(row)}
                                    className="cursor-pointer"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                  </DropdownMenuItem>
                                  {(user?.role === 'superuser' || user?.role === 'corsec' || user?.role === 'finance') && (
                                    <DropdownMenuItem
                                      onClick={() => handleUploadAttachments(row)}
                                      className="cursor-pointer text-green-600 focus:text-green-600"
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                      </svg>
                                      Upload
                                    </DropdownMenuItem>
                                  )}
                                  {(!row.is_validated && row.status_final !== false && (user?.role === 'superuser' || user?.role === 'corsec')) && (
                                    <DropdownMenuItem
                                      onClick={() => handleValidate(row)}
                                      className="cursor-pointer text-blue-600 focus:text-blue-600"
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Validasi
                                    </DropdownMenuItem>
                                  )}
                                </>
                              ) : null}
                              {(!row.is_validated && (user?.role === 'superuser' || user?.role === 'corsec' || user?.role === 'finance')) && (
                                <DropdownMenuItem
                                  onClick={() => handleToggleStatusFinal(row)}
                                  className="cursor-pointer text-amber-700 focus:text-amber-700"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {row.status_final === false ? 'Tandai Final' : 'Tandai Belum Final'}
                                </DropdownMenuItem>
                              )}
                              {(user?.role === 'superuser' || (!row.is_validated && user?.role === 'finance')) && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(row)}
                                  className="cursor-pointer text-red-600 focus:text-red-600"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Hapus
                                </DropdownMenuItem>
                              )}
                              {(user?.role === 'superuser' || user?.role === 'corsec') && (
                                <DropdownMenuItem
                                  onClick={() => handleOpenValidatorNotes(row)}
                                  className="cursor-pointer text-purple-600 focus:text-purple-600"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Validator Notes
                                </DropdownMenuItem>
                              )}
                              {/* Badge status validasi */}
                              {row.is_validated && (
                                <span className="inline-block ml-2 px-2 py-1 text-xs rounded bg-green-100 text-green-700 border border-green-200">Sudah divalidasi</span>
                              )}

                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>

                      )}
                    </TableRow>
                    {typeData === 'Detail' && expandedRows[row._id || String(idx)] && (
                      <TableRow className="bg-transparent">
                        <TableCell colSpan={typeData === 'Detail' ? 11 : 8} className="">
                          <div className="bg-white rounded-lg border border-slate-200 my-0 p-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
                            <div className="flex flex-col min-w-[120px]">
                              <span className="text-[11px] text-slate-500 leading-tight">Jenis</span>
                              <span className={`font-medium ${resolveTransactionMode(row) === 'SPECIAL'
                                ? 'text-amber-700'
                                : resolveTransactionMode(row) === 'FINANCE_ONLY'
                                  ? 'text-blue-700'
                                  : 'text-slate-700'
                                }`}>
                                {getTransactionTypeLabel(row)}
                              </span>
                            </div>
                            <div className="flex flex-col min-w-[120px]">
                              <span className="text-[11px] text-slate-500 leading-tight">Keterangan</span>
                              <span className="font-medium text-gray-900 truncate">{row.keterangan || '-'}</span>
                            </div>
                            <div className="flex flex-col min-w-[120px]">
                              <span className="text-[11px] text-slate-500 leading-tight">Perusahaan</span>
                              <span className="font-medium text-gray-900 truncate">{row.nama_perusahaan || '-'}</span>
                            </div>
                            <div className="flex flex-col min-w-[90px]">
                              <span className="text-[11px] text-slate-500 leading-tight">Kode Bank</span>
                              <span className="font-medium text-gray-900 truncate">{row.kode_bank || '-'}</span>
                            </div>
                            <div className="flex flex-col min-w-[110px]">
                              <span className="text-[11px] text-slate-500 leading-tight">No Rekening</span>
                              <span className="font-medium text-gray-900 truncate">{row.no_rekening || '-'}</span>
                            </div>
                            <div className="flex flex-col min-w-[90px]">
                              <span className="text-[11px] text-slate-500 leading-tight">Input By</span>
                              <span className="font-medium text-gray-900 truncate">{row.input_by || row.created_by || '-'}</span>
                            </div>
                            {row.attachments && row.attachments.length > 0 && (user?.role === 'superuser' || user?.role === 'corsec') && (
                              <div className="flex flex-col min-w-[200px]">
                                <span className="text-[11px] text-slate-500 leading-tight">Attachments</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {row.attachments.map((att, idx) => {
                                    const fileName = att.path.split('/').pop() || '';
                                    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
                                    return (
                                      <div key={idx} className="flex items-center gap-1 bg-blue-50 rounded px-2 py-1">
                                        <span className="text-blue-600 text-xs truncate max-w-[80px]" title={fileName}>
                                          {fileName}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => window.open(resolveAttachmentUrl(att.path), '_blank')}
                                          className="h-4 w-4 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-100"
                                          title="Preview attachment"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteAttachment(row._id, fileName, att.path)}
                                          className="h-4 w-4 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                          title="Delete attachment"
                                        >
                                          ×
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>

          <div className="grid gap-4 border-t border-gray-100/50 px-6 py-5 text-sm font-medium text-gray-600 md:grid-cols-3 md:items-center">
            <div>Total Data: {totalDataAllPages}</div>
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

        {/* Edit Modal */}
        {editModalOpen && editData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                      Edit Transaksi
                    </h3>
                    <p className="text-gray-600 mt-1">Ubah data transaksi</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  >
                    ✕
                  </Button>
                </div>
                <form onSubmit={e => { e.preventDefault(); handleEditSave(); }} className="space-y-6">
                  {fiscalMonthInvalid && fiscalMonthAlert && (
                    <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg px-4 py-2 mb-2 text-sm font-semibold">
                      {fiscalMonthAlert}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Perusahaan Dropdown (Edit) */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-perusahaan_id" className="text-sm font-semibold text-gray-700">Perusahaan</Label>
                      <Select
                        value={editData?.perusahaan_id || ''}
                        onValueChange={value => setEditData({ ...editData, perusahaan_id: value, rekening_id: 'none', asset_id: '' })}
                        required
                      >
                        <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                          <SelectValue placeholder="Pilih perusahaan" />
                        </SelectTrigger>
                        <SelectContent>
                          {perusahaanList.map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.nama_perusahaan}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-source_type" className="text-sm font-semibold text-gray-700">Sumber Transaksi</Label>
                      <Select
                        value={editData?.source_type || 'REKENING'}
                        onValueChange={(value: 'REKENING' | 'ASSET') => setEditData({
                          ...editData,
                          source_type: value,
                          rekening_id: value === 'REKENING' ? editData.rekening_id : 'none',
                          asset_id: value === 'ASSET' ? editData.asset_id : '',
                          asset_qty: value === 'ASSET' ? editData.asset_qty : '',
                        })}
                      >
                        <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                          <SelectValue placeholder="Pilih sumber" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REKENING">Rekening</SelectItem>
                          <SelectItem value="ASSET">Asset</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(editData?.source_type || 'REKENING') === 'REKENING' && (
                    <div className="grid gap-2">
                      <Label htmlFor="edit-rekening_id" className="text-sm font-semibold text-gray-700">No Rekening</Label>
                      <Select
                        value={editData?.rekening_id || 'none'}
                        onValueChange={value => setEditData({ ...editData, rekening_id: value })}
                        required={false}
                        disabled={!editData?.perusahaan_id}
                      >
                        <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                          <SelectValue placeholder={editData?.perusahaan_id ? 'Pilih rekening (opsional)' : 'Pilih perusahaan dulu'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">(Kosongkan jika tidak ada)</SelectItem>
                          {filteredEditRekeningList.map((r) => (
                            <SelectItem key={r._id} value={r._id}>
                              {r.kode_bank} - {r.no_rekening}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    )}
                    {(editData?.source_type || 'REKENING') === 'ASSET' && (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="edit-asset_id" className="text-sm font-semibold text-gray-700">Asset</Label>
                          <Select
                            value={editData?.asset_id || ''}
                            onValueChange={value => setEditData({ ...editData, asset_id: value })}
                          >
                            <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                              <SelectValue placeholder="Pilih asset" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredEditAssetList.map((asset: AssetItem) => (
                                <SelectItem key={asset._id} value={asset._id}>
                                  {asset.asset_code} - {asset.asset_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="edit-asset_qty" className="text-sm font-semibold text-gray-700">Qty Asset</Label>
                          <Input
                            id="edit-asset_qty"
                            type="number"
                            min="0"
                            step="any"
                            value={editData?.asset_qty || ''}
                            onChange={e => setEditData({ ...editData, asset_qty: e.target.value })}
                            placeholder={selectedEditAsset?.unit ? `Masukkan qty (${selectedEditAsset.unit})` : 'Masukkan qty'}
                            className="border-2 border-gray-200 transition-all duration-200"
                          />
                        </div>
                      </>
                    )}
                    {/* Tanggal */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-tanggal" className="text-sm font-semibold text-gray-700">Tanggal</Label>
                      <Input
                        id="edit-tanggal"
                        type="date"
                        value={editData.tanggal || ''}
                        onChange={e => {
                          const newTanggal = e.target.value;
                          setEditData(prev => ({
                            ...prev,
                            tanggal: newTanggal,
                            bulan: getFiscalMonthFromDate(newTanggal)
                          }));
                        }}
                        className="border-2 border-gray-200 transition-all duration-200"
                        required
                      />
                    </div>
                    {/* Bulan Fiskal */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-bulan" className="text-sm font-semibold text-gray-700">Bulan Fiskal</Label>
                      <Input
                        id="edit-bulan"
                        type="text"
                        value={editData.tanggal ? getFiscalMonthFromDate(editData.tanggal) : ''}
                        readOnly
                        disabled
                        className="border-2 border-blue-400 bg-blue-50 font-bold text-blue-900 transition-all duration-200 cursor-not-allowed placeholder:italic placeholder:text-blue-400"
                        placeholder="Bulan fiskal akan muncul di sini setelah tanggal dipilih"
                      />
                    </div>
                    {/* Kategori */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-kategori" className="text-sm font-semibold text-gray-700">Kategori</Label>
                      <Select
                        value={editData.kategori}
                        onValueChange={(value) => setEditData({ ...editData, kategori: value, sub_kategori: '', akun: '' })}
                      >
                        <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                          <SelectValue placeholder="Pilih kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat._id} value={cat.kategori}>
                              {cat.kategori}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Sub Kategori */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-subkategori" className="text-sm font-semibold text-gray-700">Sub Kategori</Label>
                      <Select
                        value={editData.sub_kategori}
                        onValueChange={(value) => setEditData({ ...editData, sub_kategori: value, akun: '' })}
                        disabled={!editData.kategori}
                      >
                        <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                          <SelectValue placeholder="Pilih sub kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {editFilteredSubCategories.map((sub) => (
                            <SelectItem key={sub._id} value={sub.sub_kategori}>
                              {sub.sub_kategori}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Akun */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-akun" className="text-sm font-semibold text-gray-700">Akun</Label>
                      <Select
                        value={editData.akun}
                        onValueChange={(value) => setEditData({ ...editData, akun: value })}
                        disabled={!editData.sub_kategori}
                      >
                        <SelectTrigger className="border-2 border-gray-200 transition-all duration-200">
                          <SelectValue placeholder="Pilih akun" />
                        </SelectTrigger>
                        <SelectContent>
                          {editFilteredAccounts.map((acc) => (
                            <SelectItem key={acc._id} value={acc.akun}>
                              {acc.akun}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Nilai Transaksi (Rp) */}
                    <div className="grid gap-2">
                      <Label htmlFor="edit-nilai" className="text-sm font-semibold text-gray-700">Nilai Transaksi (Rp)</Label>
                      <Input
                        id="edit-nilai"
                        type="text"
                        value={editFormattedNilai}
                        onChange={(e) => {
                          const formatted = formatNumberInput(e.target.value);
                          const numericValue = parseFormattedInput(formatted);
                          setEditFormattedNilai(formatted);
                          setEditData({ ...editData, nilai: numericValue });
                        }}
                        placeholder="0"
                        className="border-2 border-gray-200 transition-all duration-200"
                      />
                      <p className="text-[11px] text-gray-500">Gunakan tanda minus untuk retur/koreksi.</p>
                    </div>
                    {/* Keterangan */}
                    <div className="grid gap-2 md:col-span-2">
                      <Label className="text-sm font-semibold text-gray-700">Jenis Transaksi</Label>
                      <Select
                        value={editData?.transaction_mode || (editData?.is_special_transaction ? 'SPECIAL' : 'NORMAL')}
                        onValueChange={(value: 'NORMAL' | 'SPECIAL' | 'FINANCE_ONLY') =>
                          setEditData({
                            ...editData,
                            transaction_mode: value,
                            is_special_transaction: value === 'SPECIAL',
                          })
                        }
                      >
                        <SelectTrigger className="border-2 border-amber-200 bg-amber-50">
                          <SelectValue placeholder="Pilih jenis transaksi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NORMAL">Normal (Dashboard + Rekening)</SelectItem>
                          <SelectItem value="SPECIAL">Khusus (Rekening Only)</SelectItem>
                          <SelectItem value="FINANCE_ONLY">Khusus (Dashboard Only)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-600">
                        Normal: memengaruhi dashboard dan rekening. Rekening Only: hanya rekening. Dashboard Only: hanya dashboard/agregasi.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                      <div>
                        <Label htmlFor="edit-status_final" className="text-sm font-semibold text-gray-700">Status Final</Label>
                        <p className="mt-1 text-xs text-gray-500">Matikan jika transaksi masih draft/belum final.</p>
                      </div>
                      <Switch
                        id="edit-status_final"
                        checked={editData.status_final !== false}
                        onCheckedChange={(checked) => setEditData({ ...editData, status_final: checked })}
                      />
                    </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="edit-keterangan" className="text-sm font-semibold text-gray-700">Keterangan</Label>
                      <Input
                        id="edit-keterangan"
                        type="text"
                        value={editData.keterangan || ''}
                        onChange={e => setEditData({ ...editData, keterangan: e.target.value.toUpperCase() })}
                        placeholder="(Opsional)"
                        className="border-2 border-gray-200 transition-all duration-200"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-6 border-t border-gray-100/50">
                    <Button
                      variant="outline"
                      onClick={() => setEditModalOpen(false)}
                      className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
                      disabled={fiscalMonthInvalid}
                    >
                      Simpan Perubahan
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* View Keterangan Modal - moved to end of component for valid JSX */}
        {viewKeteranganOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-900">Keterangan Transaksi</h3>
                </div>
                <div className="mb-6 text-gray-800 text-base whitespace-pre-line min-h-[40px]">
                  {viewKeteranganText}
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setViewKeteranganOpen(false)}
                    className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
                  >
                    Tutup
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteDialogOpen && deleteData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold bg-gradient-to-r from-red-900 to-red-600 bg-clip-text text-transparent">
                      Konfirmasi Hapus
                    </h3>
                    <p className="text-gray-600 mt-1">Apakah Anda yakin ingin menghapus transaksi ini?</p>
                  </div>
                </div>

                <div className="bg-red-50/50 rounded-lg p-4 mb-6 border border-red-200/50">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Bulan Fiskal:</span>
                      <span className="text-gray-900">{deleteData.bulan}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Kategori:</span>
                      <span className="text-gray-900">{deleteData.kategori}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Sub Kategori:</span>
                      <span className="text-gray-900">{deleteData.sub_kategori}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Akun:</span>
                      <span className="text-gray-900">{deleteData.akun}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Nilai:</span>
                      <span className="text-gray-900 font-semibold">{formatCurrency(deleteData.nilai)}</span>
                    </div>
                  </div>
                </div>

                {deleteData.is_validated && (
                  <div className="mb-6 space-y-2">
                    <div className="text-xs font-semibold text-amber-700">
                      Transaksi ini sudah divalidasi. Masukkan secret code untuk melanjutkan penghapusan.
                    </div>
                    <Input
                      type="password"
                      value={deleteSecretCode}
                      onChange={(e) => setDeleteSecretCode(e.target.value)}
                      placeholder="Masukkan secret code"
                      className="border-2 border-amber-300 focus-visible:ring-amber-500"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      setDeleteData(null);
                      setDeleteSecretCode('');
                    }}
                    disabled={deletingTransaksi}
                    className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={handleConfirmDelete}
                    disabled={deletingTransaksi || (deleteData.is_validated && !deleteSecretCode.trim())}
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
                  >
                    {deletingTransaksi ? 'Menghapus...' : 'Hapus Transaksi'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload Attachments Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Attachments</DialogTitle>
            <DialogDescription>
              Upload multiple documents (images, PDFs, Excel) for this transaction.
            </DialogDescription>
          </DialogHeader>
          <UploadAttachmentsForm
            transaksiId={uploadData?._id}
            onClose={() => setUploadModalOpen(false)}
            onSuccess={() => {
              setUploadModalOpen(false);
              // Refresh data
              refetch();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Attachment Confirmation Dialog */}
      {deleteAttachmentDialogOpen && deleteAttachmentData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold bg-gradient-to-r from-red-900 to-red-600 bg-clip-text text-transparent">
                    Konfirmasi Hapus Attachment
                  </h3>
                  <p className="text-gray-600 mt-1">Apakah Anda yakin ingin menghapus file ini?</p>
                </div>
              </div>

              <div className="bg-red-50/50 rounded-lg p-4 mb-6 border border-red-200/50">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Nama File:</span>
                    <span className="text-gray-900 font-mono text-xs">{deleteAttachmentData.filename}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">Path:</span>
                    <span className="text-gray-900 font-mono text-xs truncate max-w-[200px]">{deleteAttachmentData.fileUrl}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteAttachmentDialogOpen(false);
                    setDeleteAttachmentData(null);
                  }}
                  className="border-gray-300 hover:bg-gray-50 transition-all duration-200"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleConfirmDeleteAttachment}
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
                >
                  Hapus File
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog konfirmasi validasi */}
      <Dialog open={validateDialogOpen} onOpenChange={setValidateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Konfirmasi Validasi</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin memvalidasi transaksi ini? Berikut adalah file attachment yang akan divalidasi:
            </DialogDescription>
          </DialogHeader>
          {validateRow && validateRow.attachments && validateRow.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-4 mb-4">
              {validateRow.attachments.map((att: any, idx: number) => {
                const url = resolveAttachmentUrl(att.path);
                const fileName = att.path.split('/').pop();
                const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
                return (
                  <div key={idx} className="flex flex-col items-center w-32">
                    {isImage ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={fileName} className="w-24 h-24 object-cover rounded border mb-1" />
                      </a>
                    ) : (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full text-xs text-blue-700 border rounded p-2 bg-blue-50 hover:bg-blue-100 text-center mb-1">
                        {fileName}
                      </a>
                    )}
                    <span className="text-xs break-all text-gray-700 text-center">{fileName}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-gray-500 text-sm mb-4">Tidak ada attachment pada transaksi ini.</div>
          )}

          {/* Proyeksi Saldo */}
          {validationRekening && validateRow ? (
            (() => {
              const nilaiTransaksi = Number(validateRow.nilai || 0);
              const deltaSaldo = validateRow.kategori === 'PENDAPATAN' ? nilaiTransaksi : -nilaiTransaksi;
              const isPenambahan = deltaSaldo >= 0;
              const saldoValid = Number(validationRekening.saldo || 0);
              const saldoOnHold = Number(validationRekening.saldo_on_hold || 0);
              const saldoEstimasi = saldoValid + saldoOnHold;
              const saldoOnHoldAkhir = validateRow.saldo_on_hold_applied ? saldoOnHold - deltaSaldo : saldoOnHold;
              const saldoAkhir = saldoValid + deltaSaldo;
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h3 className="text-m font-semibold text-blue-900 mb-2">Proyeksi Saldo Rekening</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Nomor Rekening:</span>
                      <span className="font-medium">{validationRekening.no_rekening}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Nama Rekening:</span>
                      <span className="font-medium">{validationRekening.nama_rekening}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Saldo Valid:</span>
                      <span className="font-medium">{formatCurrency(saldoValid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Saldo On Hold:</span>
                      <span className={`font-medium ${saldoOnHold >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {saldoOnHold >= 0 ? '+' : '-'}{formatCurrency(Math.abs(saldoOnHold))}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Saldo Estimasi:</span>
                      <span className="font-medium">{formatCurrency(saldoEstimasi)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        {isPenambahan ? 'Penambahan' : 'Pengurangan'}:
                      </span>
                      <span className={`font-medium ${isPenambahan ? 'text-green-600' : 'text-red-600'}`}>
                        {isPenambahan ? '+' : '-'}{formatCurrency(Math.abs(deltaSaldo))}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-blue-300 pt-1">
                      <span className="font-semibold">Saldo Valid Setelah Validasi:</span>
                      <span className="font-semibold text-blue-900">
                        {formatCurrency(saldoAkhir)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">On Hold Setelah Validasi:</span>
                      <span className={`font-semibold ${saldoOnHoldAkhir >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {saldoOnHoldAkhir >= 0 ? '+' : '-'}{formatCurrency(Math.abs(saldoOnHoldAkhir))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : validateRow?.rekening_id ? (
            <div className="text-gray-500 text-sm mb-4">Memuat data rekening...</div>
          ) : null}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setValidateDialogOpen(false)} disabled={validating}>Batal</Button>
            <Button onClick={handleConfirmValidate} disabled={validating} className="bg-blue-600 text-white">
              {validating ? 'Memvalidasi...' : 'Validasi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog untuk input validator notes */}
      <Dialog open={validatorNotesDialogOpen} onOpenChange={setValidatorNotesDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Tambah/Edit Validator Notes</DialogTitle>
            <DialogDescription>
              Masukkan catatan validator untuk transaksi ini.
            </DialogDescription>
          </DialogHeader>
          <div className="mb-4">
            <Label htmlFor="validator-notes-input">Validator Notes</Label>
            <textarea
              id="validator-notes-input"
              value={validatorNotesInput}
              onChange={(e) => setValidatorNotesInput(e.target.value)}
              placeholder="Masukkan catatan validator..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setValidatorNotesDialogOpen(false);
                setValidatorNotesInput('');
              }}
              disabled={savingValidatorNotes}
            >
              Batal
            </Button>
            <Button
              onClick={handleSaveValidatorNotes}
              disabled={savingValidatorNotes}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              {savingValidatorNotes ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attachmentPreviewDialogOpen} onOpenChange={setAttachmentPreviewDialogOpen}>
        <DialogContent className="sm:max-w-5xl w-[96vw]">
          <DialogHeader>
            <DialogTitle>Preview Bukti</DialogTitle>
            <DialogDescription>{attachmentPreviewName || 'Attachment'}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-gray-50 min-h-[60vh] flex items-center justify-center overflow-hidden">
            {!attachmentPreviewUrl ? (
              <div className="text-sm text-gray-500">Tidak ada file untuk dipreview.</div>
            ) : /\.pdf($|\?)/i.test(attachmentPreviewUrl) || attachmentPreviewName.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={attachmentPreviewUrl}
                title={attachmentPreviewName || 'Preview PDF'}
                className="w-full h-[70vh] bg-white"
              />
            ) : (
              <img
                src={attachmentPreviewUrl}
                alt={attachmentPreviewName || 'Preview Image'}
                className="max-w-full max-h-[70vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
