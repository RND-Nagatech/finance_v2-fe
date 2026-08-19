import { useState, type ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { useAppStore } from '@/store/useAppStore';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpenCheck,
  ChevronDown,
  Database,
  DatabaseZap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Receipt,
  Scale,
  ShieldCheck,
  Wrench,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import axiosInstance from '@/api/axiosInstance';
import { toast } from 'react-toastify';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarGroup,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { isProgramInternalSession } from '@/utils/programInternalRedirect';
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

const mainButtonClass = cn(
  'group relative h-12 rounded-[15px] px-4 text-[15px] text-slate-300 transition-all duration-200',
  'hover:translate-x-0.5 hover:!bg-white/[0.055] hover:!text-white',
  'focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-0',
  'data-[active=true]:border data-[active=true]:border-blue-400/25',
  'data-[active=true]:!bg-[linear-gradient(90deg,rgba(37,99,235,0.42),rgba(79,70,229,0.34))]',
  'data-[active=true]:!text-white data-[active=true]:shadow-[0_10px_24px_rgba(37,99,235,0.16)]'
);

const subButtonClass = cn(
  'group relative h-8 rounded-md px-2.5 text-[13px] text-slate-400 transition-all duration-200',
  'hover:translate-x-0.5 hover:!bg-white/[0.045] hover:!text-slate-100',
  'data-[active=true]:!bg-blue-500/12 data-[active=true]:!text-white',
  '[&:hover_.submenu-dot]:bg-blue-300 [&:hover_.submenu-dot]:shadow-[0_0_0_3px_rgba(96,165,250,0.12)]',
  'data-[active=true]:[&_.submenu-dot]:bg-blue-300 data-[active=true]:[&_.submenu-dot]:shadow-[0_0_0_3px_rgba(96,165,250,0.14)]'
);

const subDotClass = cn(
  'submenu-dot h-2 w-2 rounded-full bg-slate-500/45 transition-all duration-200'
);

function ActiveBar({ active }: { active: boolean }) {
  if (!active) return null;
  return <div className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-blue-400 to-indigo-500" />;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400/70">
      {children}
    </div>
  );
}

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAppStore();
  const [isMasterOpen, setIsMasterOpen] = useState(location.pathname.startsWith('/master'));
  const [isToolsOpen, setIsToolsOpen] = useState(
    location.pathname === '/summary-tools' || location.pathname === '/reconciliation-tool'
  );
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const isSsoSession = isProgramInternalSession();

  const confirmLogout = () => {
    setShowLogoutDialog(false);
    logout();
    navigate('/login');
  };

  const handleChangePassword = async () => {
    if (!passwordForm.old_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      toast.error('Semua field password wajib diisi.');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Konfirmasi password baru tidak cocok.');
      return;
    }
    setChangingPassword(true);
    try {
      const response = await axiosInstance.put('/users/change-password', passwordForm);
      toast.success(response?.data?.message || 'Password berhasil diubah.');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      setChangePasswordOpen(false);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal mengubah password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const masterItems = [
    { to: '/master/kategori', label: 'Kategori' },
    { to: '/master/subkategori', label: 'Sub Kategori' },
    { to: '/master/akun', label: 'Akun' },
    { to: '/master/perusahaan', label: 'Perusahaan' },
    { to: '/master/bank', label: 'Bank' },
    { to: '/master/rekening', label: 'Rekening' },
  ];
  const toolItems = [
    { to: '/summary-tools', label: 'Summary Tools', icon: DatabaseZap },
    { to: '/reconciliation-tool', label: 'Reconciliation Tool', icon: Scale },
  ];
  const userRole = String(user?.role || '').toLowerCase();
  const roleLabel = userRole === 'superuser' ? 'Administrator' : userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'Account User';
  const isToolsActive = toolItems.some((item) => location.pathname === item.to);

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-slate-700/40 bg-[linear-gradient(180deg,#101a2c_0%,#142033_52%,#0f1728_100%)] text-white shadow-[18px_0_45px_rgba(15,23,42,0.20)]">
        <SidebarContent className="relative z-10 flex h-full gap-0 overflow-hidden pt-5">
          <SidebarHeader className="px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_10px_22px_rgba(37,99,235,0.20)] ring-1 ring-white/10">
                <Wallet className="h-[22px] w-[22px] text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[27px] font-extrabold leading-none tracking-tight text-white">FinancePro</h1>
                <p className="mt-1 text-[13px] font-medium text-slate-400">Accounting System</p>
              </div>
            </div>

            {user && (
              <div className="mt-5 rounded-[18px] border border-white/[0.07] bg-white/[0.055] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950/35 text-blue-200 ring-1 ring-white/10">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-bold uppercase leading-tight text-white">{user.name}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{roleLabel}</p>
                    </div>
                  </div>
                  {!isSsoSession && (
                    <button
                      type="button"
                      onClick={() => setChangePasswordOpen(true)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-slate-950/25 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                      title="Ganti Password"
                      aria-label="Ganti Password"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </SidebarHeader>

          <SidebarGroup className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pr-2 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.35)_transparent]">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                <SectionLabel>Main</SectionLabel>
                <SidebarMenuItem>
                  <NavLink to="/dashboard">
                    <SidebarMenuButton isActive={location.pathname === '/dashboard'} className={mainButtonClass}>
                      <LayoutDashboard className="h-5 w-5" />
                      <span className="font-semibold">Dashboard</span>
                      <ActiveBar active={location.pathname === '/dashboard'} />
                    </SidebarMenuButton>
                  </NavLink>
                </SidebarMenuItem>

                <SectionLabel>Data</SectionLabel>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setIsMasterOpen((v) => !v)}
                    isActive={location.pathname.startsWith('/master')}
                    className={mainButtonClass}
                    aria-expanded={isMasterOpen}
                    aria-controls="master-data-submenu"
                  >
                    <Database className="h-5 w-5" />
                    <span className="font-semibold">Master Data</span>
                    <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform duration-200', isMasterOpen && 'rotate-180')} />
                    <ActiveBar active={location.pathname.startsWith('/master')} />
                  </SidebarMenuButton>
                  {isMasterOpen && (
                    <SidebarMenuSub id="master-data-submenu" className="ml-6 mt-1.5 space-y-0.5 border-l border-slate-600/35 pl-2.5">
                      {masterItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                          <SidebarMenuSubItem key={item.to}>
                            <NavLink to={item.to}>
                              <SidebarMenuSubButton asChild isActive={isActive} className={subButtonClass}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      subDotClass,
                                      isActive && 'bg-blue-300 shadow-[0_0_0_3px_rgba(96,165,250,0.14)]'
                                    )}
                                  />
                                  <span className="font-medium">{item.label}</span>
                                </div>
                              </SidebarMenuSubButton>
                            </NavLink>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>

                <SectionLabel>Operations</SectionLabel>
                <SidebarMenuItem>
                  <NavLink to="/transaksi">
                    <SidebarMenuButton isActive={location.pathname === '/transaksi'} className={mainButtonClass}>
                      <Receipt className="h-5 w-5" />
                      <span className="font-semibold">Transaksi</span>
                      <ActiveBar active={location.pathname === '/transaksi'} />
                    </SidebarMenuButton>
                  </NavLink>
                </SidebarMenuItem>

                <SectionLabel>System</SectionLabel>
                {user?.role === 'superuser' && (
                  <>
                    <SidebarMenuItem>
                      <NavLink to="/users">
                        <SidebarMenuButton isActive={location.pathname === '/users'} className={mainButtonClass}>
                          <Users className="h-5 w-5" />
                          <span className="font-semibold">Users</span>
                          <ActiveBar active={location.pathname === '/users'} />
                        </SidebarMenuButton>
                      </NavLink>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setIsToolsOpen((v) => !v)}
                        isActive={isToolsActive}
                        className={mainButtonClass}
                        aria-expanded={isToolsOpen}
                        aria-controls="tools-submenu"
                      >
                        <Wrench className="h-5 w-5" />
                        <span className="font-semibold">Tools</span>
                        <ChevronDown className={cn('ml-auto h-4 w-4 transition-transform duration-200', isToolsOpen && 'rotate-180')} />
                        <ActiveBar active={isToolsActive} />
                      </SidebarMenuButton>
                      {isToolsOpen && (
                        <SidebarMenuSub id="tools-submenu" className="ml-6 mt-1.5 space-y-0.5 border-l border-slate-600/35 pl-2.5">
                          {toolItems.map((item) => {
                            const isActive = location.pathname === item.to;
                            const Icon = item.icon;
                            return (
                              <SidebarMenuSubItem key={item.to}>
                                <NavLink to={item.to}>
                                  <SidebarMenuSubButton asChild isActive={isActive} className={subButtonClass}>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          subDotClass,
                                          isActive && 'bg-blue-300 shadow-[0_0_0_3px_rgba(96,165,250,0.14)]'
                                        )}
                                      />
                                      <Icon className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-100" />
                                      <span className="font-medium">{item.label}</span>
                                    </div>
                                  </SidebarMenuSubButton>
                                </NavLink>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  </>
                )}
                <SidebarMenuItem>
                  <NavLink to="/tutupbuku">
                    <SidebarMenuButton isActive={location.pathname === '/tutupbuku'} className={mainButtonClass}>
                      <BookOpenCheck className="h-5 w-5" />
                      <span className="font-semibold">Tutup Buku</span>
                      <ActiveBar active={location.pathname === '/tutupbuku'} />
                    </SidebarMenuButton>
                  </NavLink>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <div className="relative z-10 w-full shrink-0 px-3 pb-5 pt-3">
            <div className="mb-3 h-px bg-gradient-to-r from-transparent via-slate-600/45 to-transparent" />
            <SidebarFooter>
              <SidebarMenu className="space-y-1.5">
                {!isSsoSession && (
                  <SidebarMenuItem>
                    <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
                      <AlertDialogTrigger asChild>
                        <SidebarMenuButton className={cn(mainButtonClass, 'text-slate-400 hover:bg-white/[0.055] hover:text-white')}>
                          <LogOut className="h-5 w-5" />
                          <span className="font-semibold">Logout</span>
                        </SidebarMenuButton>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-red-300 bg-white/95 shadow-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Konfirmasi Logout</AlertDialogTitle>
                          <AlertDialogDescription>
                            Apakah Anda yakin ingin keluar dari aplikasi? Anda akan diarahkan ke halaman login.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-3">
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction onClick={confirmLogout} className="bg-red-600 text-white hover:bg-red-700">
                            Ya, Logout
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarFooter>
          </div>
        </SidebarContent>
      </Sidebar>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ganti Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="old-password">Password Lama</Label>
              <Input
                id="old-password"
                type="password"
                value={passwordForm.old_password}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, old_password: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-password">Password Baru</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChangePasswordOpen(false)} disabled={changingPassword}>
                Batal
              </Button>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
