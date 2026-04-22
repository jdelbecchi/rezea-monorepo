"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";

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

interface NavItem {
    path: string;
    label: string;
    icon: string;
    highlight?: boolean;
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
    const slug = params?.slug as string;
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
    const [localTenant, setLocalTenant] = useState<any>(null);

    useEffect(() => {
        if (!tenant && slug) {
            api.getTenantBySlug(slug).then(setLocalTenant).catch(console.error);
        }
    }, [tenant, slug]);

    const activeTenant = tenant || localTenant;

    const handleLogout = () => {
        // Remove only session-related items, keep preferences
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_id");
        localStorage.removeItem("tenant_id");
        // Rediriger vers le portail du club (login) plutôt que la racine globale
        window.location.href = basePath || "/";
    };

    const basePath = slug ? `/${slug}` : "";
    const homePath = slug ? `/${slug}/home` : "/home";

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

    // Auto-open menus that contain the active page
    const isMenuOpen = (item: AdminNavItem) => {
        if (openMenus[item.label] !== undefined) return openMenus[item.label];
        if (item.children) {
            return item.children.some((child) => isActive(child.path));
        }
        return false;
    };

    const navItems: NavItem[] = [
        { path: homePath, label: "Accueil", icon: "🏠" },
        { path: `${basePath}/profile`, label: "Mon profil", icon: "👤" },
        { path: `${basePath}/credits`, label: "Boutique", icon: "🛍️" },
        { path: `${basePath}/planning`, label: "Planning et réservations", icon: "📋" },
        { path: `${basePath}/orders`, label: "Mes commandes", icon: "📦" },
    ];

    // Menus visibles par owner, manager et staff uniquement
    const isStaffOrAbove = user?.role === "owner" || user?.role === "manager" || user?.role === "staff";

    const staffNavItems: NavItem[] = [
        { path: `${basePath}/gestion-inscriptions`, label: "Suivi des inscriptions", icon: "📝" },
    ];

    const adminNavItems: AdminNavItem[] = [
        { path: `${basePath}/admin`, label: "Tableau de bord", icon: "📊" },
        { path: `${basePath}/admin/shop/offers`, label: "Catalogue d'offres", icon: "🏷️" },
        { path: `${basePath}/admin/shop/orders`, label: "Gestion des commandes", icon: "📦" },
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
        { path: `${basePath}/admin/emails`, label: "Emails", icon: "📧" },
        { path: `${basePath}/admin/settings`, label: "Paramètres", icon: "⚙️" },
    ];

    const isAdmin = user?.role === "owner" || user?.role === "manager";
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const SidebarContent = () => (
        <>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    {activeTenant?.logo_url ? (
                        <img src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${activeTenant.logo_url}`} className="h-8 w-8 object-contain" alt="Logo" />
                    ) : (
                        <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-xs font-bold">RZ</div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <div className="text-xl font-medium tracking-tight text-white truncate max-w-[150px]">
                            {activeTenant?.name || (slug === 'rezea' ? "rezea" : "chargement...")}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium tracking-wide">
                            Propulsé par Rezea
                        </div>
                    </div>
                </div>
                <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="md:hidden text-slate-400 hover:text-white"
                >
                    ✕
                </button>
            </div>

            {/* Bouton de bascule rapide vers Vue Client */}
            <div className="mb-6">
                <Link 
                    href={homePath}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <span className="text-base">📱</span>
                    VUE CLIENT
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2 -mr-2 scrollbar-hide">
                {/* Navigation admin */}
                {isAdmin && (
                    <>

                        <nav className="space-y-1">
                            {adminNavItems.map((item) => {
                                if (item.children) {
                                    const open = isMenuOpen(item);
                                    const parentActive = isParentActive(item);
                                    return (
                                        <div key={item.label} className="space-y-1">
                                            <button
                                                onClick={() => toggleMenu(item.label)}
                                                className={`w-full flex items-center justify-between py-2.5 px-4 rounded-xl transition-all text-left group ${parentActive
                                                    ? "bg-amber-600/10 text-amber-400 font-semibold border border-amber-500/20 shadow-sm shadow-amber-500/5"
                                                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                                    }`}
                                            >
                                                <span className="flex items-center whitespace-nowrap overflow-hidden text-ellipsis mr-2">
                                                    <span className="mr-3 text-lg opacity-80">{item.icon}</span>
                                                    {item.label}
                                                </span>
                                                <span className={`text-[10px] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}>
                                                    ▼
                                                </span>
                                            </button>
                                            {open && (
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
                                        className={`flex items-center py-2.5 px-4 rounded-xl transition-all whitespace-nowrap overflow-hidden text-ellipsis ${isActive(item.path!)
                                            ? "bg-amber-600/10 text-amber-400 font-semibold shadow-sm shadow-amber-500/5 border border-amber-500/20"
                                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                            }`}
                                    >
                                        <span className="mr-3 text-lg opacity-80">{item.icon}</span>
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                        <div className="border-t border-slate-800 my-6"></div>
                    </>
                )}

                {/* Navigation membre (cachée pour les admins pour éviter la confusion) */}
                {!isAdmin && (
                    <div>
                        <p className="px-4 text-[11px] font-medium text-slate-400 lowercase mb-3">
                            menus utilisateurs et staff
                        </p>
                        <nav className="space-y-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center py-2.5 px-4 rounded-xl transition-all whitespace-nowrap overflow-hidden text-ellipsis ${isActive(item.path)
                                        ? "bg-blue-600/10 text-blue-400 font-semibold shadow-sm shadow-blue-500/5 border border-blue-500/20"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                        }`}
                                >
                                    <span className="mr-3 text-lg opacity-80">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                            {isStaffOrAbove && staffNavItems.map((item) => (
                                <Link
                                    key={item.path}
                                    href={item.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center py-2.5 px-4 rounded-xl transition-all whitespace-nowrap overflow-hidden text-ellipsis ${isActive(item.path)
                                        ? "bg-emerald-600/10 text-emerald-400 font-semibold shadow-sm shadow-emerald-500/5 border border-emerald-500/20"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                        }`}
                                >
                                    <span className="mr-3 text-lg opacity-80">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                )}
            </div>

            <div className="border-t border-slate-800 pt-6">
                <button
                    onClick={handleLogout}
                    className="w-full py-4 px-4 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 hover:text-rose-300 rounded-2xl font-medium text-sm transition-all border border-rose-600/20 shadow-lg shadow-rose-900/10 active:scale-[0.98]"
                >
                    Déconnexion
                </button>
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
            <aside className="hidden md:flex w-80 bg-slate-900 text-white p-6 flex-col min-h-screen sticky top-0 border-r border-slate-800/50">
                <SidebarContent />
            </aside>

            {/* Sidebar Mobile (Drawer) */}
            <aside className={`md:hidden fixed top-0 bottom-0 left-0 w-[300px] bg-slate-900 border-r border-slate-800 p-6 z-[70] transition-transform duration-300 ease-out flex flex-col ${isMobileMenuOpen ? "translate-x-0 shadow-2xl shadow-black/50" : "-translate-x-full"}`}>
                <SidebarContent />
            </aside>
            
            {/* Spacer for mobile header */}
            <div className="md:hidden h-16" />
        </>
    );
}
