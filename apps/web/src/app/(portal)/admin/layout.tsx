"use client";

import StaffNotesInbox from "@/components/StaffNotesInbox";

/**
 * Layout partagé pour toutes les pages /[slug]/admin/*
 * Injecte le panneau Post-it flottant sur toutes les pages admin.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <StaffNotesInbox />
        </>
    );
}
