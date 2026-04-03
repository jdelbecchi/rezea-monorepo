"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
    userRole?: string;
}

export default function BottomNav({ userRole }: BottomNavProps) {
    const pathname = usePathname();

    const icons = {
        home: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
        planning: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
        shop: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 11-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
        ),
        orders: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
        admin: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
        ),
        profile: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        )
    };

    const navItems = [
        { path: "/dashboard", icon: icons.home, label: "Accueil" },
        { path: "/dashboard/planning", icon: icons.planning, label: "Planning" },
        { path: "/dashboard/credits", icon: icons.shop, label: "Boutique" },
        { path: "/dashboard/orders", icon: icons.orders, label: "Commandes" },
        ...(userRole === "staff" ? [{ path: "/dashboard/gestion-inscriptions", icon: icons.admin, label: "Inscriptions" }] : []),
        { path: "/dashboard/profile", icon: icons.profile, label: "Profil" },
    ];

    const isActive = (path: string) => {
        if (path === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(path);
    };

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 z-50 safe-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            <nav className="flex justify-around items-center h-16 px-2">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        href={item.path}
                        className={`flex flex-col items-center justify-center flex-1 min-w-0 transition-all duration-300 ${
                            isActive(item.path) ? "text-blue-600 scale-110" : "text-slate-400 hover:text-slate-600"
                        }`}
                    >
                        <div className={`transition-transform duration-300 ${isActive(item.path) ? "animate-in zoom-in-75" : ""}`}>
                            {item.icon}
                        </div>
                        <span className={`text-[10px] font-medium lowercase mt-1 truncate w-full text-center ${
                            isActive(item.path) ? "opacity-100" : "opacity-0 h-0"
                        } transition-all duration-300`}>
                            {item.label}
                        </span>
                    </Link>
                ))}
            </nav>
        </div>
    );
}
