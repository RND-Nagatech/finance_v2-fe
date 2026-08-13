import { useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const mainRef = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem("main_layout_sidebar_visible");
    if (stored === "false") {
      setSidebarVisible(false);
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarVisible((prev) => {
      const next = !prev;
      localStorage.setItem("main_layout_sidebar_visible", String(next));
      return next;
    });
  };

  useEffect(() => {
    // Reset scroll position on every route change so page headers don't appear clipped.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  return (
    <SidebarProvider>
      <div className="relative min-h-screen w-full overflow-hidden bg-slate-50">

        {/* Sidebar */}
        {sidebarVisible && (
          <div className="fixed inset-y-0 left-0 z-40 hidden w-[17rem] overflow-hidden rounded-br-3xl rounded-tr-3xl lg:block">
            <AppSidebar />
          </div>
        )}

        {/* Sidebar Toggle (Desktop/Tablet) */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden lg:inline-flex fixed top-4 z-50 h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm hover:bg-white hover:text-slate-900 transition-all duration-200"
          style={{ left: sidebarVisible ? "calc(16rem - 1.25rem)" : "1rem" }}
          title={sidebarVisible ? "Sembunyikan Sidebar" : "Tampilkan Sidebar"}
          aria-label={sidebarVisible ? "Sembunyikan Sidebar" : "Tampilkan Sidebar"}
        >
          {sidebarVisible ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </button>

        {/* CONTENT AREA */}
        <main
          ref={mainRef}
          className={`flex-1 min-h-screen p-4 lg:p-8 transition-all duration-300 ${sidebarVisible ? "pl-0 lg:pl-[244px] lg:ml-4" : "pl-0 lg:pl-0 lg:ml-0"
            }`}
          style={{ maxWidth: '100vw' }}
        >
          {children}
        </main>

      </div>
    </SidebarProvider>
  );
}
