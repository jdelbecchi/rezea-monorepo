"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Tenant, logout } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BottomNavProps {
    userRole?: string;
}

export default function BottomNav({ userRole }: BottomNavProps) {
    const pathname = usePathname();
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;
    const [tenant, setTenant] = useState<Tenant | null>(null);

    useEffect(() => {
        api.getTenantSettings().then((t) => {
            setTenant(t);
            if (t && t.primary_color) {
                document.documentElement.style.setProperty('--primary-color', t.primary_color);
            }
        }).catch(() => {});
    }, []);

    const handleLogout = () => {
        logout();
    };

    const primaryColor = "var(--primary-color, #2563eb)";

    const basePath = "";
    const homePath = "/home";

    const navItems = [
        { 
            path: homePath, 
            label: "Accueil",
            icon: (active: boolean) => <span className="text-lg">🏠</span>
        },
        { 
            path: `${basePath}/planning`, 
            label: "Planning",
            icon: (active: boolean) => <span className="text-lg">🗓️</span>
        },
        { 
            path: `${basePath}/credits`, 
            label: "Boutique",
            icon: (active: boolean) => <span className="text-lg">🛍️</span>
        },
        { 
            path: `${basePath}/orders`, 
            label: "Commandes",
            icon: (active: boolean) => <span className="text-lg">📦</span>
        },
        ...(userRole === "staff" ? [{ 
            path: `${basePath}/gestion-inscriptions`, 
            label: "Gestion",
            icon: (active: boolean) => <span className="text-lg">⚙️</span>
        }] : []),
        { 
            path: `${basePath}/profile`, 
            label: "Profil",
            icon: (active: boolean) => <span className="text-lg">👤</span>
        },
    ];

    const isActive = (path: string) => {
        if (path === homePath || path === basePath) {
            return pathname === path || (path === homePath && pathname === basePath);
        }
        return pathname.startsWith(path);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-6 md:translate-x-0 md:w-20 md:h-auto md:min-w-0 md:rounded-3xl z-50 safe-bottom md:px-0">
            {/* Semi-transparent white frosted glass background */}
            <div 
                className="absolute inset-0 backdrop-blur-2xl md:rounded-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.08)] md:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
                style={{
                    background: 'rgba(255, 255, 255, 0.82)',
                    borderTop: '1px solid rgba(226, 232, 240, 0.8)',
                }}
            />
            {/* Soft white veil to tame flashy colors/shadows */}
            <div className="absolute inset-0 bg-white/5 md:rounded-3xl md:border md:border-slate-200/60" />
            <nav className="relative flex justify-around items-center h-16 px-3 md:flex-col md:h-auto md:py-6 md:gap-5 md:px-0">
                {navItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className="flex flex-col items-center justify-center flex-1 md:flex-initial min-w-[70px] md:min-w-0 md:w-full gap-1 transition-all duration-300 relative py-1"
                            style={{ color: active ? primaryColor : '#64748b' }}
                        >
                            <div className={`transition-all duration-300 ${active ? "scale-110" : "hover:scale-105"}`}>
                                {item.icon(active)}
                            </div>
                            <span className={`text-[10px] tracking-wide transition-all duration-300 ${
                                active ? "font-bold opacity-100" : "font-medium opacity-70"
                             }`}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
                {/* Logout button at the bottom of the sidebar - visible only on desktop */}
                <div className="hidden md:flex w-full justify-center border-t border-slate-200/60 pt-4 mt-2">
                    <button
                        onClick={handleLogout}
                        className="flex flex-col items-center justify-center gap-1 transition-all duration-300 text-slate-400 hover:text-rose-500 hover:scale-105 active:scale-[0.95]"
                    >
                        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 15L15 12M15 12L12 9M15 12H4M9 20h9a2 2 0 002-2V6a2 2 0 00-2-2H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[10px] tracking-wide font-medium">Déconnexion</span>
                    </button>
                </div>
            </nav>
        </div>
    );
}
