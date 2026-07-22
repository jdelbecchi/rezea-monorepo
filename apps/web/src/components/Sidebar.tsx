"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams } from "next/navigation";
import { api, getTenantSlug, logout } from "@/lib/api";

interface User {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
}

interface SidebarProps {
    user: User | null;
    tenant?: {
        name: string;
        logo_url?: string | null;
        primary_color?: string;
    } | null;
}

interface AdminNavItem {
    path?: string;
    label: string;
    icon: string;
    children?: { path: string; label: string }[];
}

export default function Sidebar({ user, tenant }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const params = useParams();
    const slug = getTenantSlug();
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
    const [localTenant, setLocalTenant] = useState<any>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        if (!tenant) {
            if (slug) {
                api.getTenantBySlug(slug).then(setLocalTenant).catch(console.error);
            } else {
                api.getTenantSettings().then(setLocalTenant).catch(console.error);
            }
        }
    }, [tenant, slug]);

    const activeTenant = tenant || localTenant;

    const handleLogout = () => {
        logout();
    };

    const basePath = "";
    const homePath = "/home";

    const isActive = (path: string) => {
        if (path === homePath || path === basePath) {
            return pathname === path || (path === homePath && pathname === basePath);
        }
        return pathname === path;
    };

    const isParentActive = (item: AdminNavItem) => {
        if (item.path && isActive(item.path)) return true;
        if (item.children) {
            return item.children.some((child) => isActive(child.path));
        }
        return false;
    };

    const toggleMenu = (label: string) => {
        setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
    };

    const isMenuOpen = (item: AdminNavItem) => {
        if (openMenus[item.label] !== undefined) return openMenus[item.label];
        if (item.children) {
            return item.children.some((child) => isActive(child.path));
        }
        return false;
    };

    const adminNavItems: AdminNavItem[] = [
        { path: `${basePath}/admin`, label: "Tableau de bord", icon: "📊" },
        { path: `${basePath}/admin/shop/offers`, label: "Catalogue d'offres", icon: "🏷️" },
        { path: `${basePath}/admin/shop/orders`, label: "Gestion des commandes", icon: "📦" },
        { path: `${basePath}/admin/finance`, label: "Portefeuille", icon: "💰" },
        { path: `${basePath}/admin/planning/agenda`, label: "Agenda", icon: "📅" },
        {
            label: "Programmation du planning",
            icon: "📋",
            children: [
                { path: `${basePath}/admin/planning/sessions`, label: "Séances" },
                { path: `${basePath}/admin/events/programming`, label: "Evènements" },
            ],
        },
        {
            label: "Gestion des inscriptions",
            icon: "📝",
            children: [
                { path: `${basePath}/admin/planning/bookings`, label: "Inscriptions aux séances" },
                { path: `${basePath}/admin/events/registrations`, label: "Inscriptions aux évènements" },
            ],
        },
        { path: `${basePath}/admin/users`, label: "Utilisateurs", icon: "👥" },
        { path: `${basePath}/admin/emails`, label: "Communication & Marketing", icon: "📧" },
        { path: `${basePath}/admin/settings`, label: "Paramètres", icon: "⚙️" },
        { path: homePath, label: "Basculer sur la vue utilisateur", icon: "📱" },
    ];

    const SidebarContent = ({ expanded = true }: { expanded?: boolean }) => (
        <>
            {/* En-tête dans un cadre blanc encadré */}
            <div className={`pt-4 pb-2 transition-all duration-300 ${expanded ? "px-4" : "px-2"}`}>
                <div className={`bg-white rounded-2xl border border-slate-200 flex items-center shadow-sm overflow-hidden transition-all duration-300 ${expanded ? "px-4 h-20 justify-between" : "px-0 h-14 justify-center"}`}>
                    {expanded ? (
                        <div className="flex items-center gap-3 h-full">
                            {activeTenant?.logo_url ? (
                                <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${activeTenant.logo_url}`} className="h-16 w-auto object-contain" alt="Logo" />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-lg font-bold text-white shrink-0">RZ</div>
                            )}
                            <div className="flex flex-col min-w-0 gap-0">
                                <div className="text-lg font-semibold tracking-tight leading-tight text-slate-900 truncate max-w-[150px]">
                                    {activeTenant?.name || (slug === 'rezea' ? "rezea" : "chargement...")}
                                </div>
                                <div className="text-[10px] text-slate-500 font-medium tracking-wide -mt-0.5">
                                    Propulsé par Rezea
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center w-full h-full">
                            {activeTenant?.logo_url ? (
                                <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${activeTenant.logo_url}`} className="h-10 w-10 object-contain" alt="Logo" />
                            ) : (
                                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-sm font-bold text-white">RZ</div>
                            )}
                        </div>
                    )}
                    {expanded && (
                        <button 
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="md:hidden ml-3 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 scrollbar-hide pb-6">
                <nav className="space-y-1">
                    {adminNavItems.map((item) => {
                        if (item.children) {
                            const open = isMenuOpen(item);
                            const parentActive = isParentActive(item);
                            return (
                                <div key={item.label} className="space-y-1">
                                    <button
                                        onClick={() => expanded && toggleMenu(item.label)}
                                        className={`w-full flex items-center py-2.5 rounded-xl transition-all group ${expanded ? "justify-between px-4 text-left" : "justify-center px-0"} ${parentActive
                                            ? "bg-amber-600/10 text-amber-400 font-semibold border border-amber-500/20 shadow-sm shadow-amber-500/5"
                                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                            }`}
                                        title={!expanded ? item.label : undefined}
                                    >
                                        <div className={`flex items-center whitespace-nowrap overflow-hidden text-ellipsis ${expanded ? "mr-2" : ""}`}>
                                            <span className={`text-lg opacity-80 ${expanded ? "mr-3" : ""}`}>{item.icon}</span>
                                            {expanded && <span>{item.label}</span>}
                                        </div>
                                        {expanded && (
                                            <span className={`text-[10px] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}>
                                                ▼
                                            </span>
                                        )}
                                    </button>
                                    {expanded && open && (
                                        <div className="ml-7 mt-1 space-y-1 border-l-2 border-slate-800 pl-4 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {item.children.map((child) => (
                                                <Link
                                                    key={child.path}
                                                    href={child.path}
                                                    onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`block py-2 px-3 rounded-lg text-sm transition-all whitespace-nowrap overflow-hidden text-ellipsis ${isActive(child.path)
                                                        ? "text-amber-400 font-semibold"
                                                        : "text-slate-500 hover:text-slate-200"
                                                        }`}
                                                >
                                                    {child.label}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.path}
                                href={item.path!}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`flex items-center py-2.5 rounded-xl transition-all whitespace-nowrap overflow-hidden text-ellipsis ${expanded ? "px-4" : "justify-center px-0"} ${isActive(item.path!)
                                    ? "bg-amber-600/10 text-amber-400 font-semibold shadow-sm shadow-amber-500/5 border border-amber-500/20"
                                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                    }`}
                                title={!expanded ? item.label : undefined}
                            >
                                <span className={`text-lg opacity-80 ${expanded ? "mr-3" : ""}`}>{item.icon}</span>
                                {expanded && <span>{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t border-slate-800 my-3"></div>

                <div className={`flex ${expanded ? "flex-row items-center gap-2" : "flex-col gap-2"}`}>
                    <button
                        onClick={handleLogout}
                        className={`${expanded ? "flex-1 px-4" : "w-full justify-center"} flex py-2.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 hover:text-rose-300 rounded-xl transition-all border border-rose-600/20 shadow-sm active:scale-[0.98] font-medium text-sm`}
                        title={!expanded ? "Déconnexion" : undefined}
                    >
                        {expanded ? "Déconnexion" : "🚪"}
                    </button>

                    {/* Collapse Toggle Button */}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`hidden md:flex items-center justify-center shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors border border-slate-700 shadow-sm ${expanded ? "h-[42px] w-[42px]" : "w-full py-2"}`}
                        title={isCollapsed ? "Agrandir" : "Réduire"}
                    >
                        {isCollapsed ? "▶" : "◀"}
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* Header Mobile */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between z-50">
                <div className="flex items-center gap-3">
                    {activeTenant?.logo_url ? (
                        <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${activeTenant.logo_url}`} className="h-6 w-6 object-contain" alt="Logo" />
                    ) : (
                        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-[10px] font-bold">RZ</div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-white font-medium text-sm truncate max-w-[120px]">
                            {activeTenant?.name || (slug === 'rezea' ? "rezea" : "...")}
                        </span>
                        <span className="text-[8px] text-slate-500 font-medium tracking-tight">
                            Propulsé par Rezea
                        </span>
                    </div>
                </div>
                <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-2 -mr-2 text-slate-400 hover:text-white transition-colors"
                >
                    <span className="text-2xl">☰</span>
                </button>
            </header>

            {/* Overlay Mobile */}
            {isMobileMenuOpen && (
                <div 
                    className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] animate-in fade-in duration-300"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar Desktop */}
            <aside 
                className={`hidden md:flex bg-slate-900 text-white flex-col min-h-screen sticky top-0 border-r border-slate-800/50 transition-all duration-300 ease-in-out z-40 ${isCollapsed && !isHovered ? "w-20" : "w-80"}`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <SidebarContent expanded={!isCollapsed || isHovered} />
            </aside>

            {/* Sidebar Mobile (Drawer) */}
            <aside className={`md:hidden fixed top-0 bottom-0 left-0 w-[300px] bg-slate-900 border-r border-slate-800 z-[70] transition-transform duration-300 ease-out flex flex-col ${isMobileMenuOpen ? "translate-x-0 shadow-2xl shadow-black/50" : "-translate-x-full"}`}>
                <SidebarContent />
            </aside>
            
            {/* Spacer for mobile header */}
            <div className="md:hidden h-16" />
        </>
    );
}
