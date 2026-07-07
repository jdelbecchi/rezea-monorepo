"use client";

import Sidebar from "@/components/Sidebar";
import MultiSelect from "@/components/MultiSelect";
import ConfirmModal from "@/components/ConfirmModal";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { getSessionFilter, setSessionFilter, updateLastActivity } from "@/lib/sessionFilters";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { api, User, OrderItem, AdminBookingItem, AdminEventRegistrationItem } from "@/lib/api";

type EditableUser = Partial<User> & { id: string };

const ROLE_LABELS: Record<string, string> = {
    manager: "Manager",
    staff: "Staff",
    user: "Utilisateur",
};

const ROLE_COLORS: Record<string, string> = {
    manager: "bg-purple-100 text-purple-800",
    staff: "bg-blue-100 text-blue-800",
    user: "bg-gray-100 text-gray-800",
};

const SEGMENT_LABELS: Record<string, string> = {
    prospect: "Prospect",
    decouverte_1: "Découverte 1",
    decouverte_2: "Découverte 2",
    post_essai: "Post-Essai",
    actif: "Actif",
    occasionnel: "Occasionnel",
    distant: "Distant",
    inactif: "Inactif",
    archive: "Archivé",
};

const SEGMENT_COLORS: Record<string, string> = {
    prospect: "bg-amber-50 text-amber-700 border-amber-200",
    decouverte_1: "bg-orange-50 text-orange-700 border-orange-200",
    decouverte_2: "bg-orange-100 text-orange-800 border-orange-300",
    post_essai: "bg-purple-50 text-purple-700 border-purple-200",
    actif: "bg-emerald-50 text-emerald-700 border-emerald-200",
    occasionnel: "bg-sky-50 text-sky-700 border-sky-200",
    distant: "bg-rose-50 text-rose-700 border-rose-200",
    inactif: "bg-slate-100 text-slate-600 border-slate-200",
    archive: "bg-gray-200 text-gray-700 border-gray-300",
};

function AdminUsersPageContent() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(() => getSessionFilter("users_search", searchParams?.get("search") || ""));
    const [roleFilter, setRoleFilter] = useState<string[]>(() => getSessionFilter("users_roleFilter", []));
    const [segmentFilter, setSegmentFilter] = useState<string[]>(() => getSessionFilter("users_segmentFilter", []));

    // Sync filters to sessionStorage
    useEffect(() => {
        setSessionFilter("users_search", search);
    }, [search]);

    useEffect(() => {
        setSessionFilter("users_roleFilter", roleFilter);
    }, [roleFilter]);

    useEffect(() => {
        setSessionFilter("users_segmentFilter", segmentFilter);
    }, [segmentFilter]);

    // Handle global activity listener to update inactivity timestamp
    useEffect(() => {
        const handleActivity = () => {
            updateLastActivity();
        };
        window.addEventListener("click", handleActivity);
        window.addEventListener("keypress", handleActivity);
        return () => {
            window.removeEventListener("click", handleActivity);
            window.removeEventListener("keypress", handleActivity);
        };
    }, []);
    const [totalCount, setTotalCount] = useState(0);

    const shouldAutoOpenRef = useRef(!!(searchParams?.get("search")));

    useEffect(() => {
        const querySearch = searchParams?.get("search");
        if (querySearch) {
            setSearch(querySearch);
            shouldAutoOpenRef.current = true;
        }
    }, [searchParams]);

    // Edit modal state
    const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");
    const [activeTab, setActiveTab] = useState<"profile" | "history">("profile");
    const [userOrders, setUserOrders] = useState<OrderItem[]>([]);
    const [userBookings, setUserBookings] = useState<AdminBookingItem[]>([]);
    const [userRegistrations, setUserRegistrations] = useState<AdminEventRegistrationItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const fetchUserHistory = useCallback(async (userId: string) => {
        setLoadingHistory(true);
        try {
            const [orders, bookings, registrations] = await Promise.all([
                api.getAdminOrders(),
                api.getAdminBookings(),
                api.getAdminEventRegistrations()
            ]);
            setUserOrders(
                orders
                    .filter((o) => o.user_id === userId)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            );
            setUserBookings(
                bookings
                    .filter((b) => b.user_id === userId)
                    .sort((a, b) => {
                        const dateCompare = b.session_date.localeCompare(a.session_date);
                        if (dateCompare !== 0) return dateCompare;
                        return b.session_time.localeCompare(b.session_time);
                    })
            );
            setUserRegistrations(
                registrations
                    .filter((r) => r.user_id === userId)
                    .sort((a, b) => {
                        const dateCompare = b.event_date.localeCompare(a.event_date);
                        if (dateCompare !== 0) return dateCompare;
                        return b.event_time.localeCompare(b.event_time);
                    })
            );
        } catch (error) {
            console.error("Error fetching user history:", error);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        if (editingUser?.id && activeTab === "history") {
            fetchUserHistory(editingUser.id);
        }
    }, [editingUser?.id, activeTab, fetchUserHistory]);

    // Delete confirmation
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Create modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [editPassword, setEditPassword] = useState("");
    const [showEditPassword, setShowEditPassword] = useState(false);
    const [newUser, setNewUser] = useState({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        role: "user",
        phone: "",
        street: "",
        zip_code: "",
        city: "",
        birth_date: "",
        instagram_handle: "",
        facebook_handle: "",
        is_active_override: false,
    });
    const [creating, setCreating] = useState(false);
    const [createMessage, setCreateMessage] = useState("");
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Get user and check permissions BEFORE other data
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push(`/${params.slug}/home`);
                return;
            }
            setCurrentUser(userData);

            // 2. Fetch other data
            await fetchUsers();
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push(`/${params.slug}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, any> = {};
            if (search) params.search = search;
            if (roleFilter.length > 0) params.role = roleFilter.join(",");
            if (segmentFilter.length > 0) params.segment = segmentFilter.join(",");

            const [data, countData] = await Promise.all([
                api.getAdminUsers(params),
                api.getAdminUsersCount(params),
            ]);
            setUsers(data);
            setTotalCount(countData.count);

            if (shouldAutoOpenRef.current && data.length > 0) {
                const cleanSearch = search.toLowerCase().trim();
                const bestMatch = data.find(u => 
                    u.email.toLowerCase() === cleanSearch || 
                    `${u.first_name} ${u.last_name}`.toLowerCase() === cleanSearch
                ) || data[0];
                
                if (bestMatch) {
                    setEditingUser({ ...bestMatch });
                    setActiveTab("profile");
                    setEditPassword("");
                    setShowEditPassword(false);
                    setSaveMessage("");
                }
                shouldAutoOpenRef.current = false;
            }
        } catch {
            setUsers([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, segmentFilter]);

    useEffect(() => {
        fetchData();
    }, [router]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Excel export
    const handleExport = () => {
        if (users.length === 0) return;

        const headers = [
            "Prénom", "Nom", "Email", "Téléphone",
            "Adresse", "Code postal", "Ville",
            "Date de naissance", "Instagram", "Facebook",
            "Profil", "Statut / Segment", "Black List", "Motif", "Date de création",
        ];

        const rows = users.map((u) => [
            u.first_name,
            u.last_name,
            u.email,
            u.phone || "",
            u.street || "",
            u.zip_code || "",
            u.city || "",
            u.birth_date || "",
            u.instagram_handle || "",
            u.facebook_handle || "",
            ROLE_LABELS[u.role] || u.role,
            u.role !== "user" ? "Administrateur" : (u.segment ? (SEGMENT_LABELS[u.segment] || u.segment) : (u.is_active ? "Actif" : "Inactif")),
            u.is_blacklisted ? "Oui" : "Non",
            u.blacklist_reason || "",
            u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "",
        ]);

        const csvContent = [
            headers.join(";"),
            ...rows.map((row) => row.map((cell) => `"${cell}"`).join(";")),
        ].join("\n");

        const BOM = "\uFEFF";
        const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `utilisateurs_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Save user edits
    const handleSave = async () => {
        if (!editingUser) return;
        setSaving(true);
        setSaveMessage("");
        try {
            const { id, ...data } = editingUser;
            const cleanData: Record<string, any> = {};
            const editableFields = [
                "first_name", "last_name", "email", "phone",
                "street", "zip_code", "city", "birth_date",
                "instagram_handle", "facebook_handle", "role", "is_active",
                "is_active_override", "is_blacklisted", "blacklist_reason",
                "is_archived", "status_override",
            ];
            for (const field of editableFields) {
                if ((data as any)[field] !== undefined) {
                    cleanData[field] = (data as any)[field];
                }
            }
            if (editPassword.trim()) {
                cleanData.password = editPassword;
            }
            await api.updateAdminUser(id, cleanData);
            setMessage({ type: 'success', text: "Utilisateur mis à jour avec succès" });
            await fetchUsers();
            setEditingUser(null);
            setEditPassword("");
            setShowEditPassword(false);
        } catch (err: any) {
            const apiError = err.response?.data?.detail || err.message || "Erreur lors de la mise à jour";
            setSaveMessage(typeof apiError === "string" ? apiError : JSON.stringify(apiError));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingUser) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await api.deleteAdminUser(deletingUser.id);
            setDeletingUser(null);
            await fetchUsers();
            setMessage({ type: 'success', text: "Utilisateur supprimé avec succès" });
        } catch (err: any) {
            const apiError = err.response?.data?.detail || err.message || "Erreur lors de la suppression";
            setDeleteError(typeof apiError === "string" ? apiError : JSON.stringify(apiError));
        } finally {
            setDeleting(false);
        }
    };

    const handleCreate = async () => {
        if (!newUser.first_name || !newUser.last_name || !newUser.email || !newUser.password) {
            setCreateMessage("Veuillez remplir les champs obligatoires (prénom, nom, email, mot de passe)");
            return;
        }
        setCreating(true);
        setCreateMessage("");
        try {
            const dataToSend: Record<string, any> = { ...newUser };
            Object.keys(dataToSend).forEach((key) => {
                if (dataToSend[key] === "") delete dataToSend[key];
            });
            dataToSend.first_name = newUser.first_name;
            dataToSend.last_name = newUser.last_name;
            dataToSend.email = newUser.email;
            dataToSend.password = newUser.password;
            dataToSend.role = newUser.role;

            await api.createAdminUser(dataToSend as any);
            setMessage({ type: 'success', text: "Utilisateur créé avec succès" });
            await fetchUsers();
            setShowCreateModal(false);
            setNewUser({
                first_name: "", last_name: "", email: "", password: "",
                role: "user", phone: "", street: "", zip_code: "",
                city: "", birth_date: "", instagram_handle: "", facebook_handle: "",
                is_active_override: false,
            });
        } catch (err: any) {
            const detail = err?.response?.data?.detail || "Erreur lors de la création";
            setCreateMessage(detail);
        } finally {
            setCreating(false);
        }
    };

    const updateNewUserField = (field: string, value: any) => {
        setNewUser({ ...newUser, [field]: value });
    };

    const openEditModal = (user: User) => {
        setEditingUser({ ...user });
        setActiveTab("profile");
        setEditPassword("");
        setShowEditPassword(false);
        setSaveMessage("");
    };

    const updateEditField = (field: string, value: any) => {
        if (!editingUser) return;
        setEditingUser({ ...editingUser, [field]: value });
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            <Sidebar user={currentUser} />
            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">👥 Utilisateurs</h1>
                                <p className="text-base font-normal text-slate-500 mt-1">
                                    Consulter et gérer les données de vos contacts
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium shadow-sm text-sm active:scale-95"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Nouvel utilisateur
                                </button>
                            </div>
                        </div>

                        {message && (
                            <div className={`p-3 rounded-xl flex items-center justify-between border mb-6 animate-in slide-in-from-top-2 duration-300 ${
                                message.type === 'success' 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                    : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">
                                        {message.type === 'success' ? '✅' : '⚠️'}
                                    </span>
                                    <span className="text-sm font-normal text-slate-700 tracking-tight">
                                        {message.text}
                                    </span>
                                </div>
                                <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-white/50 rounded-lg">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        )}

                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-6">
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-medium text-slate-500 mb-1">🔍 Rechercher</label>
                                <input
                                    type="text"
                                    placeholder="Nom, prénom ou email..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    autoComplete="off"
                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-normal transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div className="w-48">
                                <MultiSelect
                                    label="Profil(s)"
                                    options={[
                                        { id: "manager", label: "Manager" },
                                        { id: "staff", label: "Staff" },
                                        { id: "user", label: "Utilisateur" },
                                    ]}
                                    selected={roleFilter}
                                    onChange={setRoleFilter}
                                    placeholder="Tous les profils"
                                />
                            </div>
                            <div className="w-48">
                                <MultiSelect
                                    label="Statut(s)"
                                    options={[
                                        { id: "prospect", label: "Prospect" },
                                        { id: "decouverte_1", label: "Découverte 1" },
                                        { id: "decouverte_2", label: "Découverte 2" },
                                        { id: "post_essai", label: "Post-Essai" },
                                        { id: "actif", label: "Actif" },
                                        { id: "occasionnel", label: "Occasionnel" },
                                        { id: "distant", label: "Distant" },
                                        { id: "inactif", label: "Inactif" },
                                        { id: "archive", label: "Archivé" },
                                    ]}
                                    selected={segmentFilter}
                                    onChange={setSegmentFilter}
                                    placeholder="Tous les statuts"
                                />
                            </div>
                            <div className="flex-none">
                                <label className="block text-xs font-medium text-transparent mb-1">Export</label>
                                <button
                                    onClick={handleExport}
                                    disabled={users.length === 0}
                                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm text-sm"
                                >
                                    📥 Export Excel
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="p-12 text-center text-slate-400">
                                <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
                                <p>Chargement...</p>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">
                                <p className="text-sm">Aucun utilisateur trouvé</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-100 border-b border-slate-200">
                                            <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">nom</th>
                                            <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">email</th>
                                            <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">téléphone</th>
                                            <th className="py-3 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-widest">ville</th>
                                            <th className="py-3 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">profil</th>
                                            <th className="py-3 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">statut(s)</th>
                                            <th className="py-3 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-widest">créé le</th>
                                            <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {users.map((user) => (
                                            <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="py-2.5 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-medium text-slate-900">
                                                            {user.first_name} {user.last_name}
                                                            {user.created_by_admin && <span title="Créé par le manager" className="ml-1 text-amber-500">🛡️</span>}
                                                        </div>
                                                        {user.is_blacklisted && (
                                                            <span title={user.blacklist_reason || "Utilisateur en Black List"} className="cursor-help text-lg">🚩</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-slate-600">{user.email}</td>
                                                <td className="py-3 px-4 text-slate-600">{user.phone || "—"}</td>
                                                <td className="py-3 px-4 text-slate-600 truncate max-w-[150px]">
                                                    {user.zip_code && `${user.zip_code} `}{user.city || "—"}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${ROLE_COLORS[user.role] || "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                                        {ROLE_LABELS[user.role] || user.role}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${SEGMENT_COLORS[user.segment || "prospect"]}`}>
                                                        {SEGMENT_LABELS[user.segment || "prospect"]}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-600 text-center">
                                                    {user.created_at
                                                        ? new Date(user.created_at).toLocaleDateString("fr-FR")
                                                        : "—"}
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-right flex items-center justify-end gap-0.5">
                                                        <button
                                                            onClick={() => openEditModal(user)}
                                                            className="p-1 hover:bg-blue-50 text-blue-500 rounded-lg transition-all hover:scale-105"
                                                            title="Modifier"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => { setDeletingUser(user); setDeleteError(null); }}
                                                            className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg transition-all hover:scale-105"
                                                            title="Supprimer"
                                                        >
                                                            🗑️
                                                        </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
                            <div className="p-6 pb-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    <h2 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                        Modifier l&apos;utilisateur
                                    </h2>
                                </div>
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-lg"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            {/* Tabs */}
                            <div className="flex gap-1 px-6 border-t border-slate-50">
                                <button
                                    onClick={() => setActiveTab("profile")}
                                    className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all relative ${
                                        activeTab === "profile"
                                            ? "border-slate-900 text-slate-900"
                                            : "border-transparent text-slate-400 hover:text-slate-600"
                                    }`}
                                >
                                    👤 Fiche Profil
                                </button>
                                <button
                                    onClick={() => setActiveTab("history")}
                                    className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all relative ${
                                        activeTab === "history"
                                            ? "border-slate-900 text-slate-900"
                                            : "border-transparent text-slate-400 hover:text-slate-600"
                                    }`}
                                >
                                    📊 Historique
                                </button>
                            </div>
                        </div>

                        {activeTab === "profile" ? (
                            <div className="p-6 space-y-6">
                                {/* Identity */}
                                <div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Prénom</label>
                                            <input
                                                type="text"
                                                value={editingUser.first_name || ""}
                                                onChange={(e) => updateEditField("first_name", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                                            <input
                                                type="text"
                                                value={editingUser.last_name || ""}
                                                onChange={(e) => updateEditField("last_name", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Contact */}
                                <div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                            <input
                                                type="email"
                                                value={editingUser.email || ""}
                                                onChange={(e) => updateEditField("email", e.target.value)}
                                                autoComplete="none"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                                            <input
                                                type="text"
                                                value={editingUser.phone || ""}
                                                onChange={(e) => updateEditField("phone", e.target.value)}
                                                autoComplete="none"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Address */}
                                <div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Rue</label>
                                            <input
                                                type="text"
                                                value={editingUser.street || ""}
                                                onChange={(e) => updateEditField("street", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Code postal</label>
                                                <input
                                                    type="text"
                                                    value={editingUser.zip_code || ""}
                                                    onChange={(e) => updateEditField("zip_code", e.target.value)}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Ville</label>
                                                <input
                                                    type="text"
                                                    value={editingUser.city || ""}
                                                    onChange={(e) => updateEditField("city", e.target.value)}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Details */}
                                <div>
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Date de naissance</label>
                                                <input
                                                    type="date"
                                                    value={editingUser.birth_date || ""}
                                                    onChange={(e) => updateEditField("birth_date", e.target.value)}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                                />
                                            </div>
                                            <div className="w-32">
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Profil</label>
                                                <select
                                                    value={editingUser.role || "user"}
                                                    onChange={(e) => updateEditField("role", e.target.value)}
                                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                                >
                                                    <option value="manager">Manager</option>
                                                    <option value="staff">Staff</option>
                                                    <option value="user">Utilisateur</option>
                                                </select>
                                            </div>
                                        </div>
                                </div>

                                {/* Mot de passe */}
                                <div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nouveau mot de passe</label>
                                        <div className="relative">
                                            <input
                                                type={showEditPassword ? "text" : "password"}
                                                value={editPassword}
                                                onChange={(e) => setEditPassword(e.target.value)}
                                                placeholder="Laisser vide pour ne pas modifier"
                                                autoComplete="new-password"
                                                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowEditPassword(!showEditPassword)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                                            >
                                                {showEditPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">Min. 8 caractères. Laisser vide pour conserver le mot de passe actuel.</p>
                                    </div>
                                </div>

                                {/* Social */}
                                <div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Instagram</label>
                                            <input
                                                type="text"
                                                placeholder="@pseudo"
                                                value={editingUser.instagram_handle || ""}
                                                onChange={(e) => updateEditField("instagram_handle", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Facebook</label>
                                            <input
                                                type="text"
                                                placeholder="Lien ou pseudo"
                                                value={editingUser.facebook_handle || ""}
                                                onChange={(e) => updateEditField("facebook_handle", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                
                                {/* Statut & Archivage */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Statut comportemental (Override)</label>
                                            <select
                                                value={editingUser.status_override || ""}
                                                onChange={(e) => updateEditField("status_override", e.target.value || null)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                            >
                                                <option value="">Calculé automatiquement (par défaut)</option>
                                                <option value="prospect">Prospect</option>
                                                <option value="decouverte_1">Découverte 1</option>
                                                <option value="decouverte_2">Découverte 2</option>
                                                <option value="post_essai">Post-Essai</option>
                                                <option value="actif">Actif</option>
                                                <option value="occasionnel">Occasionnel</option>
                                                <option value="distant">Distant</option>
                                                <option value="inactif">Inactif</option>
                                                <option value="archive">Archivé</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col justify-end">
                                            <label className="flex items-center gap-2 cursor-pointer pb-2">
                                                <input
                                                    type="checkbox"
                                                    id="is_archived"
                                                    checked={editingUser.is_archived || false}
                                                    onChange={(e) => updateEditField("is_archived", e.target.checked)}
                                                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                                />
                                                <span className="text-sm font-medium text-slate-700">Archiver manuellement</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                {/* Black List */}
                                <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                id="is_blacklisted"
                                                checked={editingUser.is_blacklisted || false}
                                                onChange={(e) => updateEditField("is_blacklisted", e.target.checked)}
                                                className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                                            />
                                            <label htmlFor="is_blacklisted" className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                                Mettre cet utilisateur en Black List
                                                {editingUser.is_blacklisted && <span className="text-base leading-none">🚩</span>}
                                            </label>
                                        </div>
                                        {editingUser.is_blacklisted && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Motif de la mise en Black List</label>
                                                <textarea
                                                    value={editingUser.blacklist_reason || ""}
                                                    onChange={(e) => updateEditField("blacklist_reason", e.target.value)}
                                                    placeholder="Expliquez pourquoi cet utilisateur est en Black List..."
                                                    rows={2}
                                                    className="w-full px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 text-sm"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Status message */}
                                {saveMessage && (
                                    <div className={`p-3 rounded-lg text-sm font-medium ${saveMessage.includes("succès")
                                        ? "bg-green-50 text-green-700"
                                        : "bg-red-50 text-red-700"
                                        }`}>
                                        {saveMessage}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-6 space-y-6">
                                {loadingHistory ? (
                                    <div className="py-12 text-center text-slate-400">
                                        <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full mb-4"></div>
                                        <p className="text-sm">Chargement de l&apos;historique...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        {/* Commandes Section */}
                                        <div>
                                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                🛒 COMMANDES
                                            </h3>
                                            {userOrders.length === 0 ? (
                                                <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4 border border-slate-100">Aucune commande enregistrée.</p>
                                            ) : (
                                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                                    <div className="overflow-y-auto" style={{maxHeight: "165px"}}>
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                                                <tr>
                                                                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                                                                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Offre</th>
                                                                    <th className="py-2 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Paiement</th>
                                                                    <th className="py-2 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Statut</th>
                                                                    <th className="py-2 px-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Solde</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {userOrders.map((order) => {
                                                                    const paymentColors: Record<string, string> = {
                                                                        a_valider: "bg-yellow-50 text-yellow-800 border-yellow-100",
                                                                        en_attente: "bg-orange-50 text-orange-800 border-orange-100",
                                                                        paye: "bg-green-50 text-green-800 border-green-100",
                                                                        rembourse: "bg-gray-50 text-gray-600 border-gray-100",
                                                                        echelonne: "bg-blue-50 text-blue-800 border-blue-100",
                                                                        a_regulariser: "bg-red-50 text-red-800 border-red-100",
                                                                    };
                                                                    const paymentLabels: Record<string, string> = {
                                                                        a_valider: "À valider",
                                                                        en_attente: "En attente",
                                                                        paye: "Payé",
                                                                        rembourse: "Remboursé",
                                                                        echelonne: "Échelonné",
                                                                        a_regulariser: "À régulariser",
                                                                    };
                                                                    const statusColors: Record<string, string> = {
                                                                        active: "bg-emerald-50 text-emerald-600 border-emerald-100",
                                                                        termine: "bg-slate-100 text-slate-600 border-slate-200",
                                                                        expiree: "bg-orange-50 text-orange-600 border-orange-100",
                                                                        en_pause: "bg-amber-50 text-amber-600 border-amber-100",
                                                                        resiliee: "bg-red-50 text-red-500 border-red-100",
                                                                    };
                                                                    const statusLabels: Record<string, string> = {
                                                                        active: "Active",
                                                                        termine: "Terminée",
                                                                        expiree: "Expirée",
                                                                        en_pause: "En pause",
                                                                        resiliee: "Résiliée",
                                                                    };
                                                                    const isBlocked = order.is_blocked === true || (order.is_blocked === null && order.status === "expiree");

                                                                    return (
                                                                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                                                            <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                                                                {new Date(order.created_at).toLocaleDateString("fr-FR")}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 font-medium text-slate-900">
                                                                                {order.offer_name}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${paymentColors[order.payment_status] || "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                                                                    {paymentLabels[order.payment_status] || order.payment_status}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${statusColors[order.status] || "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                                                                    {statusLabels[order.status] || order.status}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                                                                                {isBlocked ? (
                                                                                    <span className="text-slate-400 inline-flex items-center gap-1">
                                                                                        0 🔒
                                                                                    </span>
                                                                                ) : order.is_unlimited ? (
                                                                                    <span className="text-emerald-600">Illimité</span>
                                                                                ) : (
                                                                                    <span>{order.balance ?? 0}/{order.credits_total ?? 0}</span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Séances Section */}
                                        <div>
                                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                🗓️ INSCRIPTIONS
                                            </h3>
                                            {userBookings.length === 0 ? (
                                                <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4 border border-slate-100">Aucune réservation de séance.</p>
                                            ) : (
                                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                                    <div className="overflow-y-auto" style={{maxHeight: "460px"}}>
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                                            <tr>
                                                                <th className="py-2 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                                                                <th className="py-2 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Séance</th>
                                                                <th className="py-2 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Statut</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {userBookings.map((booking) => {
                                                                const statusColors: Record<string, string> = {
                                                                    confirmed: "bg-emerald-50 text-emerald-600 border border-emerald-100",
                                                                    pending: "bg-amber-50 text-amber-600 border border-amber-100",
                                                                    cancelled: "bg-slate-50 text-slate-500 border border-slate-200",
                                                                    absent: "bg-rose-50 text-rose-600 border border-rose-100",
                                                                };
                                                                const statusLabels: Record<string, string> = {
                                                                    confirmed: "Inscrit",
                                                                    pending: "Sur liste",
                                                                    cancelled: "Annulé",
                                                                    absent: "Absent",
                                                                };
                                                                return (
                                                                    <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                                                                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                                                            {new Date(booking.session_date).toLocaleDateString("fr-FR")} à {booking.session_time}
                                                                        </td>
                                                                        <td className="py-2.5 px-4 font-medium text-slate-900">
                                                                            {booking.session_title}
                                                                        </td>
                                                                        <td className="py-2.5 px-4 text-center">
                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${statusColors[booking.status] || "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                                                                {statusLabels[booking.status] || booking.status}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Évènements Section */}
                                        <div>
                                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                🎉 EVENEMENTS
                                            </h3>
                                            {userRegistrations.length === 0 ? (
                                                <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4 border border-slate-100">Aucune inscription aux évènements.</p>
                                            ) : (
                                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                    <div className="overflow-y-auto" style={{maxHeight: "250px"}}>
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                                                <tr>
                                                                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                                                                    <th className="py-2 px-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Évènement</th>
                                                                    <th className="py-2 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Paiement</th>
                                                                    <th className="py-2 px-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Statut</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {userRegistrations.map((reg) => {
                                                                    const paymentColors: Record<string, string> = {
                                                                        a_valider: "bg-yellow-50 text-yellow-800 border-yellow-100",
                                                                        en_attente: "bg-orange-50 text-orange-800 border-orange-100",
                                                                        paye: "bg-green-50 text-green-800 border-green-100",
                                                                        rembourse: "bg-gray-50 text-gray-600 border-gray-100",
                                                                    };
                                                                    const paymentLabels: Record<string, string> = {
                                                                        a_valider: "À valider",
                                                                        en_attente: "En attente",
                                                                        paye: "Payé",
                                                                        rembourse: "Remboursé",
                                                                    };
                                                                    const statusColors: Record<string, string> = {
                                                                        confirmed: "bg-emerald-50 text-emerald-600 border border-emerald-100",
                                                                        waiting_list: "bg-amber-50 text-amber-600 border-amber-100",
                                                                        cancelled: "bg-rose-50 text-rose-600 border-rose-100",
                                                                        absent: "bg-slate-50 text-slate-600 border border-slate-200",
                                                                    };
                                                                    const statusLabels: Record<string, string> = {
                                                                        confirmed: "Inscrit",
                                                                        waiting_list: "Sur liste",
                                                                        cancelled: "Annulé",
                                                                        absent: "Absent",
                                                                    };
                                                                    return (
                                                                        <tr key={reg.id} className="hover:bg-slate-50 transition-colors">
                                                                            <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                                                                {new Date(reg.event_date).toLocaleDateString("fr-FR")} à {reg.event_time}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 font-medium text-slate-900">
                                                                                {reg.event_title}
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${paymentColors[reg.payment_status] || "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                                                                    {paymentLabels[reg.payment_status] || reg.payment_status}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-2.5 px-4 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal border ${statusColors[reg.status] || "bg-gray-50 text-gray-600 border-gray-100"}`}>
                                                                                    {statusLabels[reg.status] || reg.status}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-6 bg-white border-t border-slate-100 flex justify-end gap-3 items-center sticky bottom-0 z-10">
                            {activeTab === "profile" ? (
                                <>
                                    <button
                                        onClick={() => setEditingUser(null)}
                                        className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 transition-all text-sm shadow-sm active:scale-95"
                                    >
                                        {saving ? "Enregistrement..." : "Enregistrer les modifications"}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all text-sm shadow-sm active:scale-95"
                                >
                                    Fermer
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={!!deletingUser}
                title="Confirmer la suppression"
                message={
                    <>
                        Attention : cette action est irréversible. L&apos;utilisateur{" "}
                        <strong className="font-semibold text-slate-900">
                            {deletingUser?.first_name} {deletingUser?.last_name}
                        </strong>{" "}
                        sera définitivement supprimé.
                    </>
                }
                type="danger"
                confirmLabel="Confirmer la suppression"
                cancelLabel="Annuler"
                onConfirm={handleDelete}
                onCancel={() => {
                    setDeletingUser(null);
                    setDeleteError(null);
                }}
                error={deleteError}
                saving={deleting}
            />

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <h2 className="text-[17px] font-semibold text-slate-900 tracking-tight">
                                    Créer un utilisateur
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-lg"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Identity */}
                            <div>
                                <h3 className="text-[10px] font-medium text-slate-400 lowercase tracking-widest mb-3">identité</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Prénom *</label>
                                        <input type="text" value={newUser.first_name}
                                            onChange={(e) => updateNewUserField("first_name", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                                        <input type="text" value={newUser.last_name}
                                            onChange={(e) => updateNewUserField("last_name", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    </div>
                                </div>
                            </div>

                            {/* Contact & Auth */}
                            <div>
                                <h3 className="text-[10px] font-medium text-slate-400 lowercase tracking-widest mb-3">accès & sécurité</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                                        <input type="email" value={newUser.email}
                                            onChange={(e) => updateNewUserField("email", e.target.value)}
                                            autoComplete="none"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe *</label>
                                        <div className="relative">
                                            <input type={showPassword ? "text" : "password"} value={newUser.password}
                                                onChange={(e) => updateNewUserField("password", e.target.value)}
                                                placeholder="Min. 8 caractères"
                                                autoComplete="new-password"
                                                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                                            >
                                                {showPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                                            <input type="text" value={newUser.phone}
                                                onChange={(e) => updateNewUserField("phone", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                        </div>
                                        <div className="w-32">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Profil</label>
                                            <select value={newUser.role}
                                                onChange={(e) => updateNewUserField("role", e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                                                <option value="manager">Manager</option>
                                                <option value="staff">Staff</option>
                                                <option value="user">Utilisateur</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Adresse</h3>
                                <div className="space-y-3">
                                    <input type="text" placeholder="Rue" value={newUser.street}
                                        onChange={(e) => updateNewUserField("street", e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <input type="text" placeholder="Code postal" value={newUser.zip_code}
                                            onChange={(e) => updateNewUserField("zip_code", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                        <input type="text" placeholder="Ville" value={newUser.city}
                                            onChange={(e) => updateNewUserField("city", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    </div>
                                </div>
                            </div>

                            {/* Details */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Détails</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Date de naissance</label>
                                        <input type="date" value={newUser.birth_date}
                                            onChange={(e) => updateNewUserField("birth_date", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    </div>
                                </div>
                            </div>

                            {/* Social */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Réseaux sociaux</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="text" placeholder="@instagram" value={newUser.instagram_handle}
                                        onChange={(e) => updateNewUserField("instagram_handle", e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    <input type="text" placeholder="Facebook" value={newUser.facebook_handle}
                                        onChange={(e) => updateNewUserField("facebook_handle", e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                </div>
                            </div>

                            {/* Contrôle de statut supprimé pour simplicité */}

                            {/* Status message */}
                            {createMessage && (
                                <div className={`p-3 rounded-lg text-sm font-medium ${createMessage.includes("succès")
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-700"
                                    }`}>
                                    {createMessage}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-white border-t border-slate-100 flex justify-end gap-3 items-center sticky bottom-0 z-10">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 transition-all text-sm shadow-sm active:scale-95"
                            >
                                {creating ? "Création..." : "Créer l'utilisateur"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminUsersPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center bg-gray-50 min-h-screen">Chargement...</div>}>
            <AdminUsersPageContent />
        </Suspense>
    );
}
