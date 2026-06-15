"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Tenant } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BottomNavProps {
    userRole?: string;
}

export default function BottomNav({ userRole }: BottomNavProps) {
    const pathname = usePathname();
    const params = useParams();
    const slug = params?.slug as string;
    const [tenant, setTenant] = useState<Tenant | null>(null);

    useEffect(() => {
        api.getTenantSettings().then(setTenant).catch(() => {});
    }, []);

    const primaryColor = tenant?.primary_color || "#2563eb";

    const basePath = slug ? `/${slug}` : "";
    const homePath = slug ? `/${slug}/home` : "/home";

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
        <div className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-auto md:min-w-[420px] md:max-w-xl md:rounded-2xl z-50 safe-bottom md:px-2 md:pb-0">
            {/* Semi-transparent white frosted glass background */}
            <div 
                className="absolute inset-0 backdrop-blur-2xl md:rounded-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.08)] md:shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                style={{
                    background: 'rgba(255, 255, 255, 0.82)',
                    borderTop: '1px solid rgba(226, 232, 240, 0.8)',
                }}
            />
            {/* Soft white veil to tame flashy colors/shadows */}
            <div className="absolute inset-0 bg-white/5 md:rounded-2xl md:border md:border-slate-200/50" />
            <nav className="relative flex justify-around items-center h-16 px-3">
                {navItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className="flex flex-col items-center justify-center flex-1 min-w-[70px] gap-1 transition-all duration-300 relative py-1"
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
            </nav>
        </div>
    );
}
