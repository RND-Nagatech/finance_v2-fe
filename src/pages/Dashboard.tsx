import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import axiosInstance from '@/api/axiosInstance';
import { ChartBar } from '@/components/ChartBar';
import { ChartDonut } from '@/components/ChartDonut';
import LineChartKategori from '@/components/LineChartKategori';
import StackedBarKategori from '@/components/StackedBarKategori';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MONTH_OPTIONS = [
  { value: 'ALL_YEARS', label: 'Semua Tahun' },
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'DEC', label: 'December' },
  { value: 'JAN', label: 'January' },
  { value: 'FEB', label: 'February' },
  { value: 'MAR', label: 'March' },
  { value: 'APR', label: 'April' },
  { value: 'MAY', label: 'May' },
  { value: 'JUN', label: 'June' },
  { value: 'JUL', label: 'July' },
  { value: 'AUG', label: 'August' },
  { value: 'SEP', label: 'September' },
  { value: 'OCT', label: 'October' },
  { value: 'NOV', label: 'November' },
];

const GROUPING_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const FISCAL_MONTH_ORDER = ['DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV'];

const MONTH_NUMBER: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const MASK_CURRENCY = 'Rp ..........';
const dashboardCardClass = 'border border-slate-200 bg-white shadow-sm';

type RekapRow = {
  name: string;
  value: number;
  subs?: Array<{ sub_kategori?: string; subKategori?: string; name?: string; total?: number }>;
};

type StackedRow = {
  kategori: string;
  subs: Array<{ name: string; total: number }>;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const sumByName = (rows: Array<{ name: string; value: number }>, name: string) =>
  rows.find((row) => row.name === name)?.value || 0;

const normalizeRekeningResponse = (responseData: any) => {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.data)) return responseData.data;
  return [];
};

const getCalendarYearForFiscalMonth = (fiscalYear: string, monthCode: string) => {
  const numericYear = Number(fiscalYear || new Date().getFullYear());
  return monthCode === 'DEC' ? numericYear - 1 : numericYear;
};

const buildMonthDateSeries = (fiscalYear: string, monthCode: string) => {
  const monthNumber = MONTH_NUMBER[monthCode];
  if (!monthNumber) return [];
  const calendarYear = getCalendarYearForFiscalMonth(fiscalYear, monthCode);
  const days = new Date(calendarYear, monthNumber, 0).getDate();
  return Array.from({ length: days }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${calendarYear}-${String(monthNumber).padStart(2, '0')}-${day}`;
  });
};

const normalizeDailyLabel = (rawLabel: string, fiscalYear: string, monthCode: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawLabel)) return rawLabel;
  const dayMatch = String(rawLabel || '').match(/\d{1,2}/);
  const monthNumber = MONTH_NUMBER[monthCode];
  if (!dayMatch || !monthNumber) return rawLabel;
  const calendarYear = getCalendarYearForFiscalMonth(fiscalYear, monthCode);
  return `${calendarYear}-${String(monthNumber).padStart(2, '0')}-${dayMatch[0].padStart(2, '0')}`;
};

const getISOWeekLabel = (dateString: string) => {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((current.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `W${String(weekNumber).padStart(2, '0')}-${String(current.getUTCFullYear()).slice(-2)}`;
};

const normalizeRekapRows = (rekap: any[] = []): RekapRow[] => (
  rekap.map((item: any) => ({
    name: item.kategori,
    value: Number(item.total || item.total_tahunan || item.total_kategori || 0),
    subs: item.subs || [],
  }))
);

const mergeRekapRows = (rows: RekapRow[]) => {
  const map = new Map<string, RekapRow>();
  rows.forEach((row) => {
    const existing = map.get(row.name) || { name: row.name, value: 0, subs: [] };
    existing.value += Number(row.value || 0);
    const subMap = new Map<string, number>();
    (existing.subs || []).forEach((sub) => {
      const key = sub.sub_kategori || sub.subKategori || sub.name || '-';
      subMap.set(key, (subMap.get(key) || 0) + Number(sub.total || 0));
    });
    (row.subs || []).forEach((sub) => {
      const key = sub.sub_kategori || sub.subKategori || sub.name || '-';
      subMap.set(key, (subMap.get(key) || 0) + Number(sub.total || 0));
    });
    existing.subs = Array.from(subMap.entries()).map(([sub_kategori, total]) => ({ sub_kategori, total }));
    map.set(row.name, existing);
  });
  return Array.from(map.values());
};

export default function Dashboard() {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState(new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase());
  const [grouping, setGrouping] = useState<'daily' | 'weekly'>('daily');
  const [chartType, setChartType] = useState<'donut' | 'bar'>('donut');
  const [showRekeningDetail, setShowRekeningDetail] = useState(false);
  const [visibleAmountKeys, setVisibleAmountKeys] = useState<Record<string, boolean>>({});
  const userSelectedYearRef = useRef(false);

  const isAllYearsScope = month === 'ALL_YEARS';
  const isAnnualScope = month === 'ANNUAL';
  const shouldUseWeeklyGrouping = !isAnnualScope && !isAllYearsScope && grouping === 'weekly';

  const { data: fiscalYearsData = [], isLoading: isYearsLoading } = useQuery<number[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => {
      const res = await axiosInstance.get('/fiscal/years');
      return res.data.years || [];
    },
  });
  const uniqueFiscalYears = useMemo(
    () => Array.from(new Set(fiscalYearsData.map((item) => Number(item)).filter(Number.isFinite))).sort((a, b) => b - a),
    [fiscalYearsData]
  );

  useEffect(() => {
    if (!userSelectedYearRef.current && uniqueFiscalYears.length > 0) {
      const latest = Math.max(...uniqueFiscalYears);
      if (year !== latest.toString()) setYear(latest.toString());
    }
  }, [uniqueFiscalYears, year]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance-dashboard', year, month],
    queryFn: async () => {
      const baseUrl = `/dashboard/rekap-aggregate?tahun=${year}`;
      const url = isAnnualScope ? baseUrl : `${baseUrl}&bulan=${month}`;
      const response = await axiosInstance.get(url);
      return response.data;
    },
    enabled: !!year && !isAllYearsScope,
  });

  const { data: allYearsDashboardData = [], isLoading: isAllYearsLoading } = useQuery({
    queryKey: ['finance-dashboard-all-years', uniqueFiscalYears],
    queryFn: async () => {
      const years = [...uniqueFiscalYears].sort((a, b) => a - b);
      const responses = await Promise.all(
        years.map(async (fiscalYear) => {
          const response = await axiosInstance.get(`/dashboard/rekap-aggregate?tahun=${fiscalYear}`);
          return { fiscalYear, data: response.data };
        })
      );
      return responses;
    },
    enabled: isAllYearsScope && uniqueFiscalYears.length > 0,
  });

  const { data: pendapatanHarianData } = useQuery({
    queryKey: ['pendapatan-harian', year, month],
    queryFn: async () => {
      const response = await axiosInstance.get(`/dashboard/pendapatan-harian?tahun=${year}&bulan=${month}`);
      return response.data;
    },
    enabled: !!year && !isAnnualScope && !isAllYearsScope,
  });

  const { data: rekeningDashboardList = [], isLoading: isRekeningDashboardLoading } = useQuery({
    queryKey: ['rekening-dashboard-list'],
    queryFn: async () => {
      const response = await axiosInstance.get('/master/rekening?all=true');
      return normalizeRekeningResponse(response.data);
    },
  });

  const activeDashboardData = useMemo(() => {
    if (!isAllYearsScope) return data || {};
    const rekap = mergeRekapRows(allYearsDashboardData.flatMap((entry: any) => normalizeRekapRows(entry?.data?.rekap || [])));
    const pertahun = mergeRekapRows(allYearsDashboardData.flatMap((entry: any) => normalizeRekapRows(entry?.data?.pertahun || [])));
    return { rekap, pertahun };
  }, [allYearsDashboardData, data, isAllYearsScope]);

  const rekapData = useMemo(() => normalizeRekapRows(activeDashboardData?.rekap || []), [activeDashboardData]);
  const pertahunData = activeDashboardData?.pertahun || [];

  const penjualanTotal = sumByName(rekapData, 'PENDAPATAN');
  const pembelianTotal = sumByName(rekapData, 'PEMBELIAN');
  const biayaTotal = sumByName(rekapData, 'BIAYA');
  const totalAkumulasiSaldoRekening = rekeningDashboardList.reduce(
    (sum: number, rekening: any) => sum + Number(rekening.saldo || 0),
    0
  );

  const rawPendapatanHarian = useMemo(() => {
    const sourceRows = pendapatanHarianData?.data || pendapatanHarianData || [];
    if (!Array.isArray(sourceRows)) return [];
    const grouped = new Map<string, Map<string, number>>();
    sourceRows.forEach((item: any) => {
      const label = item.tanggal || item.hari || item.bulan || item.name || item.kategori;
      if (!label) return;
      const normalizedLabel = normalizeDailyLabel(String(label), year, month);
      const subName = item.sub_kategori || item.subKategori || item.kategori || 'Pendapatan';
      const total = Number(item.total || item.nilai || item.nominal || 0);
      const current = grouped.get(normalizedLabel) || new Map<string, number>();
      current.set(subName, (current.get(subName) || 0) + total);
      grouped.set(normalizedLabel, current);
    });
    return Array.from(grouped.entries()).map(([kategori, subs]) => ({
      kategori,
      subs: Array.from(subs.entries()).map(([name, total]) => ({ name, total })),
    }));
  }, [pendapatanHarianData, year, month]);

  const pendapatanHarianChartData: StackedRow[] = useMemo(() => {
    if (isAnnualScope || isAllYearsScope) return [];
    const dateSeries = buildMonthDateSeries(year, month);
    const subNames = Array.from(new Set(rawPendapatanHarian.flatMap((row) => row.subs.map((sub) => sub.name))));
    const rowMap = new Map<string, Map<string, number>>();
    rawPendapatanHarian.forEach((row) => {
      const current = rowMap.get(row.kategori) || new Map<string, number>();
      row.subs.forEach((sub) => current.set(sub.name, (current.get(sub.name) || 0) + Number(sub.total || 0)));
      rowMap.set(row.kategori, current);
    });
    const paddedRows = dateSeries.length > 0
      ? dateSeries.map((date) => ({
        kategori: date,
        subs: subNames.map((name) => ({ name, total: rowMap.get(date)?.get(name) || 0 })),
      }))
      : rawPendapatanHarian;
    if (!shouldUseWeeklyGrouping) return paddedRows;
    const weeklyMap = new Map<string, Map<string, number>>();
    paddedRows.forEach((row) => {
      const weekLabel = getISOWeekLabel(row.kategori);
      const current = weeklyMap.get(weekLabel) || new Map<string, number>();
      row.subs.forEach((sub) => current.set(sub.name, (current.get(sub.name) || 0) + Number(sub.total || 0)));
      weeklyMap.set(weekLabel, current);
    });
    return Array.from(weeklyMap.entries()).map(([kategori, subs]) => ({
      kategori,
      subs: Array.from(subs.entries()).map(([name, total]) => ({ name, total })),
    }));
  }, [isAllYearsScope, isAnnualScope, month, rawPendapatanHarian, shouldUseWeeklyGrouping, year]);

  const grossMarginTahunanLineData = useMemo(() => {
    if (isAllYearsScope) {
      return allYearsDashboardData.map((entry: any) => {
        const rows = normalizeRekapRows(entry?.data?.rekap || []);
        return {
          bulan: String(entry.fiscalYear),
          nominal: sumByName(rows, 'PENDAPATAN') - sumByName(rows, 'BIAYA') - sumByName(rows, 'PEMBELIAN'),
        };
      });
    }
    return FISCAL_MONTH_ORDER.map((monthCode) => {
      const totals: Record<string, number> = {};
      pertahunData.forEach((row: any) => {
        const bulanRow = (row.data_bulanan || []).find((item: any) => String(item.bulan || '').startsWith(monthCode));
        totals[row.kategori || row.name] = Number(bulanRow?.total || bulanRow?.nilai || 0);
      });
      return {
        bulan: monthCode,
        nominal: Number(totals.PENDAPATAN || 0) - Number(totals.BIAYA || 0) - Number(totals.PEMBELIAN || 0),
      };
    });
  }, [allYearsDashboardData, isAllYearsScope, pertahunData]);

  const pembelianLineData = useMemo(() => {
    if (isAllYearsScope) {
      return allYearsDashboardData.map((entry: any) => ({
        bulan: String(entry.fiscalYear),
        nominal: sumByName(normalizeRekapRows(entry?.data?.rekap || []), 'PEMBELIAN'),
      }));
    }
    const pembelian = pertahunData.find((row: any) => (row.kategori || row.name) === 'PEMBELIAN');
    return FISCAL_MONTH_ORDER.map((monthCode) => {
      const bulanRow = (pembelian?.data_bulanan || []).find((item: any) => String(item.bulan || '').startsWith(monthCode));
      return { bulan: monthCode, nominal: Number(bulanRow?.total || bulanRow?.nilai || 0) };
    });
  }, [allYearsDashboardData, isAllYearsScope, pertahunData]);

  const biayaBiayaTahunanChartData: StackedRow[] = useMemo(() => {
    const biayaRows = activeDashboardData?.biayaBiaya || activeDashboardData?.biaya_biaya || [];
    if (Array.isArray(biayaRows) && biayaRows.length > 0) {
      return biayaRows.map((item: any) => ({
        kategori: item.kategori || item.bulan || item.tanggal || item.name,
        subs: item.subs || [],
      }));
    }
    const biayaCategory = rekapData.find((row) => row.name === 'BIAYA');
    if (!biayaCategory) return [];
    return [{
      kategori: isAllYearsScope ? 'Semua Tahun' : isAnnualScope ? String(year) : `${month}-${String(year).slice(-2)}`,
      subs: (biayaCategory.subs || []).map((sub) => ({
        name: sub.sub_kategori || sub.subKategori || sub.name || '-',
        total: Number(sub.total || 0),
      })),
    }];
  }, [activeDashboardData, isAllYearsScope, isAnnualScope, month, rekapData, year]);

  const categoryCardsData = rekapData.map((item) => ({
    kategori: item.name,
    total_kategori: item.value,
    subs: item.subs || [],
  }));

  const baseAmountKeys = [
    'kpi-total-saldo',
    'kpi-penjualan',
    'kpi-pembelian',
    'kpi-biaya',
    'line-margin-total',
    'line-pembelian-total',
    'stacked-avg-pendapatan',
    'stacked-avg-biaya',
  ];
  const allAmountKeys = [
    ...baseAmountKeys,
    ...categoryCardsData.map((item, idx) => `kategori-total-${item.kategori}-${idx}`),
  ];
  const isAmountVisible = (key: string) => visibleAmountKeys[key] ?? true;
  const toggleAmountVisibility = (key: string) => {
    setVisibleAmountKeys((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };
  const areAllNominalsVisible = allAmountKeys.every((key) => isAmountVisible(key));
  const toggleAllNominals = () => {
    const nextVisible = !areAllNominalsVisible;
    setVisibleAmountKeys(Object.fromEntries(allAmountKeys.map((key) => [key, nextVisible])));
  };

  const renderCurrencyWithToggle = (
    value: number,
    amountKey: string,
    options?: { className?: string; valueClassName?: string; buttonClassName?: string }
  ) => (
    <div className={options?.className || 'flex items-center gap-2'}>
      <span className={options?.valueClassName}>
        {isAmountVisible(amountKey) ? formatCurrency(value) : MASK_CURRENCY}
      </span>
      <button
        type="button"
        onClick={() => toggleAmountVisibility(amountKey)}
        className={options?.buttonClassName || 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors'}
        title={isAmountVisible(amountKey) ? 'Sembunyikan nominal' : 'Tampilkan nominal'}
        aria-label={isAmountVisible(amountKey) ? 'Sembunyikan nominal' : 'Tampilkan nominal'}
      >
        {isAmountVisible(amountKey) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );

  const renderCompactCurrencyWithToggle = (value: number, amountKey: string, valueClassName = 'font-semibold text-blue-600') =>
    renderCurrencyWithToggle(value, amountKey, {
      className: 'inline-flex items-center gap-1.5',
      valueClassName,
      buttonClassName:
        'inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors',
    });

  const isDashboardLoading = isAllYearsScope ? isAllYearsLoading : isLoading;
  const isDashboardEmpty =
    rekapData.length === 0 &&
    pendapatanHarianChartData.length === 0 &&
    grossMarginTahunanLineData.every((row) => Number(row.nominal || 0) === 0) &&
    pembelianLineData.every((row) => Number(row.nominal || 0) === 0) &&
    biayaBiayaTahunanChartData.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-0 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">
              Financial Dashboard V2
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Baseline dashboard + floating filter + grouping mingguan + semua tahun
            </p>
          </div>
        </div>

        <div className="fixed bottom-6 right-6 z-40 left-6 md:left-auto md:w-auto">
          <Card className={`${dashboardCardClass} bg-white/95 backdrop-blur-md shadow-xl`}>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px]">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Bulan/Scope</label>
                  <Select
                    value={month}
                    onValueChange={(value) => {
                      setMonth(value);
                      if (value === 'ANNUAL' || value === 'ALL_YEARS') setGrouping('daily');
                    }}
                  >
                    <SelectTrigger className="h-10 bg-white border-slate-300">
                      <SelectValue placeholder="Pilih Bulan" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 shadow-xl">
                      {MONTH_OPTIONS.map((monthOption) => (
                        <SelectItem key={monthOption.value} value={monthOption.value}>
                          {monthOption.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {month !== 'ALL_YEARS' && (
                  <div className="min-w-[140px]">
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Tahun</label>
                    <Select
                      value={year}
                      onValueChange={(value) => {
                        userSelectedYearRef.current = true;
                        setYear(value);
                      }}
                      disabled={isYearsLoading}
                    >
                      <SelectTrigger className="h-10 bg-white border-slate-300">
                        <SelectValue placeholder="Tahun" />
                      </SelectTrigger>
                      <SelectContent className="max-h-56 overflow-y-auto bg-white border-slate-200 shadow-xl">
                        {uniqueFiscalYears.map((th) => (
                          <SelectItem key={th} value={th.toString()}>{th}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {month !== 'ANNUAL' && month !== 'ALL_YEARS' && (
                  <div className="min-w-[160px]">
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Grouping</label>
                    <Select value={grouping} onValueChange={(value) => setGrouping(value as 'daily' | 'weekly')}>
                      <SelectTrigger className="h-10 bg-white border-slate-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 shadow-xl">
                        {GROUPING_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMonth(new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase());
                    setGrouping('daily');
                  }}
                  className="h-10 px-4 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={toggleAllNominals}
                  className="h-10 px-4 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {areAllNominalsVisible ? 'Sembunyikan Semua Nominal' : 'Tampilkan Semua Nominal'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className={dashboardCardClass}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Total Saldo Rekening</p>
              <div className="mt-2">
                {renderCurrencyWithToggle(totalAkumulasiSaldoRekening, 'kpi-total-saldo', {
                  valueClassName: 'text-2xl font-bold text-emerald-700',
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Rekening aktif: {rekeningDashboardList.length}</p>
              <button
                type="button"
                onClick={() => setShowRekeningDetail(true)}
                className="mt-3 inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                Lihat Detail
              </button>
            </CardContent>
          </Card>
          <Card className={dashboardCardClass}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Penjualan</p>
              <div className="mt-2">
                {renderCurrencyWithToggle(penjualanTotal, 'kpi-penjualan', {
                  valueClassName: 'text-2xl font-bold text-slate-900',
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Periode aktif</p>
            </CardContent>
          </Card>
          <Card className={dashboardCardClass}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Pembelian</p>
              <div className="mt-2">
                {renderCurrencyWithToggle(pembelianTotal, 'kpi-pembelian', {
                  valueClassName: 'text-2xl font-bold text-slate-900',
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Periode aktif</p>
            </CardContent>
          </Card>
          <Card className={dashboardCardClass}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Biaya</p>
              <div className="mt-2">
                {renderCurrencyWithToggle(biayaTotal, 'kpi-biaya', {
                  valueClassName: 'text-2xl font-bold text-slate-900',
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Periode aktif</p>
            </CardContent>
          </Card>
        </div>

        <Dialog open={showRekeningDetail} onOpenChange={setShowRekeningDetail}>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Detail Saldo Rekening Aktif</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Kode Bank</th>
                    <th className="text-left px-3 py-2 font-semibold">No Rekening</th>
                    <th className="text-left px-3 py-2 font-semibold">Nama Rekening</th>
                    <th className="text-right px-3 py-2 font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {isRekeningDashboardLoading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">Memuat data rekening...</td>
                    </tr>
                  ) : rekeningDashboardList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">Belum ada data rekening.</td>
                    </tr>
                  ) : (
                    rekeningDashboardList.map((rekening: any) => (
                      <tr key={rekening._id || `${rekening.kode_bank}-${rekening.no_rekening}`} className="border-t border-slate-100">
                        <td className="px-3 py-2">{rekening.kode_bank || '-'}</td>
                        <td className="px-3 py-2">{rekening.no_rekening || '-'}</td>
                        <td className="px-3 py-2">{rekening.nama_rekening || '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {isAmountVisible('kpi-total-saldo') ? formatCurrency(Number(rekening.saldo || 0)) : MASK_CURRENCY}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>

        {error ? (
          <Card className={dashboardCardClass}>
            <CardContent className="py-6 text-sm text-red-600">Gagal memuat dashboard finance.</CardContent>
          </Card>
        ) : isDashboardLoading ? (
          <div className="h-[400px] flex items-center justify-center">
            <Card className={`w-full max-w-md ${dashboardCardClass}`}>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-600 font-medium">Loading dashboard data...</p>
              </CardContent>
            </Card>
          </div>
        ) : isDashboardEmpty ? (
          <Card className={dashboardCardClass}>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h3>
              <p className="text-gray-600 text-center">Start adding transactions to see your financial insights</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-900">Revenue & Expense Breakdown</h2>
              <p className="text-sm text-slate-500">Ringkasan chart finansial berdasarkan filter periode aktif.</p>
            </div>

            {pendapatanHarianChartData.some((row) => row.subs.some((sub) => Number(sub.total || 0) !== 0)) && (
              <div className="mb-8">
                <Card className={dashboardCardClass}>
                  <CardContent className="pt-6">
                    <StackedBarKategori
                      data={pendapatanHarianChartData}
                      title={`Penjualan ${shouldUseWeeklyGrouping ? 'Weekly' : 'Daily'} Breakdown - ${month} ${year}`}
                      description={`${shouldUseWeeklyGrouping ? 'Weekly' : 'Daily'} breakdown of income transactions by subcategory`}
                      showAverageNominal={isAmountVisible('stacked-avg-pendapatan')}
                      onToggleAverageNominal={() => toggleAmountVisibility('stacked-avg-pendapatan')}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {grossMarginTahunanLineData.some((row) => Number(row.nominal || 0) !== 0) && (
              <div className="mb-8">
                <Card className={dashboardCardClass}>
                  <CardContent className="pt-6">
                    <LineChartKategori
                      data={grossMarginTahunanLineData}
                      title={`Margin - ${isAllYearsScope ? 'Semua Tahun' : year}`}
                      description={isAllYearsScope ? 'Yearly gross margin trend (Omzet - Biaya - Pembelian)' : `${shouldUseWeeklyGrouping ? 'Weekly' : isAnnualScope ? 'Monthly' : 'Daily'} gross margin trend (Omzet - Biaya - Pembelian)`}
                      showNominal={isAmountVisible('line-margin-total')}
                      onToggleNominal={() => toggleAmountVisibility('line-margin-total')}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {pembelianLineData.some((row) => Number(row.nominal || 0) !== 0) && (
              <div className="mb-8">
                <Card className={dashboardCardClass}>
                  <CardContent className="pt-6">
                    <LineChartKategori
                      data={pembelianLineData}
                      title={`PEMBELIAN ${isAllYearsScope ? 'Yearly' : shouldUseWeeklyGrouping ? 'Weekly' : isAnnualScope ? 'Monthly' : 'Daily'} Trend - ${isAllYearsScope ? 'Semua Tahun' : year}`}
                      description={isAllYearsScope ? 'Yearly purchasing trend across all fiscal years' : `${shouldUseWeeklyGrouping ? 'Weekly' : isAnnualScope ? 'Monthly' : 'Daily'} purchasing trend`}
                      showNominal={isAmountVisible('line-pembelian-total')}
                      onToggleNominal={() => toggleAmountVisibility('line-pembelian-total')}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {biayaBiayaTahunanChartData.length > 0 && (
              <div className="mb-8">
                <Card className={dashboardCardClass}>
                  <CardContent className="pt-6">
                    <StackedBarKategori
                      data={biayaBiayaTahunanChartData}
                      title={`Biaya Biaya ${isAllYearsScope ? 'Yearly' : shouldUseWeeklyGrouping ? 'Weekly' : isAnnualScope ? 'Monthly' : 'Daily'} Breakdown`}
                      description={`${isAllYearsScope ? 'Yearly' : shouldUseWeeklyGrouping ? 'Weekly' : isAnnualScope ? 'Monthly' : 'Daily'} breakdown of finance expenses`}
                      showAverageNominal={isAmountVisible('stacked-avg-biaya')}
                      onToggleAverageNominal={() => toggleAmountVisibility('stacked-avg-biaya')}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-2 bg-gray-100/50 rounded-lg p-1">
                <button
                  onClick={() => setChartType('donut')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${chartType === 'donut'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  Donut Chart
                </button>
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${chartType === 'bar'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  Bar Chart
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {categoryCardsData.map((item: any, idx: number) => {
                const amountKey = `kategori-total-${item.kategori}-${idx}`;
                const subChartData = (item.subs || []).map((sub: any) => ({
                  name: sub.sub_kategori || sub.subKategori || sub.name || '-',
                  value: Number(sub.total || 0),
                }));
                return (
                  <Card key={`${item.kategori}-${idx}`} className={dashboardCardClass}>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl font-bold text-gray-900">{item.kategori}</CardTitle>
                      <CardDescription className="text-gray-600 text-sm">
                        <span className="mr-1">Total :</span>
                        {renderCompactCurrencyWithToggle(
                          Number(item.total_kategori || 0),
                          amountKey,
                          'font-semibold text-blue-600'
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {chartType === 'donut' ? (
                        <ChartDonut
                          data={subChartData}
                          totalKategori={item.total_kategori}
                          showNominal={isAmountVisible(amountKey)}
                        />
                      ) : (
                        <ChartBar
                          data={subChartData}
                          totalKategori={item.total_kategori}
                          showNominal={isAmountVisible(amountKey)}
                          showAverageNominal={isAmountVisible(amountKey)}
                        />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
