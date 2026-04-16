"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, User } from "@/lib/api";

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

export default function AdminUsersPage() {
    const router = useRouter();
    const params = useParams();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [totalCount, setTotalCount] = useState(0);

    // Edit modal state
    const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

    // Delete confirmation
    const [deletingUser, setDeletingUser] = useState<User | null>(null);

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
            if (roleFilter) params.role = roleFilter;
            if (statusFilter !== "") params.is_active = statusFilter === "true";

            const [data, countData] = await Promise.all([
                api.getAdminUsers(params),
                api.getAdminUsersCount(params),
            ]);
            setUsers(data);
            setTotalCount(countData.count);
        } catch {
            setUsers([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, statusFilter]);

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
            "Profil", "Statut", "Black List", "Motif", "Date de création",
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
            u.is_active ? "Actif" : "Inactif",
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
            // Remove fields we don't want to send
            const cleanData: Record<string, any> = {};
            const editableFields = [
                "first_name", "last_name", "email", "phone",
                "street", "zip_code", "city", "birth_date",
                "instagram_handle", "facebook_handle", "role", "is_active",
                "is_active_override", "is_blacklisted", "blacklist_reason",
            ];
            for (const field of editableFields) {
                if ((data as any)[field] !== undefined) {
                    cleanData[field] = (data as any)[field];
                }
            }
            // Include password only if provided
            if (editPassword.trim()) {
                cleanData.password = editPassword;
            }
            await api.updateAdminUser(id, cleanData);
            setSaveMessage("Utilisateur mis à jour avec succès");
            await fetchUsers();
            setTimeout(() => {
                setEditingUser(null);
                setEditPassword("");
                setShowEditPassword(false);
                setSaveMessage("");
            }, 1000);
        } catch {
            setSaveMessage("Erreur lors de la mise à jour");
        } finally {
            setSaving(false);
        }
    };

    // Delete user
    const handleDelete = async () => {
        if (!deletingUser) return;
        try {
            await api.deleteAdminUser(deletingUser.id);
            setDeletingUser(null);
            await fetchUsers();
        } catch {
            alert("Erreur lors de la suppression");
        }
    };

    // Create user
    const handleCreate = async () => {
        if (!newUser.first_name || !newUser.last_name || !newUser.email || !newUser.password) {
            setCreateMessage("Veuillez remplir les champs obligatoires (prénom, nom, email, mot de passe)");
            return;
        }
        setCreating(true);
        setCreateMessage("");
        try {
            const dataToSend: Record<string, any> = { ...newUser };
            // Remove empty optional fields
            Object.keys(dataToSend).forEach((key) => {
                if (dataToSend[key] === "") delete dataToSend[key];
            });
            // Keep required fields
            dataToSend.first_name = newUser.first_name;
            dataToSend.last_name = newUser.last_name;
            dataToSend.email = newUser.email;
            dataToSend.password = newUser.password;
            dataToSend.role = newUser.role;

            await api.createAdminUser(dataToSend as any);
            setCreateMessage("Utilisateur créé avec succès");
            await fetchUsers();
            setTimeout(() => {
                setShowCreateModal(false);
                setCreateMessage("");
                setNewUser({
                    first_name: "", last_name: "", email: "", password: "",
                    role: "user", phone: "", street: "", zip_code: "",
                    city: "", birth_date: "", instagram_handle: "", facebook_handle: "",
                    is_active_override: false,
                });
            }, 1000);
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
        setEditPassword("");
        setShowEditPassword(false);
        setSaveMessage("");
    };

    const updateEditField = (field: string, value: any) => {
        if (!editingUser) return;
        setEditingUser({ ...editingUser, [field]: value });
    };

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar user={currentUser} />
            <main className="flex-1 p-8 overflow-auto">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">👥 utilisateurs</h1>
                            <p className="text-[11px] font-medium text-slate-400 lowercase mt-1">
                                {totalCount} utilisateur{totalCount > 1 ? "s" : ""} au total
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { setShowCreateModal(true); setCreateMessage(""); }}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-[11px] lowercase tracking-tight shadow-md shadow-slate-200"
                            >
                                ➕ nouveau
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={users.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-[11px] lowercase tracking-tight"
                            >
                                📥 exporter excel
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex-1 min-w-[200px]">
                                <input
                                    type="text"
                                    placeholder="🔍 Rechercher par nom, prénom ou email..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    autoComplete="off"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                                <option value="">Tous les profils</option>
                                <option value="manager">Manager</option>
                                <option value="staff">Staff</option>
                                <option value="user">Utilisateur</option>
                            </select>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                                <option value="">Tous les statuts</option>
                                <option value="true">Actifs</option>
                                <option value="false">Inactifs</option>
                            </select>
                            <select
                                value={editingUser?.is_blacklisted?.toString() || ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setUsers(users.filter(u => val === "" || u.is_blacklisted === (val === "true")));
                                }}
                                className="hidden" // Placeholder for actual filter logic if needed
                            >
                            </select>
                            {/* We don't have a backend filter for blacklist yet, skipping for now or adding local filter if simple */}
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
                            <div className="p-12 text-center text-slate-400">
                                <p className="text-lg">Aucun utilisateur trouvé</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">nom</th>
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">email</th>
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">téléphone</th>
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">ville</th>
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">profil</th>
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">statut</th>
                                            <th className="text-left py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">créé le</th>
                                            <th className="text-right py-3 px-4 font-medium text-slate-400 lowercase tracking-widest text-[10px]">actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {users.map((user) => (
                                            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-4">
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
                                                <td className="py-3 px-4 text-slate-600">{user.city || "—"}</td>
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-800"}`}>
                                                        {ROLE_LABELS[user.role] || user.role}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active
                                                        ? "bg-green-100 text-green-800"
                                                        : "bg-red-100 text-red-800"
                                                        }`}>
                                                        {user.is_active ? "Actif" : "Inactif"}
                                                        {user.is_active_override && <span className="ml-1" title="Statut forcé par admin">🛡️</span>}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-slate-600">
                                                    {user.created_at
                                                        ? new Date(user.created_at).toLocaleDateString("fr-FR")
                                                        : "—"}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditModal(user)}
                                                            className="text-blue-600 hover:text-blue-800 font-medium"
                                                            title="Modifier"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => setDeletingUser(user)}
                                                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
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
                        <div className="p-6 border-b border-slate-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                                    modifier l&apos;utilisateur
                                </h2>
                                <button
                                    onClick={() => setEditingUser(null)}
                                    className="text-slate-400 hover:text-slate-600 text-2xl"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Identity */}
                            <div>
                                <h3 className="text-[10px] font-medium text-slate-400 lowercase tracking-widest mb-3">
                                    identité
                                </h3>
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
                                <h3 className="text-[10px] font-medium text-slate-400 lowercase tracking-widest mb-3">
                                    contact
                                </h3>
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
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                    Adresse
                                </h3>
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
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                    Détails
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Date de naissance</label>
                                        <input
                                            type="date"
                                            value={editingUser.birth_date || ""}
                                            onChange={(e) => updateEditField("birth_date", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                        />
                                    </div>
                                    <div>
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
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                    Mot de passe
                                </h3>
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
                                            {showEditPassword ? "🔒" : "👁️"}
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Min. 8 caractères. Laisser vide pour conserver le mot de passe actuel.</p>
                                </div>
                            </div>

                            {/* Social */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                    Réseaux sociaux
                                </h3>
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
                            
                            {/* Status Override */}
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    🛡️ Contrôle du Statut
                                </h3>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="edit_is_active_override"
                                        checked={editingUser.is_active_override || false}
                                        onChange={(e) => updateEditField("is_active_override", e.target.checked)}
                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                    />
                                    <label htmlFor="edit_is_active_override" className="text-sm font-medium text-slate-700">
                                        Forcer le statut actif (pour les comptes sans commande)
                                    </label>
                                </div>
                            </div>
                            
                            {/* Black List */}
                            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    🚩 Black List
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="is_blacklisted"
                                            checked={editingUser.is_blacklisted || false}
                                            onChange={(e) => updateEditField("is_blacklisted", e.target.checked)}
                                            className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                                        />
                                        <label htmlFor="is_blacklisted" className="text-sm font-medium text-slate-700">
                                            Mettre cet utilisateur en Black List
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

                        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {saving ? "Enregistrement..." : "Enregistrer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingUser && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">
                            Confirmer la suppression
                        </h2>
                        <p className="text-slate-600 mb-6">
                            Êtes-vous sûr de vouloir supprimer{" "}
                            <strong>{deletingUser.first_name} {deletingUser.last_name}</strong> ?
                            Cette action est irréversible.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeletingUser(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Créer un utilisateur
                                </h2>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="text-slate-400 hover:text-slate-600 text-2xl"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Identity */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Identité</h3>
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
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Contact & Accès</h3>
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
                                                {showPassword ? "🔒" : "👁️"}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                                        <input type="text" value={newUser.phone}
                                            onChange={(e) => updateNewUserField("phone", e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                                    </div>
                                    <div>
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

                            {/* Status Override Create */}
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    🛡️ Contrôle du Statut
                                </h3>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="create_is_active_override"
                                        checked={newUser.is_active_override}
                                        onChange={(e) => updateNewUserField("is_active_override", e.target.checked)}
                                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                    />
                                    <label htmlFor="create_is_active_override" className="text-sm font-medium text-slate-700">
                                        Forcer le statut actif (Manager / Staff / Utilisateur spécial)
                                    </label>
                                </div>
                            </div>

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

                        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={creating}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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
