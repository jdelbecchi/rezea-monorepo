"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { api, User, EmailTemplate } from "@/lib/api";
import dynamic from "next/dynamic";

// Import CSS for ReactQuill
import "react-quill/dist/quill.snow.css";

// Dynamic import of ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill"), { 
    ssr: false,
    loading: () => <div className="h-64 bg-slate-50 border border-slate-200 rounded-xl animate-pulse flex items-center justify-center text-slate-400">Chargement de l'éditeur...</div>
});

const marketingCampaignTips: Record<string, { segmentLabel: string; tips: string[] }> = {
    convert_prospects: {
        segmentLabel: "Prospects (Comptes créés sans offre ni commande)",
        tips: [
            "Offrez une réduction temporaire (ex: -10%) ou proposez un premier cours d'essai à tarif préférentiel.",
            "Proposez une visite personnalisée de votre établissement ou une séance d'accueil pour lever les freins.",
            "Créez un sentiment d'urgence en limitant la validité du code de bienvenue (ex: valable 7 jours)."
        ]
    },
    fid_discovery: {
        segmentLabel: "Nouveaux venus (Une seule commande effectuée)",
        tips: [
            "Envoyez une enquête de satisfaction rapide pour recueillir leur ressenti sur leur première séance.",
            "Suggerez-leur une formule de découverte ou une carte de 5/10 séances pour pérenniser leur pratique.",
            "Mettez en avant vos services d'accompagnement ou des activités complémentaires pour créer une habitude."
        ]
    },
    reactivate_distant: {
        segmentLabel: "Membres distants (Offre en cours mais absents depuis 21 jours)",
        tips: [
            "Prenez simplement des nouvelles avec bienveillance pour savoir s'ils rencontrent des difficultés.",
            "Rappelez-leur que la régularité est la clé de leur progression et proposez un accompagnement sur-mesure.",
            "Suggerez un changement de créneau ou une formule plus souple si leur emploi du temps a changé."
        ]
    },
    reward_actives: {
        segmentLabel: "Membres actifs (Fidèles et réguliers)",
        tips: [
            "Offrez un privilège exclusif (ex: invitation gratuite pour un proche, accès prioritaire aux nouveaux cours).",
            "Mettez en place un programme de parrainage pour les inciter à faire découvrir votre club à leurs proches.",
            "Invitez-les à partager leur avis positif sur vos réseaux sociaux ou fiche Google pour accroître votre visibilité."
        ]
    },
    engage_visitors: {
        segmentLabel: "Visiteurs ponctuels (Passages sporadiques)",
        tips: [
            "Démontrez l'intérêt financier de passer à une formule mensuelle ou une carte de 10/20 séances.",
            "Proposez des offres groupées ou des ateliers thématiques le week-end adaptés aux pratiquants flexibles.",
            "Valorisez l'appartenance à la communauté du club pour les inciter à s'investir plus régulièrement."
        ]
    },
    winback_inactives: {
        segmentLabel: "Anciens membres (Inactifs depuis plus de 60 jours)",
        tips: [
            "Proposez une offre irrésistible de réengagement (ex: séance offerte, pas de frais d'inscription).",
            "Présentez vos nouveautés : nouveaux professeurs, équipements ou activités ajoutés récemment.",
            "Rassurez-les sur la reprise en douceur de leur routine sportive ou bien-être, sans pression."
        ]
    }
};

function AdminEmailsContent() {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [tenant, setTenant] = useState<any | null>(null);
    const [activeTab, setActiveTab] = useState<"newsletter" | "operational" | "marketing" | "surveys">("newsletter");
    
    // Destinataires & Segments
    const [recipientType, setRecipientType] = useState<"all" | "selected" | "segment">("all");
    const [selectedSegment, setSelectedSegment] = useState<string>("");
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [selectedTargets, setSelectedTargets] = useState<string[]>(["all"]);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [segmentStats, setSegmentStats] = useState<{
        explorateur: number;
        decouverte: number;
        regulier: number;
        endormi: number;
        flexible: number;
        ancien: number;
    } | null>(null);
    
    // Editor State
    const [subject, setSubject] = useState("");
    const [content, setContent] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showUserSelector, setShowUserSelector] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Switch Urgence Opérationnelle
    const [forceOperational, setForceOperational] = useState(false);

    // Newsletter sections states
    interface NewsletterSection {
        id: string;
        title: string;
        titleBgColor: string;
        imageUrl: string;
        imageSize?: "small" | "medium" | "large";
        content: string;
    }
    const [newsletterSections, setNewsletterSections] = useState<NewsletterSection[]>([
        { id: "1", title: "", titleBgColor: "#7c3aed", imageUrl: "", imageSize: "large", content: "" }
    ]);
    const [uploadingSectionId, setUploadingSectionId] = useState<string | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewDeviceMode, setPreviewDeviceMode] = useState<"desktop" | "mobile">("desktop");

    // Templates state
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Enquêtes (Surveys) State
    const [surveys, setSurveys] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [sessions, setSessions] = useState<any[]>([]);
    const [selectedSurveyDetails, setSelectedSurveyDetails] = useState<any | null>(null);
    const [showSurveyDetailsModal, setShowSurveyDetailsModal] = useState(false);
    const [surveyToDelete, setSurveyToDelete] = useState<any | null>(null);
    const [isDeletingSurvey, setIsDeletingSurvey] = useState(false);
    
    // Form Enquêtes
    const [surveyTitle, setSurveyTitle] = useState("");
    const [surveyDescription, setSurveyDescription] = useState("");
    const [surveyType, setSurveyType] = useState<"general" | "event">("general");
    const [surveyTargetType, setSurveyTargetType] = useState<"event" | "session">("event");
    const [surveyTargetSegment, setSurveyTargetSegment] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [surveyEventId, setSurveyEventId] = useState("");
    const [surveySessionId, setSurveySessionId] = useState("");
    const [isCreatingSurvey, setIsCreatingSurvey] = useState(false);
    const [isSendingSurvey, setIsSendingSurvey] = useState<string | null>(null);

    // Marketing State
    const [selectedMarketingCard, setSelectedMarketingCard] = useState<any | null>(null);
    const [selectedMarketingUserIds, setSelectedMarketingUserIds] = useState<string[]>([]);
    const [marketingSubject, setMarketingSubject] = useState("");
    const [marketingContent, setMarketingContent] = useState("");
    const [isSendingMarketing, setIsSendingMarketing] = useState(false);
    const [showTips, setShowTips] = useState(false);
    const [marketingColor, setMarketingColor] = useState("");
    const [marketingImageUrl, setMarketingImageUrl] = useState("");
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const marketingCards = useMemo(() => [
        {
            id: "convert_prospects",
            title: "Convertir vos prospects",
            description: "Cible les personnes qui ont créé un compte mais n'ont pas encore passé de commande.",
            segment: "explorateur",
            icon: "✨",
            defaultSubject: "Bienvenue chez {establishment} ! Bénéficiez de -10% sur votre première séance",
            defaultContent: `<p>Bonjour {first_name},</p><p>Votre compte a été créé avec succès, mais vous n'avez pas encore planifié votre première activité.</p><p>Pour vous souhaiter la bienvenue, voici un code promo exclusif de 10% sur votre première réservation : <b>BIENVENUE10</b></p><p>À très bientôt dans notre studio !</p>`
        },
        {
            id: "fid_discovery",
            title: "Fidéliser les nouveaux venus",
            description: "Cible les personnes avec une seule commande passée et aucune réservation future programmée.",
            segment: "decouverte",
            icon: "⭐",
            defaultSubject: "Comment s'est passée votre première séance ?",
            defaultContent: `<p>Bonjour {first_name},</p><p>Vous avez récemment effectué votre première séance chez nous et nous espérons que vous avez adoré l'expérience !</p><p>Pour continuer sur votre lancée, découvrez nos offres et formules régulières.</p><p>À bientôt !</p>`
        },
        {
            id: "reactivate_distant",
            title: "Réactiver vos membres distants",
            description: "Cible les personnes avec une offre en cours mais absentes depuis plus de 21 jours.",
            segment: "endormi",
            icon: "🚀",
            defaultSubject: "Nous pensons à vous !",
            defaultContent: `<p>Bonjour {first_name},</p><p>Nous avons remarqué que nous ne vous avions pas vu au studio ces derniers temps. Nous espérons que tout va bien de votre côté !</p><p>N'hésitez pas à nous faire un petit signe si vous avez besoin d'adapter vos séances...</p><p>À très bientôt,</p><p>L'équipe</p>`
        },
        {
            id: "reward_actives",
            title: "Remercier vos membres actifs",
            description: "Cible les personnes les plus fidèles avec une offre active et des réservations régulières.",
            segment: "regulier",
            icon: "💖",
            defaultSubject: "Merci pour votre fidélité ! Un petit cadeau pour vous 🎁",
            defaultContent: `<p>Bonjour {first_name},</p><p>Nous tenions tout particulièrement à vous remercier pour votre fidélité et votre énergie positive au studio ! C'est un réel plaisir de vous accompagner dans vos séances.</p><p>Pour vous remercier, voici un code cadeau offrant une invitation gratuite pour le proche de votre choix lors de votre prochain cours : <b>MERCIAMIS</b></p><p>À très bientôt sur les tapis !</p>`
        },
        {
            id: "engage_visitors",
            title: "Engager vos visiteurs ponctuels",
            description: "Cible les personnes de passage qui viennent ponctuellement sans offre régulière.",
            segment: "flexible",
            icon: "⚡",
            defaultSubject: "Passez à la vitesse supérieure chez {establishment}",
            defaultContent: `<p>Bonjour {first_name},</p><p>Vous venez nous voir de temps en temps et nous adorons votre présence ponctuelle au studio !</p><p>Saviez-vous que vous pourriez économiser sur vos séances en optant pour l'une de nos formules régulières ou cartes multi-séances ? Découvrez nos offres adaptées à votre rythme de vie.</p><p>À bientôt pour votre prochaine séance !</p>`
        },
        {
            id: "winback_inactives",
            title: "Reconquérir vos anciens membres",
            description: "Cible les personnes inactives qui n'ont pas passé de commande depuis plus de 60 jours.",
            segment: "ancien",
            icon: "👋",
            defaultSubject: "Vous nous manquez... Venez tester nos nouveautés !",
            defaultContent: `<p>Bonjour {first_name},</p><p>Cela fait plus de deux mois que nous ne vous avons pas vu au studio, et vous nous manquez beaucoup !</p><p>De nouveaux créneaux et de nouvelles activités viennent d'ouvrir. Pour vous encourager à revenir, nous serions ravis de vous offrir une séance d'essai gratuite avec le code : <b>RETOUR2026</b></p><p>À très vite,</p><p>L'équipe</p>`
        }
    ], []);

    const handleSelectMarketingCard = (card: any) => {
        setSelectedMarketingCard(card);
        const segmentUsers = allUsers.filter(u => u.segment === card.segment);
        setSelectedMarketingUserIds(segmentUsers.map(u => u.id));
        
        // Dynamically replace establishment/tenant name
        const estName = tenant?.name || "votre établissement";
        const subject = card.defaultSubject.replace(/{establishment}/g, estName).replace(/Rezea/g, estName).replace(/rezea/g, estName);
        const content = card.defaultContent.replace(/{establishment}/g, estName).replace(/Rezea/g, estName).replace(/rezea/g, estName);
        
        setMarketingSubject(subject);
        setMarketingContent(content);
        setMarketingColor(tenant?.primary_color || "#7c3aed");
        setMarketingImageUrl("");
    };

    const handleSendMarketing = async () => {
        if (selectedMarketingUserIds.length === 0) {
            setMessage({ type: "error", text: "Veuillez sélectionner au moins un destinataire." });
            return;
        }
        if (!marketingSubject.trim()) {
            setMessage({ type: "error", text: "Veuillez saisir un objet pour l'e-mail." });
            return;
        }
        if (!marketingContent.trim()) {
            setMessage({ type: "error", text: "Veuillez rédiger le contenu de l'e-mail." });
            return;
        }

        setIsSendingMarketing(true);
        setMessage(null);
        try {
            const result = await api.sendAdminEmail({
                subject: marketingSubject,
                content: marketingContent,
                recipient_type: "selected",
                selected_user_ids: selectedMarketingUserIds,
                segment: selectedMarketingCard.segment,
                custom_color: marketingColor || undefined,
                custom_image_url: marketingImageUrl || undefined
            });
            setMessage({
                type: "success",
                text: `Campagne de marketing envoyée avec succès à ${result.count} personne(s) !`
            });
            setSelectedMarketingCard(null);
        } catch (err: any) {
            console.error(err);
            const errorMsg = err.response?.data?.detail || "Une erreur est survenue lors de l'envoi de la campagne.";
            setMessage({ type: "error", text: errorMsg });
        } finally {
            setIsSendingMarketing(false);
        }
    };

    const QuillNode = ReactQuill as any;
    const quillRef = useRef<any>(null);

    // Configurer le support du texte centré / alignements dans Quill
    useEffect(() => {
        const configureQuill = async () => {
            try {
                const { default: Quill } = await import('quill');
                const Align = Quill.import('attributors/style/align');
                Quill.register(Align, true);
            } catch (err) {
                console.warn("Quill could not be configured for inline styles", err);
            }
        };
        configureQuill();
    }, []);

    // Gestion fermeture clic extérieur pour le dropdown de ciblage
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const toggleTarget = (target: string) => {
        setSelectedTargets(prev => {
            if (target === "all") {
                return ["all"];
            }
            if (target === "selected") {
                return ["selected"];
            }
            // Si on coche un segment
            let next = prev.filter(t => t !== "all" && t !== "selected");
            if (next.includes(target)) {
                next = next.filter(t => t !== target);
            } else {
                next.push(target);
            }
            if (next.length === 0) {
                return ["all"];
            }
            return next;
        });
    };

    // Chargement initial des données
    const loadSurveys = useCallback(async () => {
        try {
            const data = await api.getSurveyCampaigns();
            setSurveys(data);
        } catch (err) {
            console.error("Failed to load satisfaction surveys", err);
        }
    }, []);

    const fetchAllData = useCallback(async () => {
        try {
            // 1. Authentification & rôle
            const userData = await api.getCurrentUser();
            if (userData.role !== "owner" && userData.role !== "manager") {
                router.push(`/${params.slug}/home`);
                return;
            }
            setUser(userData);

            // 2. Récupérer les données annexes
            const [users, templatesData, stats, eventsData, sessionsData, tenantData] = await Promise.all([
                api.getAdminUsers(),
                api.getEmailTemplates(),
                api.getSegmentsStats().catch(() => null),
                api.getAdminEvents().catch(() => []),
                api.getAdminSessions().catch(() => []),
                api.getTenantSettings().catch(() => null),
            ]);
            
            setAllUsers(users);
            setTemplates(templatesData);
            setSegmentStats(stats);
            setEvents(eventsData);
            // Filtrer pour ne garder que les séances passées jusqu'à J-15
            const filteredSessions = (sessionsData || []).filter((sess: any) => {
                const startTime = new Date(sess.start_time).getTime();
                const now = new Date().getTime();
                const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;
                return startTime < now && startTime >= fifteenDaysAgo;
            });
            setSessions(filteredSessions);
            setTenant(tenantData);
            
            // Pré-sélection des destinataires via query params
            const recipientIds = searchParams.get("recipientIds");
            if (recipientIds) {
                const ids = recipientIds.split(",");
                setSelectedUserIds(ids);
                setRecipientType("selected");
                setSelectedTargets(["selected"]);
            }
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                router.push(`/${params.slug}`);
            }
        }
    }, [searchParams, router, params.slug]);

    useEffect(() => {
        fetchAllData();
        loadSurveys();
    }, [fetchAllData, loadSurveys]);

    // Uploader une image dans Quill (compatible multi-éditeurs)
    const imageHandler = useCallback(function(this: any) {
        const quill = this.quill;
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.onchange = async () => {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                try {
                    const res = await api.uploadImage(file);
                    const range = quill.getSelection();
                    const index = range ? range.index : quill.getLength();
                    quill.insertEmbed(index, 'image', `${API_URL}${res.url}`);
                } catch (error: any) {
                    console.error("Image upload failed:", error);
                    const detail = error.response?.data?.detail || "L'upload de l'image a échoué.";
                    setMessage({ type: "error", text: detail });
                }
            }
        };
        input.click();
    }, [API_URL]);

    // Section operations
    const updateSection = (id: string, updates: Partial<NewsletterSection>) => {
        setNewsletterSections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const addSection = () => {
        setNewsletterSections(prev => [
            ...prev,
            { id: Math.random().toString(), title: "", titleBgColor: "#7c3aed", imageUrl: "", imageSize: "large", content: "" }
        ]);
    };

    const removeSection = (id: string) => {
        if (newsletterSections.length <= 1) return;
        setNewsletterSections(prev => prev.filter(s => s.id !== id));
    };

    const moveSection = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newsletterSections.length) return;
        setNewsletterSections(prev => {
            const next = [...prev];
            const [moved] = next.splice(index, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const handleSectionImageUpload = async (sectionId: string, file: File) => {
        setUploadingSectionId(sectionId);
        try {
            const res = await api.uploadImage(file);
            updateSection(sectionId, { imageUrl: `${API_URL}${res.url}` });
        } catch (err: any) {
            console.error("Image upload failed:", err);
            const detail = err.response?.data?.detail || "L'upload de l'image a échoué.";
            setMessage({ type: "error", text: detail });
        } finally {
            setUploadingSectionId(null);
        }
    };

    // HTML parsing for newsletter sections
    const parseNewsletterHtml = (html: string): NewsletterSection[] => {
        if (!html) return [{ id: "1", title: "", titleBgColor: "#7c3aed", imageUrl: "", imageSize: "large", content: "" }];
        const match = html.match(/<!--\s*NEWSLETTER_SECTIONS_JSON:\s*([\s\S]*?)\s*-->/);
        if (match) {
            try {
                const parsed = JSON.parse(match[1]);
                return parsed.map((s: any) => ({
                    id: s.id || Math.random().toString(),
                    title: s.title || "",
                    titleBgColor: s.titleBgColor || "#7c3aed",
                    imageUrl: s.imageUrl || "",
                    imageSize: s.imageSize || "large",
                    content: s.content || ""
                }));
            } catch (e) {
                console.error("Failed to parse newsletter sections JSON", e);
            }
        }
        return [{ id: Math.random().toString(), title: "", titleBgColor: "#7c3aed", imageUrl: "", imageSize: "large", content: html }];
    };

    // Compile newsletter sections to HTML
    const compileNewsletterHtml = (sections: NewsletterSection[]): string => {
        let html = "";
        sections.forEach((sec, idx) => {
            if (idx > 0) {
                // Trait de séparateur entre chaque section
                html += '<hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 24px 0;" />';
            }
            
            // Section Title color band - FULL WIDTH
            if (sec.title) {
                html += `
                <div class="full-width-title-band" style="background-color: ${sec.titleBgColor || '#7c3aed'}; padding: 6px 16px; font-family: 'Livvic', sans-serif; font-size: 15px; font-weight: 500; color: #ffffff; text-align: center; margin: 0 -24px 12px -24px; letter-spacing: 0.02em;">
                    ${sec.title}
                </div>
                `;
            }
            
            // Image (NOT full width by default, with slight rounding 6px, and adjustable size)
            if (sec.imageUrl) {
                let imgWidth = "100%";
                let imgMaxWidth = "100%";
                if (sec.imageSize === "small") {
                    imgWidth = "180";
                    imgMaxWidth = "180px";
                } else if (sec.imageSize === "medium") {
                    imgWidth = "320";
                    imgMaxWidth = "320px";
                }
                
                html += `
                <div style="text-align: center; margin-bottom: 12px;">
                    <img src="${sec.imageUrl}" alt="${sec.title || 'Image'}" class="newsletter-image" data-newsletter="true" width="${imgWidth}" style="width: ${imgWidth === "100%" ? "100%" : imgMaxWidth}; max-width: 100%; height: auto; display: inline-block; border-radius: 6px;" />
                </div>
                `;
            }
            
            // Content text (NO forced text-align center)
            if (sec.content && sec.content !== "<p><br></p>") {
                html += `<div style="font-family: 'Livvic', sans-serif; font-size: 16px; font-weight: 300; line-height: 1.6; color: #334155; margin-bottom: 12px;">${sec.content}</div>`;
            }
        });
        
        // Append logical JSON state as HTML comment
        html += `\n<!-- NEWSLETTER_SECTIONS_JSON: ${JSON.stringify(sections)} -->`;
        return html;
    };

    // Generate realistic HTML preview matching the backend compile
    const generateRealisticHtml = () => {
        let rawContent = activeTab === "newsletter" ? compileNewsletterHtml(newsletterSections) : content;
        let processed = rawContent;
        
        // 1. Tag first_name
        processed = processed.replace(/{first_name}/g, user?.first_name || "Julie");
        
        // 2. Salutation
        processed = processed.replace(
            /(Bonjour\s+[^,<\n\r]+,?)/g,
            '<strong style="font-weight: 600; color: #0f172a;">$1</strong>'
        );
        
        // 3. Promos (double-border styled box)
        processed = processed.replace(
            /<(strong|b)(?:\s+[^>]*)?>\s*([A-Z0-9_-]{4,15})\s*<\/\1>/g,
            (match, p1, code) => {
                return `
                <div align="center" style="margin: 24px auto; max-width: 180px; border: 3px double #a7825d; background-color: #fbf2eb; padding: 10px 20px; border-radius: 4px; text-align: center;">
                    <span class="email-promo" style="font-family: 'Livvic', sans-serif; font-size: 15px; font-weight: 700; color: #a7825d; letter-spacing: 0.1em;">${code}</span>
                </div>
                `;
            }
        );
        
        // 4. Standalone CTA button formatting
        processed = processed.replace(
            /<p([^>]*)>\s*<a\s+(?:[^>]*?\s+)?href="([^"]+)"[^>]*?>\s*([^<]+?)\s*<\/a>\s*<\/p>/g,
            (match, attrs, url, text) => {
                let align = "center";
                if (attrs.includes("align-left") || attrs.includes("text-align: left")) {
                    align = "left";
                } else if (attrs.includes("align-right") || attrs.includes("text-align: right")) {
                    align = "right";
                }
                return `
                <div align="${align}" style="margin: 20px 0; text-align: ${align};">
                    <a href="${url}" class="email-button" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-family: 'Livvic', sans-serif; font-size: 14px; font-weight: 500; text-decoration: none; padding: 8px 18px; border-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); text-align: center;">${text}</a>
                </div>
                `;
            }
        );
        
        // 5. Images full width
        processed = processed.replace(/<img[^>]+>/g, (imgTag) => {
            // Ne pas toucher aux images des sections de newsletter
            if (imgTag.includes('class="newsletter-image"') || imgTag.includes('data-newsletter="true"')) {
                return imgTag;
            }
            let cleanImg = imgTag;
            if (cleanImg.includes('style="')) {
                cleanImg = cleanImg.replace(/style="[^"]*"/, 'style="width: 100%; height: auto; display: block;"');
            } else {
                cleanImg = cleanImg.replace('<img', '<img style="width: 100%; height: auto; display: block;"');
            }
            return `<div class="full-width-image-wrapper" style="margin: 0 -24px 10px -24px;">${cleanImg}</div>`;
        });
        
        // Slogan/phrase d'accroche sous le logo (toujours sous le logo dans le template)
        let sloganHtml = "";
        const sloganText = tenant?.slogan;
        if (sloganText) {
            sloganHtml = `
            <div class="email-slogan" style="text-align: center; font-size: 16px; font-weight: 300; color: #0f172a; margin-top: 0px; margin-bottom: 24px; font-family: 'Livvic', sans-serif;">
                ${sloganText}
            </div>
            `;
        }
        
        // Logo
        let logoHtml = "";
        if (tenant?.logo_url) {
            logoHtml = `
            <div class="email-logo-wrapper" style="text-align: center; margin-bottom: 0px; line-height: 1.2;">
                <img src="${API_URL}${tenant.logo_url}" alt="${tenant.name}" class="email-logo" style="max-height: 140px; max-width: 100%; width: auto; display: block; margin: 0 auto; vertical-align: middle;">
            </div>
            `;
        } else {
            logoHtml = `<div style="text-align: center; margin-bottom: 0px;"><span style="font-size: 24px; font-weight: 700; color: #0f172a; font-family: 'Livvic', sans-serif; letter-spacing: -0.02em;">${tenant?.name || "Zen Yoga"}</span></div>`;
        }
        
        // Social links
        let links = [];
        if (tenant?.website_url) {
            links.push(`<a href="${tenant.website_url}" class="email-footer-link" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Notre Site</a>`);
        }
        if (tenant?.instagram_url) {
            links.push(`<a href="${tenant.instagram_url}" class="email-footer-link" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Insta</a>`);
        }
        if (tenant?.facebook_url) {
            links.push(`<a href="${tenant.facebook_url}" class="email-footer-link" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Facebook</a>`);
        }
        links.push(`<a href="#" class="email-footer-link" style="text-decoration: none; color: #64748b; font-size: 13px; margin: 0 10px; font-weight: 500;">Se désabonner</a>`);
        const socialsHtml = `<div style="margin-bottom: 15px; text-align: center;">${links.join(" ")}</div>`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Livvic:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
                body, table, td, p, a, h2, div {
                    font-family: 'Livvic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
                }
                p {
                    margin-top: 0;
                    margin-bottom: 8px;
                }
                strong, b {
                    font-weight: 600 !important;
                }
                .full-width-title-band {
                    margin-left: -24px !important;
                    margin-right: -24px !important;
                }
                @media only screen and (max-width: 480px) {
                    .email-body {
                        padding: 8px !important;
                    }
                    .email-container {
                        padding: 8px 16px 16px 16px !important;
                        border-radius: 12px !important;
                    }
                    .full-width-image-wrapper {
                        margin-left: -16px !important;
                        margin-right: -16px !important;
                        margin-bottom: 8px !important;
                    }
                    .full-width-title-band {
                        margin-left: -16px !important;
                        margin-right: -16px !important;
                    }
                    .email-logo {
                        max-height: 90px !important;
                    }
                    .email-logo-wrapper {
                        margin-bottom: 0px !important;
                    }
                    .email-slogan {
                        font-size: 14px !important;
                        margin-top: 0px !important;
                    }
                    .email-content {
                        font-size: 14px !important;
                    }
                    .email-promo {
                        font-size: 13px !important;
                    }
                    .email-button {
                        font-size: 13px !important;
                        padding: 6px 14px !important;
                    }
                    .email-footer-link {
                        font-size: 11px !important;
                        margin: 0 4px !important;
                    }
                }
            </style>
        </head>
        <body class="email-body" style="margin: 0; padding: 20px; background-color: #f8fafc;">
            <div class="email-container" style="font-family: 'Livvic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 16px 24px; border: 1px solid #e2e8f0; border-radius: 24px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                ${logoHtml}
                
                ${sloganHtml}
                
                <div class="email-content" style="color: #334155; font-size: 16px; line-height: 1.6; font-weight: 300;">
                    ${processed}
                </div>
                
                <div style="border-top: 1px solid #f1f5f9; margin-top: 15px; padding-top: 10px; text-align: center;">
                    ${socialsHtml}
                    <p style="font-family: 'Livvic', sans-serif; color: #94a3b8; font-size: 12px; font-weight: 500; margin: 0;">
                        © ${tenant?.name || "Zen Yoga"} - Propulsé par Rezea
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;
    };

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'align': [] }],
                [{ 'color': [] }, { 'background': [] }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: imageHandler
            }
        },
    }), [imageHandler]);

    // Envoi des e-mails
    const handleSend = async () => {
        setShowValidation(true);
        const finalContent = activeTab === "newsletter" ? compileNewsletterHtml(newsletterSections) : content;
        
        // Validation check
        const isNewsletterEmpty = activeTab === "newsletter" && newsletterSections.every(s => !s.title && !s.imageUrl && (!s.content || s.content === "<p><br></p>"));
        const isClassicEmpty = activeTab !== "newsletter" && (!content || content === "<p><br></p>");
        
        if (!subject || (activeTab === "newsletter" ? isNewsletterEmpty : isClassicEmpty)) {
            setMessage({ type: "error", text: "Veuillez remplir l'objet et le contenu de l'email." });
            return;
        }

        let resolvedRecipientType = "all";
        let resolvedSegment: string | undefined = undefined;
        let resolvedUserIds: string[] | undefined = undefined;

        if (selectedTargets.includes("all")) {
            resolvedRecipientType = "all";
        } else if (selectedTargets.includes("selected")) {
            resolvedRecipientType = "selected";
            resolvedUserIds = selectedUserIds;
            if (resolvedUserIds.length === 0) {
                setMessage({ type: "error", text: "Veuillez sélectionner au moins un destinataire." });
                return;
            }
        } else if (selectedTargets.length === 1) {
            resolvedRecipientType = "segment";
            resolvedSegment = selectedTargets[0];
        } else if (selectedTargets.length > 1) {
            resolvedRecipientType = "selected";
            // Filter users belonging to any of the selected segments
            const targetedUsers = allUsers.filter(u => 
                u.segment && selectedTargets.map(t => t.toLowerCase()).includes(u.segment.toLowerCase())
            );
            resolvedUserIds = targetedUsers.map(u => u.id);
            
            if (resolvedUserIds.length === 0) {
                setMessage({ type: "error", text: "Aucun utilisateur ne correspond aux statuts sélectionnés." });
                return;
            }
        } else {
            setMessage({ type: "error", text: "Veuillez sélectionner au moins un destinataire." });
            return;
        }

        setIsSending(true);
        setMessage(null);

        try {
            const result = await api.sendAdminEmail({
                subject,
                content: finalContent, 
                recipient_type: resolvedRecipientType,
                selected_user_ids: resolvedUserIds,
                segment: resolvedSegment,
                force_operational: activeTab === "operational" ? forceOperational : false
            });
            setMessage({ type: "success", text: result.message });
            setSubject("");
            setContent("");
            setNewsletterSections([{ id: "1", title: "", titleBgColor: "#7c3aed", imageUrl: "", content: "" }]);
            setSelectedTargets(["all"]);
            setForceOperational(false);
            setShowValidation(false);
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || "Une erreur est survenue lors de l'envoi de l'email.";
            setMessage({ type: "error", text: errorMsg });
        } finally {
            setIsSending(false);
        }
    };

    // Gestion des modèles
    const handleSaveTemplate = async () => {
        if (!templateName.trim()) return;
        const finalContent = activeTab === "newsletter" ? compileNewsletterHtml(newsletterSections) : content;
        
        const isNewsletterEmpty = activeTab === "newsletter" && newsletterSections.every(s => !s.title && !s.imageUrl && (!s.content || s.content === "<p><br></p>"));
        const isClassicEmpty = activeTab !== "newsletter" && (!content || content === "<p><br></p>");
        
        if (!subject || (activeTab === "newsletter" ? isNewsletterEmpty : isClassicEmpty)) {
            setMessage({ type: "error", text: "Veuillez remplir l'objet et le contenu avant d'enregistrer." });
            return;
        }

        setIsSavingTemplate(true);
        try {
            const newTemplate = await api.saveEmailTemplate({
                name: templateName,
                subject,
                content: finalContent
            });
            setTemplates(prev => [newTemplate, ...prev]);
            setShowSaveModal(false);
            setTemplateName("");
            setMessage({ type: "success", text: "Modèle enregistré dans votre bibliothèque." });
        } catch (error) {
            setMessage({ type: "error", text: "Erreur lors de la sauvegarde du modèle." });
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDeleteTemplate = async () => {
        if (!templateToDelete) return;
        
        setIsDeleting(true);
        try {
            await api.deleteEmailTemplate(templateToDelete.id);
            setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
            setTemplateToDelete(null);
            setMessage({ type: "success", text: "Modèle supprimé avec succès." });
        } catch (error) {
            console.error("Delete failed", error);
            setMessage({ type: "error", text: "Erreur lors de la suppression." });
        } finally {
            setIsDeleting(false);
        }
    };

    const loadTemplate = (template: EmailTemplate) => {
        setSubject(template.subject);
        
        // Try to parse newsletter sections JSON
        const sections = parseNewsletterHtml(template.content);
        if (sections && (sections.length > 1 || sections[0].title || sections[0].imageUrl)) {
            setNewsletterSections(sections);
            setActiveTab("newsletter");
        } else {
            setContent(template.content);
            setNewsletterSections([{ id: "1", title: "", titleBgColor: "#7c3aed", imageUrl: "", content: template.content }]);
        }
        window.scrollTo({ top: 350, behavior: 'smooth' });
    };

    // Enquêtes : Créer une nouvelle campagne
    const handleCreateSurvey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!surveyTitle.trim()) {
            setMessage({ type: "error", text: "Veuillez attribuer un titre à votre enquête." });
            return;
        }

        if (surveyType === "general" && !surveyTargetSegment) {
            setMessage({ type: "error", text: "Veuillez sélectionner un segment cible." });
            return;
        }

        if (surveyType === "event" && !surveyTargetSegment) {
            setMessage({ type: "error", text: "Veuillez sélectionner un ciblage." });
            return;
        }

        if (surveyType === "event" && surveyTargetType === "event" && !surveyEventId) {
            setMessage({ type: "error", text: "Veuillez sélectionner un événement." });
            return;
        }

        if (surveyType === "event" && surveyTargetType === "session" && !surveySessionId) {
            setMessage({ type: "error", text: "Veuillez sélectionner une séance." });
            return;
        }

        setIsCreatingSurvey(true);
        setMessage(null);
        try {
            await api.createSurveyCampaign({
                title: surveyTitle,
                description: surveyDescription || undefined,
                survey_type: surveyType,
                event_id: surveyType === "event" && surveyTargetType === "event" ? surveyEventId : undefined,
                session_id: surveyType === "event" && surveyTargetType === "session" ? surveySessionId : undefined,
                target_segment: surveyTargetSegment || undefined
            });
            setMessage({ type: "success", text: "Enquête de satisfaction créée et jetons individuels sécurisés générés." });
            setSurveyTitle("");
            setSurveyDescription("");
            setSurveyTargetSegment(surveyType === "event" ? "participants" : "");
            setSurveyEventId("");
            setSurveySessionId("");
            loadSurveys();
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || "Erreur de création de l'enquête.";
            setMessage({ type: "error", text: errorMsg });
        } finally {
            setIsCreatingSurvey(false);
        }
    };

    // Enquêtes : Diffuser par mail aux cibles
    const handleSendSurvey = async (campaignId: string) => {
        setIsSendingSurvey(campaignId);
        setMessage(null);
        try {
            const res = await api.sendSurveyCampaignEmails(campaignId);
            setMessage({ type: "success", text: res.message });
            loadSurveys();
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || "Erreur lors de l'envoi de l'enquête.";
            setMessage({ type: "error", text: errorMsg });
        } finally {
            setIsSendingSurvey(null);
        }
    };

    // Enquêtes : Inspecter les retours clients
    const handleViewSurveyDetails = async (campaignId: string) => {
        try {
            const details = await api.getSurveyCampaignDetails(campaignId);
            setSelectedSurveyDetails(details);
            setShowSurveyDetailsModal(true);
        } catch (err) {
            console.error(err);
            setMessage({ type: "error", text: "Impossible de récupérer les retours de l'enquête." });
        }
    };

    // Enquêtes : Ouvrir la confirmation de suppression
    const handleDeleteSurvey = (campaign: any) => {
        setSurveyToDelete(campaign);
    };

    // Enquêtes : Confirmer la suppression d'une enquête depuis la modale
    const confirmDeleteSurvey = async () => {
        if (!surveyToDelete) return;
        setIsDeletingSurvey(true);
        try {
            await api.deleteSurveyCampaign(surveyToDelete.id);
            setMessage({ type: "success", text: "Campagne d'enquête supprimée avec succès." });
            setSurveyToDelete(null);
            loadSurveys();
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || "Erreur lors de la suppression de l'enquête.";
            setMessage({ type: "error", text: errorMsg });
        } finally {
            setIsDeletingSurvey(false);
        }
    };

    // Filtres sélection utilisateurs manuelle
    const filteredUsers = allUsers.filter(u => 
        u.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleUserSelection = (id: string) => {
        setSelectedUserIds(prev => 
            prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
        );
    };

    // Noms des segments en Français
    const segmentLabels: Record<string, string> = {
        explorateur: "Prospect (Compte créé - aucune commande)",
        decouverte: "Découverte (Une commande passée - aucune réservation à venir)",
        regulier: "Actif (Commande en cours - inscriptions régulières)",
        endormi: "Distant (Commande en cours - absence prolongée (+21 jrs))",
        flexible: "Visiteur (Aucune commande en cours - vient de temps en temps)",
        ancien: "Inactif (N'a pas repris de commande depuis + de 60jrs)",
        participants: "Uniquement les participants"
    };

    const renderSmileys = (rating: number | null) => {
        if (rating === null) return (
            <span className="bg-slate-50 border border-slate-200/60 text-[10px] font-medium text-slate-400 px-2 py-0.5 rounded-full">
                Non répondu
            </span>
        );
        const smileys = ["😠", "🙁", "😐", "🙂", "😍"];
        return <span className="text-xl" title={`Note: ${rating}/5`}>{smileys[rating - 1] || "⭐"}</span>;
    };

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar user={user} />
            <main className="flex-1 p-8">
                <div className="max-w-7xl mx-auto">
                    
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
                                📧 Communication & Marketing
                            </h1>
                            <p className="text-base font-normal text-slate-500 mt-1">
                                Segmentez votre base client, diffusez vos actualités et pilotez la satisfaction de votre club.
                            </p>
                        </div>
                    </div>

                    {/* Navigation Onglets Style Portefeuille / Paramètres */}
                    <div className="flex items-center border-b border-slate-200 mb-8 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => { setActiveTab("newsletter"); setMessage(null); }}
                            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === "newsletter"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <span className="text-base">📧</span> Newsletter & Communication
                        </button>
                        <button
                            onClick={() => { setActiveTab("operational"); setMessage(null); }}
                            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === "operational"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <span className="text-base">📢</span> Infos pratiques
                        </button>
                        <button
                            onClick={() => { setActiveTab("marketing"); setMessage(null); }}
                            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === "marketing"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <span className="text-base">🚀</span> Marketing
                        </button>
                        <button
                            onClick={() => { setActiveTab("surveys"); setMessage(null); }}
                            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === "surveys"
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <span className="text-base">📊</span> Enquêtes
                        </button>
                    </div>

                    {/* Alertes de retour */}
                    {message && (
                        <div className={`mb-6 p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in duration-200 ${message.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                            <div className="flex items-center gap-3">
                                <span className="text-lg">{message.type === "success" ? "✅" : "❌"}</span>
                                <p className="text-sm font-medium">{message.text}</p>
                            </div>
                            <button 
                                onClick={() => setMessage(null)} 
                                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-white/40 rounded-lg ml-auto shrink-0"
                                title="Fermer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {activeTab === "newsletter" && (
                        <div className="animate-in fade-in duration-300">
                            {/* Section Modèles de bibliothèque */}
                            {templates.length > 0 && (
                                <section className="mb-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modèles enregistrés</h2>
                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">{templates.length} modèles</span>
                                    </div>
                                    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                                        {templates.map(t => (
                                            <div 
                                                key={t.id}
                                                onClick={() => loadTemplate(t)}
                                                className="min-w-[220px] max-w-[220px] bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group relative"
                                            >
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTemplateToDelete(t);
                                                    }}
                                                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all text-xs z-20"
                                                    title="Supprimer le modèle"
                                                >
                                                    ✕
                                                </button>
                                                <div className="w-10 h-10 bg-indigo-50/50 rounded-xl flex items-center justify-center text-indigo-600 transition-colors mb-4 font-bold text-lg">
                                                    📄
                                                </div>
                                                <h3 className="font-bold text-slate-900 text-sm truncate mb-1">{t.name}</h3>
                                                <p className="text-xs text-slate-500 truncate">{t.subject || "Pas d'objet"}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                                {/* Left Column: Editor & Inputs */}
                                <div className="space-y-6">
                                    
                                    {/* 1. Destinataires */}
                                    <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 relative">
                                        <div className="relative" ref={dropdownRef}>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Définir les destinataires
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                                className="w-full p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all outline-none flex items-center justify-between text-sm font-semibold text-slate-800 shadow-sm"
                                            >
                                                <span className="flex items-center gap-2">
                                                    👥 {selectedTargets.includes("all") ? "Tous les membres du club" : 
                                                        selectedTargets.includes("selected") ? `Sélection manuelle (${selectedUserIds.length} cible(s))` :
                                                        `Groupes ciblés (${selectedTargets.length} segment(s))`}
                                                </span>
                                                <span className="text-xs text-slate-400 transition-transform duration-200">
                                                    {dropdownOpen ? "▲" : "▼"}
                                                </span>
                                            </button>

                                            {dropdownOpen && (
                                                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-150 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in duration-200">
                                                    <div className="p-2.5 max-h-80 overflow-y-auto space-y-1 bg-slate-50/30">
                                                        
                                                        {/* Option: Tous les membres */}
                                                        <label className="flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTargets.includes("all")}
                                                                    onChange={() => toggleTarget("all")}
                                                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-semibold text-slate-800">Tous les membres</span>
                                                                    <span className="text-xs text-slate-400 font-normal">Envoyer la communication à toute la base active</span>
                                                                </div>
                                                            </div>
                                                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-normal">
                                                                {allUsers.length} personnes
                                                            </span>
                                                        </label>

                                                        {/* Option: Sélection manuelle */}
                                                        <label className="flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTargets.includes("selected")}
                                                                    onChange={() => toggleTarget("selected")}
                                                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-semibold text-slate-800">Sélection manuelle</span>
                                                                    <span className="text-xs text-slate-400 font-normal">Choisir individuellement les destinataires</span>
                                                                </div>
                                                            </div>
                                                            {selectedUserIds.length > 0 && (
                                                                <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-normal">
                                                                    {selectedUserIds.length} cibles
                                                                </span>
                                                            )}
                                                        </label>

                                                        {selectedTargets.includes("selected") && (
                                                            <div className="p-3 bg-white border border-slate-100 rounded-xl my-2 space-y-3">
                                                                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                                                    <span className="text-xs">🔍</span>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Rechercher un membre..."
                                                                        value={searchTerm}
                                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                                        className="w-full text-xs font-light outline-none"
                                                                    />
                                                                </div>
                                                                <div className="max-h-40 overflow-y-auto space-y-1.5">
                                                                    {filteredUsers.map(u => (
                                                                        <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={selectedUserIds.includes(u.id)}
                                                                                onChange={() => toggleUserSelection(u.id)}
                                                                                className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                                            />
                                                                            <span className="text-xs font-light text-slate-700">{u.first_name} {u.last_name} ({u.email})</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="border-t border-slate-100 my-2 pt-2">
                                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-3.5">Cibler par segment</span>
                                                        </div>

                                                        {/* Option: Par segments */}
                                                        {segmentStats && Object.entries(segmentStats).map(([key, count]) => {
                                                            const cleanLabel = segmentLabels[key] || key;
                                                            let subLabel = "";
                                                            if (key === "explorateur") subLabel = "Créé un compte sans commande";
                                                            else if (key === "decouverte") subLabel = "Une seule commande passée";
                                                            else if (key === "regulier") subLabel = "Fidèle avec réservations régulières";
                                                            else if (key === "endormi") subLabel = "Absent depuis plus de 21 jours";
                                                            else if (key === "flexible") subLabel = "Visiteur ponctuel";
                                                            else if (key === "ancien") subLabel = "Inactif depuis plus de 60 jours";

                                                            return (
                                                                <label key={key} className="flex items-center justify-between p-3.5 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                                                                    <div className="flex items-center gap-3">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedTargets.includes(key)}
                                                                            onChange={() => toggleTarget(key)}
                                                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                                        />
                                                                        <div className="flex flex-col">
                                                                            <span className="text-sm font-semibold text-slate-800">{cleanLabel}</span>
                                                                            {subLabel && <span className="text-xs text-slate-400 font-normal">{subLabel}</span>}
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-normal">
                                                                        {count} personnes
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="text-slate-400 text-xs font-normal leading-relaxed mt-2.5 flex items-start gap-1.5">
                                            <span>ℹ️</span>
                                            <span>
                                                Ces e-mails respectent le consentement des utilisateurs. Seuls les clients ayant coché <em>&quot;Accepter les e-mails d&apos;information et marketing&quot;</em> recevront ce message.
                                            </span>
                                        </div>
                                    </section>

                                    {/* 2. Édition de l'objet & des sections */}
                                    <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 space-y-6">
                                        <div>
                                            <label className={`block text-sm font-medium mb-1.5 ${showValidation && !subject ? 'text-rose-500' : 'text-slate-700'}`}>Objet de l&apos;email</label>
                                            <input
                                                type="text"
                                                value={subject}
                                                onChange={(e) => {
                                                    setSubject(e.target.value);
                                                    if (e.target.value) setShowValidation(false);
                                                }}
                                                placeholder="Saisissez l'objet de votre e-mail..."
                                                className={`w-full p-3.5 border rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none text-sm transition-all font-light ${showValidation && !subject ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white'}`}
                                            />
                                        </div>

                                        <div className="border-t border-slate-100 my-4" />

                                        {/* Multi-sections list */}
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sections de la Newsletter</h3>
                                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">{newsletterSections.length} section(s)</span>
                                            </div>

                                            {newsletterSections.map((sec, idx) => (
                                                <div key={sec.id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4 relative group animate-in fade-in duration-200">
                                                    {/* Controls */}
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Section #{idx + 1}</h4>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => moveSection(idx, 'up')}
                                                                disabled={idx === 0}
                                                                className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition-all text-[10px]"
                                                                title="Monter"
                                                            >
                                                                ▲
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => moveSection(idx, 'down')}
                                                                disabled={idx === newsletterSections.length - 1}
                                                                className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white transition-all text-[10px]"
                                                                title="Descendre"
                                                            >
                                                                ▼
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeSection(sec.id)}
                                                                disabled={newsletterSections.length <= 1}
                                                                className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200 transition-all text-xs"
                                                                title="Supprimer"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Title & Color Picker */}
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="md:col-span-2">
                                                            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Titre de la section (optionnel)</label>
                                                            <input
                                                                type="text"
                                                                value={sec.title}
                                                                onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                                                                placeholder="Ex: Les nouvelles du mois..."
                                                                className="w-full p-2.5 border border-slate-200 rounded-xl bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none text-xs transition-all font-light"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Couleur du titre</label>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="color"
                                                                    value={sec.titleBgColor}
                                                                    onChange={(e) => updateSection(sec.id, { titleBgColor: e.target.value })}
                                                                    className="w-10 h-10 border border-slate-200 rounded-xl cursor-pointer p-0 bg-transparent shrink-0"
                                                                />
                                                                <select
                                                                    value={sec.titleBgColor}
                                                                    onChange={(e) => updateSection(sec.id, { titleBgColor: e.target.value })}
                                                                    className="flex-1 p-2 border border-slate-200 rounded-xl bg-white text-xs font-light outline-none"
                                                                >
                                                                    <option value="#7c3aed">Violet</option>
                                                                    <option value="#10b981">Émeraude</option>
                                                                    <option value="#3b82f6">Bleu</option>
                                                                    <option value="#f59e0b">Ambre</option>
                                                                    <option value="#ef4444">Rouge</option>
                                                                    <option value="#0f172a">Noir</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Image Upload */}
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                                                            Image d&apos;illustration <span className="lowercase font-normal text-slate-400/80">(optionnel)</span>
                                                        </label>
                                                        {sec.imageUrl ? (
                                                            <div className="space-y-3">
                                                                <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-40 bg-slate-100 flex items-center justify-center">
                                                                    <img src={sec.imageUrl} alt="Preview" className="max-h-40 object-contain w-auto" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => updateSection(sec.id, { imageUrl: "" })}
                                                                        className="absolute top-2 right-2 p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg border border-rose-200 text-[10px] font-semibold transition-all shadow-sm"
                                                                    >
                                                                        Retirer l&apos;image ✕
                                                                    </button>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Taille de l&apos;image :</span>
                                                                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateSection(sec.id, { imageSize: 'small' })}
                                                                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                                                                                (sec.imageSize || 'large') === 'small'
                                                                                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/30'
                                                                                    : 'text-slate-600 hover:text-slate-900'
                                                                            }`}
                                                                        >
                                                                            Petite
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateSection(sec.id, { imageSize: 'medium' })}
                                                                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                                                                                (sec.imageSize || 'large') === 'medium'
                                                                                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/30'
                                                                                    : 'text-slate-600 hover:text-slate-900'
                                                                            }`}
                                                                        >
                                                                            Moyenne
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateSection(sec.id, { imageSize: 'large' })}
                                                                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                                                                                (sec.imageSize || 'large') === 'large'
                                                                                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/30'
                                                                                    : 'text-slate-600 hover:text-slate-900'
                                                                            }`}
                                                                        >
                                                                            Grande
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                disabled={uploadingSectionId === sec.id}
                                                                onClick={() => {
                                                                    const input = document.createElement('input');
                                                                    input.setAttribute('type', 'file');
                                                                    input.setAttribute('accept', 'image/*');
                                                                    input.onchange = async () => {
                                                                        if (input.files && input.files[0]) {
                                                                            handleSectionImageUpload(sec.id, input.files[0]);
                                                                        }
                                                                    };
                                                                    input.click();
                                                                }}
                                                                className="w-full py-2.5 border border-dashed border-slate-200 text-slate-500 hover:border-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 bg-white hover:bg-slate-50/50"
                                                            >
                                                                {uploadingSectionId === sec.id ? "Chargement..." : "Charger une image 📸"}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Text Content */}
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Contenu</label>
                                                        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
                                                            <QuillNode
                                                                theme="snow"
                                                                value={sec.content}
                                                                onChange={(val: string) => updateSection(sec.id, { content: val })}
                                                                modules={modules}
                                                                placeholder="Rédigez votre contenu..."
                                                                className="h-64 quill-editor"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            <button
                                                type="button"
                                                onClick={addSection}
                                                className="w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-white"
                                            >
                                                ➕ Ajouter une section
                                            </button>
                                        </div>

                                        <div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-[11px] text-indigo-950 font-normal leading-relaxed">
                                            <span className="text-sm select-none">✨</span>
                                            <div className="space-y-1.5">
                                                <p className="font-semibold text-indigo-900">Créer la mise en page :</p>
                                                <ul className="list-disc pl-4 space-y-1">
                                                    <li><span className="font-semibold">Personnaliser le prénom du destinataire</span> en utilisant le tag <code>{"{first_name}"}</code> dans votre texte</li>
                                                    <li><span className="font-semibold">Mettre un mot en évidence</span> dans un encart en l&apos;écrivant en MAJUSCULE et en gras (ex : un code promo, un mot de passe...)</li>
                                                    <li><span className="font-semibold">Insérer un bouton d&apos;action</span> en ajoutant un lien hypertexte seul sur sa propre ligne de texte (ex : Plus d&apos;infos, Réserver votre séance...)</li>
                                                    <li><span className="font-semibold">Insérer des emojis depuis votre ordinateur</span> dans votre titre et votre corps de mail en appuyant simultanément sur la touche Windows (❖) + la touche Point ( . ) ou sur <code>Cmd + Ctrl + Espace</code> si vous êtes sur Mac.</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-4">
                                        <button
                                            onClick={() => setShowSaveModal(true)}
                                            className="w-full md:w-auto px-6 py-4 rounded-xl font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm shadow-sm active:scale-95"
                                        >
                                            💾 Enregistrer comme modèle
                                        </button>
                                        <button
                                            onClick={handleSend}
                                            disabled={isSending}
                                            className={`w-full md:w-auto px-10 py-4 rounded-xl font-bold text-white shadow-lg shadow-indigo-200/50 transition-all text-sm active:scale-95 ${isSending ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"}`}
                                        >
                                            {isSending ? "Envoi en cours..." : "Diffuser la newsletter"}
                                        </button>
                                    </div>
                                </div>

                                {/* Right Column: Live Sticky Preview */}
                                <div className="sticky top-6 lg:col-span-1 space-y-4">
                                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aperçu en direct</h3>
                                            <button
                                                onClick={() => setShowPreviewModal(true)}
                                                className="px-3.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[11px] font-bold hover:bg-indigo-100 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm border border-indigo-100/50"
                                            >
                                                🔍 Rendu Réel
                                            </button>
                                        </div>
                                        
                                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-slate-50">
                                            <div className="bg-slate-100 px-3.5 py-2.5 flex items-center gap-2 border-b border-slate-200">
                                                <div className="flex gap-1.5 shrink-0">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                                </div>
                                                <div className="w-full bg-white rounded-md text-[9px] text-slate-400 text-center py-0.5 border border-slate-200 truncate select-none">
                                                    apercu-newsletter
                                                </div>
                                            </div>
                                            <div className="bg-white">
                                                <iframe 
                                                    srcDoc={generateRealisticHtml()} 
                                                    className="w-full h-[540px] border-0 block bg-white"
                                                    title="Live Email Preview"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "operational" && (
                        <div className="grid grid-cols-1 gap-8 animate-in fade-in duration-300">
                            {/* Section Modèles de bibliothèque */}
                            {templates.length > 0 && (
                                <section className="animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modèles enregistrés</h2>
                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">{templates.length} modèles</span>
                                    </div>
                                    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                                        {templates.map(t => (
                                            <div 
                                                key={t.id}
                                                onClick={() => loadTemplate(t)}
                                                className="min-w-[220px] max-w-[220px] bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group relative"
                                            >
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTemplateToDelete(t);
                                                    }}
                                                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all text-xs z-20"
                                                    title="Supprimer le modèle"
                                                >
                                                    ✕
                                                </button>
                                                <div className="w-10 h-10 bg-indigo-50/50 rounded-xl flex items-center justify-center text-indigo-600 transition-colors mb-4 font-bold text-lg">
                                                    📄
                                                </div>
                                                <h3 className="font-bold text-slate-900 text-sm truncate mb-1">{t.name}</h3>
                                                <p className="text-xs text-slate-500 truncate">{t.subject || "Pas d'objet"}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Cadre Unique de Composition */}
                            <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 z-30 relative space-y-6">
                                
                                {/* 1. Destinataires */}
                                <div className="relative mb-2" ref={dropdownRef}>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        Définir les destinataires
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setDropdownOpen(!dropdownOpen)}
                                        className="w-full p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all outline-none flex items-center justify-between text-sm font-semibold text-slate-800 shadow-sm"
                                    >
                                        <span className="flex items-center gap-2">
                                            {selectedTargets.includes("all") ? (
                                                <>
                                                    <span className="text-base">🌍</span> Tous les utilisateurs ({allUsers.filter(u => u.role === "user").length} personnes)
                                                </>
                                            ) : selectedTargets.includes("selected") ? (
                                                <>
                                                    <span className="text-base">✏️</span> Sélection manuelle ({selectedUserIds.length} personnes)
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-base">🎯</span> Statuts : {selectedTargets.map(t => {
                                                        const label = segmentLabels[t];
                                                        return label ? label.split(" (")[0] : t;
                                                    }).join(", ")}
                                                </>
                                            )}
                                        </span>
                                        <svg className={`w-5 h-5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {dropdownOpen && (
                                        <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="p-4 max-h-[350px] overflow-y-auto space-y-2">
                                                
                                                {/* Tous les utilisateurs */}
                                                <label className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all cursor-pointer border border-slate-100">
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedTargets.includes("all")}
                                                            onChange={() => toggleTarget("all")}
                                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-slate-800">🌍 Tous les utilisateurs</span>
                                                            <span className="text-xs text-slate-400 font-normal">Envoyer à toute la base</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-normal">
                                                        {allUsers.filter(u => u.role === "user").length} personnes
                                                    </span>
                                                </label>

                                                {selectedUserIds.length > 0 && (
                                                    <label className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all cursor-pointer border border-slate-100 bg-amber-50/20 border-amber-100">
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedTargets.includes("selected")}
                                                                onChange={() => toggleTarget("selected")}
                                                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                            />
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-semibold text-slate-800">✏️ Sélection manuelle</span>
                                                                <span className="text-xs text-slate-400 font-normal">Membres pré-sélectionnés dans la liste</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">
                                                            {selectedUserIds.length} personnes
                                                        </span>
                                                    </label>
                                                )}

                                                <div className="border-t border-slate-100 my-2 pt-2">
                                                    <p className="text-[10px] font-normal text-slate-400 uppercase tracking-wider px-3 mb-2">Filtrer par statut comportemental</p>
                                                </div>

                                                {/* Statuts / segments */}
                                                {Object.entries(segmentLabels).map(([key, label]) => {
                                                    const count = segmentStats ? (segmentStats as any)[key] || 0 : 0;
                                                    const cleanLabel = label.split(" (")[0];
                                                    const subLabel = label.includes(" (") ? label.substring(label.indexOf(" (") + 2, label.lastIndexOf(")")) : "";
                                                    
                                                    return (
                                                        <label key={key} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all cursor-pointer border border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTargets.includes(key)}
                                                                    onChange={() => toggleTarget(key)}
                                                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                                />
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-semibold text-slate-800">{cleanLabel}</span>
                                                                    {subLabel && <span className="text-xs text-slate-400 font-normal">{subLabel}</span>}
                                                                </div>
                                                            </div>
                                                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-normal">
                                                                {count} personnes
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* switch urgent en cas d'urgence opérationnelle */}
                                    <div className="mt-4 flex flex-col gap-4">
                                        <div className="flex items-center justify-end gap-4">
                                            <span className="text-sm font-semibold text-slate-700">Forcer l&apos;envoi</span>
                                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                                <input 
                                                    type="checkbox" 
                                                    checked={forceOperational}
                                                    onChange={(e) => setForceOperational(e.target.checked)}
                                                    className="sr-only peer" 
                                                />
                                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                            </label>
                                        </div>

                                        {forceOperational && (
                                            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs leading-relaxed animate-in slide-in-from-top-4 duration-300">
                                                <p className="font-bold flex items-center gap-2 mb-1 text-amber-800">
                                                    ⚠️ AVERTISSEMENT DE CONFORMITÉ RGPD
                                                </p>
                                                L&apos;envoi forcé outrepasse le choix de non-réception des utilisateurs. Cette option doit être réservée **uniquement** à des cas majeurs (ex. fermeture exceptionnelle, panne technique, changement d&apos;horaires urgents). Tout usage commercial ou promotionnel via cette option est strictement interdit par la réglementation.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 my-4" />

                                {/* 2. Édition du message */}
                                <div className="space-y-5">
                                    <div>
                                        <label className={`block text-sm font-medium mb-1.5 ${showValidation && !subject ? 'text-rose-500' : 'text-slate-700'}`}>Objet de l&apos;email</label>
                                        <input
                                            type="text"
                                            value={subject}
                                            onChange={(e) => {
                                                setSubject(e.target.value);
                                                if (e.target.value) setShowValidation(false);
                                            }}
                                            placeholder="Saisissez l'objet de votre e-mail..."
                                            className={`w-full p-3.5 border rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none text-sm transition-all font-light ${showValidation && !subject ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white'}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Contenu de l&apos;email</label>
                                        <div className="bg-white rounded-xl overflow-hidden border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
                                            <QuillNode
                                                ref={quillRef}
                                                theme="snow"
                                                value={content}
                                                onChange={setContent}
                                                modules={modules}
                                                placeholder="Rédigez le corps de votre message..."
                                                className="h-80 quill-editor"
                                            />
                                        </div>

                                        <div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-[11px] text-indigo-950 font-normal leading-relaxed">
                                            <span className="text-sm select-none">✨</span>
                                            <div className="space-y-1.5">
                                                <p className="font-semibold text-indigo-900">Créer la mise en page :</p>
                                                <ul className="list-disc pl-4 space-y-1">
                                                    <li><span className="font-semibold">Personnaliser le prénom du destinataire</span> en utilisant le tag <code>{"{first_name}"}</code> dans votre texte</li>
                                                    <li><span className="font-semibold">Mettre un mot en évidence</span> dans un encart en l&apos;écrivant en MAJUSCULE et en gras (ex : un code promo, un mot de passe...)</li>
                                                    <li><span className="font-semibold">Insérer un bouton d&apos;action</span> en ajoutant un lien hypertexte seul sur sa propre ligne de texte (ex : Plus d&apos;infos, Réserver votre séance...)</li>
                                                    <li><span className="font-semibold">Insérer des emojis depuis votre ordinateur</span> dans votre titre et votre corps de mail en appuyant simultanément sur la touche Windows (❖) + la touche Point ( . ) ou sur <code>Cmd + Ctrl + Espace</code> si vous êtes sur Mac.</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Actions */}
                            <div className="flex flex-col md:flex-row justify-end items-center gap-4 pt-4 pb-8">
                                <button
                                    onClick={() => setShowSaveModal(true)}
                                    className="w-full md:w-auto px-6 py-4 rounded-xl font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm shadow-sm"
                                >
                                    💾 Enregistrer comme modèle
                                </button>
                                <button
                                    onClick={handleSend}
                                    disabled={isSending}
                                    className={`w-full md:w-auto px-10 py-4 rounded-xl font-bold text-white shadow-lg shadow-indigo-200/50 transition-all text-sm ${isSending ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"}`}
                                >
                                    {isSending ? "Envoi en cours..." : "Diffuser le message"}
                                </button>
                            </div>
                        </div>
                    )}


                    {/* ==================== TAB 3 : MARKETING ACTIONS ==================== */}
                    {activeTab === "marketing" && (() => {
                        return (
                            <div className="animate-in fade-in duration-300">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                    {/* 1/3 Left Column: Visual Email Preview Mockup */}
                                    <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aperçu du visuel cible</h3>
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                                        </div>
                                        
                                        {/* Mock Email Client Container */}
                                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-slate-50 text-[10px]">
                                            {/* Browser Header Bar */}
                                            <div className="bg-slate-100 px-3.5 py-2.5 flex items-center gap-2 border-b border-slate-200">
                                                <div className="flex gap-1.5 shrink-0">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                                </div>
                                                <div className="w-full bg-white rounded-md text-[9px] text-slate-400 text-center py-0.5 border border-slate-200 truncate select-none">
                                                    apercu-zenstudio-mockup
                                                </div>
                                            </div>
                                            
                                            {/* Email Client Content */}
                                            <div className="bg-white text-slate-700">
                                                {/* Brand Logo & Name */}
                                                <div className="p-4 pb-2 flex flex-col items-center justify-center">
                                                    <svg viewBox="0 0 100 100" className="w-9 h-9 text-[#a7825d]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M50 20 C40 38 40 68 50 80 C60 68 60 38 50 20 Z" />
                                                        <path d="M50 35 C25 45 25 70 50 80" />
                                                        <path d="M50 35 C75 45 75 70 50 80" />
                                                        <path d="M50 50 C10 58 15 78 50 80" />
                                                        <path d="M50 50 C90 58 85 78 50 80" />
                                                    </svg>
                                                </div>

                                                {/* Slogan */}
                                                <div className="px-4 text-center">
                                                    <div className="border-t border-slate-200 w-10 mx-auto my-1.5" />
                                                    <div className="text-[10px] font-light text-[#475569] mb-2" style={{ fontFamily: "'Livvic', sans-serif" }}>
                                                        Le bien-être à chaque respiration | A vos côtés depuis 2005
                                                    </div>
                                                </div>

                                                {/* Premium Yoga Cover Image - Full Width / Edge-to-Edge */}
                                                <div className="w-full">
                                                    <img 
                                                        src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop" 
                                                        className="w-full h-auto block" 
                                                        alt="Zen Yoga Studio Preview" 
                                                    />
                                                </div>
                                                
                                                {/* Elegant Centered Content */}
                                                <div className="p-5 pt-3.5 space-y-3 text-center" style={{ fontFamily: "'Livvic', sans-serif" }}>
                                                    <p className="font-bold text-slate-900 leading-normal text-[11px]">Bonjour Julie,</p>
                                                    <p className="text-slate-500 font-normal leading-relaxed text-[9px] max-w-xs mx-auto">
                                                        Nous tenions tout particulièrement à vous remercier pour votre fidélité et votre énergie positive au studio ! C&apos;est un réel plaisir de vous accompagner dans vos séances.
                                                    </p>
                                                    <p className="text-slate-500 font-normal leading-relaxed text-[9px] max-w-xs mx-auto">
                                                        Pour vous remercier, voici un code cadeau offrant une invitation gratuite pour le proche de votre choix lors de votre prochain cours :
                                                    </p>
                                                    
                                                    {/* Double Border Coupon Box */}
                                                    <div className="my-3.5 mx-auto max-w-[140px] p-2 bg-[#fbf2eb] border-[3px] border-double border-[#a7825d] rounded text-center">
                                                        <span className="font-bold text-[10px] text-[#a7825d] tracking-widest uppercase" style={{ fontFamily: "'Livvic', sans-serif" }}>
                                                            MERCIAMIS
                                                        </span>
                                                    </div>

                                                    <p className="text-slate-900 font-semibold text-[9px] mt-3">
                                                        À très bientôt sur les tapis !
                                                    </p>
                                                    <p className="text-slate-400 font-medium text-[8px]">
                                                        L&apos;équipe Zen Yoga
                                                    </p>
                                                    
                                                    {/* Soft Rounded CTA Button */}
                                                    <div className="py-2">
                                                        <span 
                                                            className="inline-block px-4 py-1.5 text-[9px] font-medium text-white bg-[#0f172a] rounded shadow-sm hover:bg-slate-800 tracking-wider uppercase select-none transition-all active:scale-95 cursor-pointer" 
                                                            style={{ 
                                                                fontFamily: "'Livvic', sans-serif" 
                                                            }}
                                                        >
                                                            Réserver votre séance
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                {/* Newsletter Footer Menu & Social Links */}
                                                <div className="pt-4 border-t border-slate-100 text-center space-y-2 pb-2">
                                                    {/* Links Menu */}
                                                    <div className="flex items-center justify-center gap-1.5 text-[8px] font-semibold text-slate-400 select-none">
                                                        <span>Notre Site</span>
                                                        <span className="text-slate-200 font-normal select-none">•</span>
                                                        <span>Insta</span>
                                                        <span className="text-slate-200 font-normal select-none">•</span>
                                                        <span>Facebook</span>
                                                        <span className="text-slate-200 font-normal select-none">•</span>
                                                        <span>Se désabonner</span>
                                                    </div>
                                                    
                                                    <p className="font-normal text-[8px] text-slate-400">
                                                        © {new Date().getFullYear()} Zen Yoga - Propulsé par Rezea
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                                                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2 text-[11px]">
                                            <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                                                <span>💡</span> Rendu Automatique
                                            </p>
                                            <p className="text-slate-500 font-normal leading-relaxed">
                                                Pas besoin de mise en page complexe. Vos textes bruts sont automatiquement embellis avec le logo, l&apos;image d&apos;illustration, la couleur d&apos;accentuation et les réseaux sociaux paramétrés pour votre club.
                                            </p>
                                        </div>
                                    </div>

                                    {/* 2/3 Right Column: Campaign Grid */}
                                    <div className="lg:col-span-2 space-y-4">
                                        <div className="pb-2">
                                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                                                Stratégies de marketing intelligentes
                                            </h3>
                                            <p className="text-slate-500 text-xs mt-1 font-normal leading-relaxed">
                                                Ciblez vos segments clés en un clic et personnalisez le message. Vos campagnes se transforment automatiquement en e-mails premium.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {marketingCards.map(card => {
                                                const count = segmentStats ? (segmentStats as any)[card.segment] || 0 : 0;
                                                return (
                                                    <div 
                                                        key={card.id}
                                                        onClick={() => handleSelectMarketingCard(card)}
                                                        className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between group h-full relative overflow-hidden"
                                                    >
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xl shrink-0 group-hover:scale-110 transition-transform duration-300 select-none">{card.icon}</span>
                                                                <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                                                                    {card.title}
                                                                </h3>
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 font-normal leading-relaxed pl-8">
                                                                {card.description}
                                                            </p>
                                                        </div>

                                                        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-start pl-8">
                                                            <span className="text-[10px] font-bold px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-lg">
                                                                {count} {count > 1 ? "destinataires" : "destinataire"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ==================== TAB 3 : SATISFACTION SURVEYS ==================== */}
                    {activeTab === "surveys" && (
                        <div className="space-y-10">
                            
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                
                                {/* 1. Créateur d'enquêtes */}
                                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm self-start">
                                    <h3 className="text-lg font-semibold text-slate-950 mb-5 pb-3 border-b border-slate-100 flex items-center gap-2 tracking-tight">
                                        <span>📊</span> Créer une enquête
                                    </h3>
                                    
                                    <form onSubmit={handleCreateSurvey} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Titre</label>
                                            <input 
                                                type="text" 
                                                required
                                                value={surveyTitle}
                                                onChange={(e) => setSurveyTitle(e.target.value)}
                                                placeholder="Ex : Qu'avez-vous pensé de notre stage de mai ?"
                                                className="w-full p-3 border border-slate-200 bg-white hover:border-slate-300 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 placeholder:opacity-100"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description <span className="text-[10px] text-slate-400 font-normal ml-1 lowercase">(optionnel)</span></label>
                                            <textarea 
                                                value={surveyDescription}
                                                onChange={(e) => setSurveyDescription(e.target.value)}
                                                placeholder="Ex : Avez-vous aimé les activités proposées ?"
                                                rows={2}
                                                className="w-full p-3 border border-slate-200 bg-white hover:border-slate-300 rounded-xl text-sm font-normal outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 placeholder:opacity-100 resize-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nature</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setSurveyType("general"); setSurveyTargetSegment(""); }}
                                                    className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-all ${surveyType === "general" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                                                >
                                                    Enquête générale
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setSurveyType("event"); setSurveyTargetType("event"); setSurveyTargetSegment("participants"); }}
                                                    className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-all ${surveyType === "event" && surveyTargetType === "event" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                                                >
                                                    Événement
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setSurveyType("event"); setSurveyTargetType("session"); setSurveyTargetSegment("participants"); }}
                                                    className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-all ${surveyType === "event" && surveyTargetType === "session" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                                                >
                                                    Séance
                                                </button>
                                            </div>
                                        </div>

                                        {surveyType === "event" && (
                                            surveyTargetType === "event" ? (
                                                <div>
                                                    <select
                                                        value={surveyEventId}
                                                        onChange={(e) => setSurveyEventId(e.target.value)}
                                                        required
                                                        className={`w-full p-3 border border-slate-200 bg-white rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 shadow-sm transition-all ${!surveyEventId ? 'text-slate-400 font-normal' : 'text-slate-700 font-medium'}`}
                                                    >
                                                        <option value="" className="text-slate-400">Choisir un événement</option>
                                                        {events.map(ev => (
                                                            <option key={ev.id} value={ev.id} className="text-slate-700 font-medium">{ev.title} ({ev.event_date ? ev.event_date.split('-').reverse().join('/') : ''})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                <div>
                                                    <select
                                                        value={surveySessionId}
                                                        onChange={(e) => setSurveySessionId(e.target.value)}
                                                        required
                                                        className={`w-full p-3 border border-slate-200 bg-white rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 shadow-sm transition-all ${!surveySessionId ? 'text-slate-400 font-normal' : 'text-slate-700 font-medium'}`}
                                                    >
                                                        <option value="" className="text-slate-400">Choisir une séance</option>
                                                        {sessions.map(sess => (
                                                            <option key={sess.id} value={sess.id} className="text-slate-700 font-medium">{sess.title} ({new Date(sess.start_time).toLocaleDateString()})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ciblage</label>
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                    className={`w-full p-3 border border-slate-200 bg-white rounded-xl outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 flex items-center justify-between shadow-[0_2px_4px_rgba(30,41,59,0.02)] transition-all text-sm ${
                                                        surveyType === "event"
                                                            ? "text-black font-light"
                                                            : (!surveyTargetSegment || surveyTargetSegment === "tous")
                                                                ? "text-slate-400 font-normal"
                                                                : "text-black font-light"
                                                    }`}
                                                >
                                                    <span className="truncate">
                                                        {surveyType === "event"
                                                            ? (!surveyTargetSegment || surveyTargetSegment === "participants"
                                                                ? "Uniquement les participants"
                                                                : surveyTargetSegment === "tous"
                                                                    ? "Toute la base utilisateur"
                                                                    : surveyTargetSegment.split(",").map(k => segmentLabels[k] || k).join(", "))
                                                            : (!surveyTargetSegment
                                                                ? "Choisir un ou plusieurs segments"
                                                                : surveyTargetSegment === "tous"
                                                                    ? "Toute la base utilisateur"
                                                                    : surveyTargetSegment.split(",").map(k => segmentLabels[k] || k).join(", "))
                                                        }
                                                    </span>
                                                    <span className="text-slate-400 text-[10px]">▼</span>
                                                </button>
                                                
                                                {isDropdownOpen && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                                                        <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col max-h-64 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                                            {/* Zone défilante des options */}
                                                            <div className="p-1.5 space-y-0.5 overflow-y-auto max-h-52 flex-1">
                                                                {/* Option Uniquement les participants (seulement pour type event) */}
                                                                {surveyType === "event" && (
                                                                    <>
                                                                        <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-all select-none text-xs font-semibold text-slate-700">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={surveyTargetSegment.split(",").includes("participants")}
                                                                                onChange={(e) => {
                                                                                    let current = surveyTargetSegment.split(",").filter(x => x && x !== "tous");
                                                                                    if (e.target.checked) {
                                                                                        if (!current.includes("participants")) {
                                                                                            current.push("participants");
                                                                                        }
                                                                                        setSurveyTargetSegment(current.join(","));
                                                                                    } else {
                                                                                        current = current.filter(x => x !== "participants");
                                                                                        setSurveyTargetSegment(current.join(","));
                                                                                    }
                                                                                }}
                                                                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                                                                            />
                                                                            Uniquement les participants
                                                                        </label>
                                                                        <div className="border-t border-slate-100 my-1" />
                                                                    </>
                                                                )}

                                                                {/* Option Tous */}
                                                                <label className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-all select-none text-xs font-semibold text-slate-700">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={surveyTargetSegment === "tous" || !!(segmentStats && surveyTargetSegment.split(",").filter(x => x && x !== "tous" && x !== "participants").length === Object.keys(segmentStats).length)}
                                                                        onChange={(e) => {
                                                                            if (e.target.checked) {
                                                                                setSurveyTargetSegment("tous");
                                                                            } else {
                                                                                setSurveyTargetSegment("");
                                                                            }
                                                                        }}
                                                                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                                                                    />
                                                                    Toute la base utilisateur
                                                                </label>
                                                                
                                                                <div className="border-t border-slate-100 my-1" />
                                                                
                                                                {/* Options individuelles */}
                                                                {segmentStats && Object.entries(segmentStats).map(([key, val]) => {
                                                                    if (key === "participants") return null;
                                                                    const isChecked = surveyTargetSegment.split(",").includes(key) || surveyTargetSegment.split(",").includes("tous");
                                                                    return (
                                                                        <label 
                                                                            key={key} 
                                                                            className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all select-none hover:bg-slate-50 ${isChecked ? 'bg-blue-50/20' : ''}`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isChecked}
                                                                                onChange={(e) => {
                                                                                    let current = surveyTargetSegment.split(",").filter(x => x && x !== "tous");
                                                                                    if (surveyTargetSegment.split(",").includes("tous") && segmentStats) {
                                                                                        current = Object.keys(segmentStats).filter(k => k !== "participants");
                                                                                    }
                                                                                    
                                                                                    if (e.target.checked) {
                                                                                        if (!current.includes(key)) {
                                                                                            current.push(key);
                                                                                        }
                                                                                        if (segmentStats && current.filter(k => k !== "participants").length === Object.keys(segmentStats).filter(k => k !== "participants").length) {
                                                                                            setSurveyTargetSegment("tous");
                                                                                        } else {
                                                                                            setSurveyTargetSegment(current.join(","));
                                                                                        }
                                                                                    } else {
                                                                                        current = current.filter(x => x !== key);
                                                                                        setSurveyTargetSegment(current.join(","));
                                                                                    }
                                                                                }}
                                                                                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                                                                            />
                                                                            <span className={`text-xs ${isChecked ? 'text-blue-900 font-medium' : 'text-slate-700'}`}>
                                                                                {segmentLabels[key] || key} <span className="text-slate-400 font-normal text-[10px]">({val})</span>
                                                                            </span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Sticky Footer de validation */}
                                                            <div className="bg-slate-50 border-t border-slate-100 px-3 py-2 flex items-center justify-between z-10 text-[10px]">
                                                                <span className="text-slate-500 font-medium truncate max-w-[160px]">
                                                                    {surveyTargetSegment ? (
                                                                        surveyTargetSegment === "tous" ? "Toute la base" : `${surveyTargetSegment.split(',').filter(Boolean).length} segment(s) sélec.`
                                                                    ) : "Aucun segment"}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsDropdownOpen(false)}
                                                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-all"
                                                                >
                                                                    Valider
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isCreatingSurvey}
                                            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 mt-4 active:scale-95"
                                        >
                                            {isCreatingSurvey ? "Génération des jetons..." : "Générer la campagne"}
                                        </button>
                                    </form>
                                </div>

                                {/* 2. Liste des enquêtes existantes */}
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Campagnes d&apos;enquêtes actives</h3>
                                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{surveys.length} enquêtes</span>
                                    </div>

                                    {surveys.length === 0 ? (
                                        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200/80">
                                            <span className="text-4xl block mb-3">🗳️</span>
                                            <h4 className="font-semibold text-slate-800 text-base">Aucune enquête créée</h4>
                                            <p className="text-slate-400 text-xs mt-1">Utilisez le formulaire pour générer des questionnaires 1-Click sécurisés.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                            {surveys.map(c => (
                                                <div 
                                                    key={c.id}
                                                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4"
                                                >
                                                    {/* Ligne 1 : Badge + Titre à gauche, Stats à droite */}
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 space-y-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-0.5 rounded-md text-[9px] uppercase font-semibold border ${c.survey_type === 'event' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                                    {c.survey_type === 'event' ? (c.event_id ? 'Événement' : 'Séance') : 'Général'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleDateString()}</span>
                                                            </div>
                                                            <h4 className="font-medium text-slate-900 text-base">{c.title}</h4>
                                                            {c.description && (
                                                                <p className="text-xs text-slate-400 mt-0.5 font-normal leading-relaxed">{c.description}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-3 items-center shrink-0">
                                                            <div className="text-center bg-white px-3 py-1.5 rounded-lg border border-slate-100">
                                                                <span className="text-[10px] text-slate-400 font-normal block">Note</span>
                                                                <span className="font-medium text-sm text-slate-800 flex items-center justify-center gap-0.5">
                                                                    ⭐ {c.average_rating ? Number(c.average_rating).toFixed(1) : "-"}
                                                                </span>
                                                            </div>
                                                            <div className="text-center bg-white px-3 py-1.5 rounded-lg border border-slate-100">
                                                                <span className="text-[10px] text-slate-400 font-normal block">Envoi</span>
                                                                <span className="font-medium text-sm text-slate-800">{c.responses_count}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Ligne 2 : Actions horizontales */}
                                                    <div className="flex gap-2 pt-1 justify-end">
                                                        {!c.is_sent ? (
                                                            <button
                                                                onClick={() => handleSendSurvey(c.id)}
                                                                disabled={isSendingSurvey === c.id}
                                                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-normal transition-all active:scale-95 text-center min-w-[180px]"
                                                            >
                                                                {isSendingSurvey === c.id ? "Envoi..." : "✉️ Lancer l'enquête par mail"}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleViewSurveyDetails(c.id)}
                                                                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-black rounded-lg text-xs font-normal transition-all text-center min-w-[180px]"
                                                            >
                                                                🔍 Voir les retours détaillés
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDeleteSurvey(c)}
                                                            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-normal transition-all text-center"
                                                        >
                                                            🗑️ Supprimer
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ==================== MODALS ==================== */}

            {/* Modal / Drawer de configuration de la campagne de relance marketing */}
            {selectedMarketingCard && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-4 md:p-5 pb-2.5 flex items-center justify-between bg-white sticky top-0 z-10 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl select-none">{selectedMarketingCard.icon}</span>
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900 tracking-tight leading-snug">{selectedMarketingCard.title}</h3>
                                </div>
                            </div>
                            <button onClick={() => { setSelectedMarketingCard(null); setShowTips(false); }} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-5 pt-3 space-y-4">
                            
                            {/* Premium Encart de ciblage & conseils marketing */}
                            {(() => {
                                const info = marketingCampaignTips[selectedMarketingCard.id] || {
                                    segmentLabel: segmentLabels[selectedMarketingCard.segment] || selectedMarketingCard.segment,
                                    tips: ["Définissez des objectifs de campagne clairs.", "Rédigez un contenu direct et chaleureux."]
                                };
                                return (
                                    <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/50 border border-blue-100/80 rounded-2xl p-4 shadow-sm text-sm">
                                        <button 
                                             type="button"
                                             onClick={() => setShowTips(!showTips)}
                                             className="w-full flex items-center justify-between font-semibold text-slate-700 outline-none select-none"
                                         >
                                             <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-left">
                                                 <h4 className="text-xs font-semibold flex items-center gap-1.5 text-slate-800">
                                                     💡 Idées d&apos;actions recommandées
                                                 </h4>
                                             </div>
                                             <span className="text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1 shrink-0 ml-2">
                                                 {showTips ? "Masquer ▲" : "Afficher les conseils ▼"}
                                             </span>
                                         </button>
                                        
                                        {showTips && (
                                            <div className="mt-3 pt-3 border-t border-blue-100/40 animate-in slide-in-from-top-2 duration-200">
                                                <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    {info.tips.map((tip, idx) => (
                                                        <li key={idx} className="flex gap-2.5 items-start bg-white/65 p-3 rounded-xl border border-white shadow-[0_2px_4px_rgba(30,41,59,0.02)]">
                                                            <span className="text-blue-500 font-bold select-none text-xs">{idx + 1}.</span>
                                                            <span className="text-xs text-slate-600 font-medium leading-relaxed">{tip}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                                {/* Colonne Gauche : Liste des Destinataires */}
                                <div className="lg:col-span-2 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                            Destinataires ({selectedMarketingUserIds.length})
                                        </h4>
                                        <button
                                            onClick={() => {
                                                const targetedUsers = allUsers.filter(u => u.segment === selectedMarketingCard.segment);
                                                if (selectedMarketingUserIds.length === targetedUsers.length) {
                                                    setSelectedMarketingUserIds([]);
                                                } else {
                                                    setSelectedMarketingUserIds(targetedUsers.map(u => u.id));
                                                }
                                            }}
                                            className="text-xs font-semibold text-blue-600 hover:underline"
                                        >
                                            {selectedMarketingUserIds.length === allUsers.filter(u => u.segment === selectedMarketingCard.segment).length ? "Tout décocher" : "Tout cocher"}
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto max-h-[360px] pr-2 border border-slate-100 rounded-2xl p-4 bg-slate-50/30 flex flex-col gap-2">
                                        {allUsers.filter(u => u.segment === selectedMarketingCard.segment).length === 0 ? (
                                            <div className="text-center text-xs text-slate-400 py-12">
                                                Aucun membre dans ce segment actuellement.
                                            </div>
                                        ) : (
                                            allUsers.filter(u => u.segment === selectedMarketingCard.segment).map(u => (
                                                <label
                                                    key={u.id}
                                                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 transition-all cursor-pointer hover:shadow-sm"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedMarketingUserIds.includes(u.id)}
                                                            onChange={() => {
                                                                setSelectedMarketingUserIds(prev =>
                                                                    prev.includes(u.id) ? prev.filter(uid => uid !== u.id) : [...prev, u.id]
                                                                );
                                                            }}
                                                            className="w-4 h-4 text-blue-600 border-slate-200 rounded focus:ring-blue-500"
                                                        />
                                                        <div className="flex flex-col text-left">
                                                            <span className="font-semibold text-slate-700 text-xs">{u.first_name} {u.last_name}</span>
                                                            <span className="text-[10px] text-slate-400 font-normal mt-0.5">{u.email}</span>
                                                        </div>
                                                    </div>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Colonne Droite : Message */}
                                <div className="lg:col-span-3 flex flex-col gap-5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">objet du message</label>
                                        <input
                                            type="text"
                                            value={marketingSubject}
                                            onChange={(e) => setMarketingSubject(e.target.value)}
                                            className="w-full p-4 border border-slate-200/80 rounded-2xl text-sm font-semibold outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 bg-slate-55"
                                        />
                                    </div>

                                     {/* Illustration Image Field */}
                                     <div className="w-full">
                                         <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Image d&apos;illustration <span className="lowercase font-normal text-slate-400/80">(optionnel)</span></label>
                                         {marketingImageUrl ? (
                                             <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-1.5 pr-3.5 rounded-xl">
                                                 <img
                                                     src={`${API_URL}${marketingImageUrl}`}
                                                     alt="Illustration Preview"
                                                     className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                                                 />
                                                 <span className="text-[10px] font-semibold text-slate-500 truncate flex-1">Image chargée</span>
                                                 <button
                                                     type="button"
                                                     onClick={() => setMarketingImageUrl("")}
                                                     className="text-xs font-bold text-rose-500 hover:text-rose-600 ml-2"
                                                 >
                                                     Retirer
                                                 </button>
                                             </div>
                                         ) : (
                                             <div className="relative">
                                                 <input
                                                     type="file"
                                                     accept="image/*"
                                                     onChange={async (e) => {
                                                         const file = e.target.files?.[0];
                                                         if (!file) return;
                                                         setIsUploadingImage(true);
                                                         try {
                                                             const res = await api.uploadImage(file);
                                                             setMarketingImageUrl(res.url);
                                                         } catch (err) {
                                                             console.error(err);
                                                             alert("Erreur lors de l'upload de l'image.");
                                                         } finally {
                                                             setIsUploadingImage(false);
                                                         }
                                                     }}
                                                     disabled={isUploadingImage}
                                                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                 />
                                                 <button
                                                     type="button"
                                                     disabled={isUploadingImage}
                                                     className="w-full py-2.5 border border-dashed border-slate-200 text-slate-900 hover:border-slate-300 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2"
                                                 >
                                                     {isUploadingImage ? "Chargement..." : "Charger une image 📸"}
                                                 </button>
                                             </div>
                                         )}
                                         <p className="text-[10px] text-slate-400 italic mt-1.5 leading-relaxed">
                                             L&apos;image s&apos;affichera en haut de l&apos;email juste en dessous de votre logo et votre phrase d&apos;accroche renseignés dans les paramètres
                                         </p>
                                     </div>
                                     <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">corps du message</label>
                                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 bg-white">
                                             <QuillNode
                                                 theme="snow"
                                                 value={marketingContent}
                                                 onChange={setMarketingContent}
                                                 modules={{
                                                     toolbar: [
                                                         ['bold', 'italic', 'underline', 'strike'],
                                                         ['link'],
                                                         [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                                         [{ 'align': [] }],
                                                         ['clean']
                                                      ]
                                                 }}
                                                 className="bg-white min-h-[160px] text-sm"
                                             />
                                        </div>
                                        <div className="mt-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/80 flex items-start gap-3 text-[11px] text-indigo-950 font-normal leading-relaxed">
                                             <span className="text-sm select-none">✨</span>
                                             <div className="space-y-1.5">
                                                 <p className="font-semibold text-indigo-900">Créer la mise en page :</p>
                                                 <ul className="list-disc pl-4 space-y-1">
                                                     <li><span className="font-semibold">Personnaliser le prénom du destinataire</span> en utilisant le tag <code>{"{first_name}"}</code> dans votre texte</li>
                                                     <li><span className="font-semibold">Mettre un mot en évidence</span> dans un encart en l&apos;écrivant en MAJUSCULE et en gras (ex : un code promo, un mot de passe...)</li>
                                                     <li><span className="font-semibold">Insérer un bouton d&apos;action</span> en ajoutant un lien hypertexte seul sur sa propre ligne de texte (ex : Plus d&apos;infos, Réserver votre séance...)</li>
                                                     <li><span className="font-semibold">Insérer des emojis depuis votre ordinateur</span> dans votre titre et votre corps de mail en appuyant simultanément sur la touche Windows (❖) + la touche Point ( . ) ou sur <code>Cmd + Ctrl + Espace</code> si vous êtes sur Mac.</li>
                                                 </ul>
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                         {/* Modal Footer */}
                        <div className="p-6 bg-white border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                            <span className="text-xs font-medium text-slate-500">
                                {selectedMarketingUserIds.length} destinataire(s) sélectionné(s) sur {allUsers.filter(u => u.segment === selectedMarketingCard.segment).length}
                            </span>
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <button
                                    onClick={() => setSelectedMarketingCard(null)}
                                    className="w-full md:w-auto px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-all text-sm active:scale-95"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleSendMarketing}
                                    disabled={isSendingMarketing || selectedMarketingUserIds.length === 0}
                                    className="w-full md:w-auto px-8 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-semibold transition-all text-sm shadow-md active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {isSendingMarketing ? "Envoi en cours..." : "Diffuser la campagne 🚀"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Sélection manuelle utilisateurs */}
            {showUserSelector && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Sélectionner les destinataires</h3>
                            </div>
                            <button onClick={() => setShowUserSelector(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-lg">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="p-6 border-b border-slate-100">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Rechercher un membre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none text-sm transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredUsers.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => toggleUserSelection(u.id)}
                                    className={`w-full flex items-center p-3 rounded-xl transition-all border ${selectedUserIds.includes(u.id) ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-100 hover:border-slate-200"}`}
                                >
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center mr-4 ${selectedUserIds.includes(u.id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300"}`}>
                                        {selectedUserIds.includes(u.id) && "✓"}
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-slate-800 text-sm">{u.first_name} {u.last_name}</p>
                                        <p className="text-xs text-slate-500">{u.email}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border ${u.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                                            {u.is_active ? "Actif" : "Inactif"}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-sm font-semibold text-slate-600">{selectedUserIds.length} sélectionné(s)</span>
                            <button
                                onClick={() => setShowUserSelector(false)}
                                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-all text-sm active:scale-95"
                            >
                                Terminer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de sauvegarde de modèle */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">Enregistrer le modèle</h3>
                            <p className="text-sm text-slate-500 mb-8 leading-relaxed">Donnez un nom à ce modèle pour le retrouver facilement dans votre bibliothèque.</p>
                            
                            <div className="relative">
                                <input
                                    type="text"
                                    autoFocus
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    placeholder="ex: Annonce Stage Printemps"
                                    className="w-full p-4 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all bg-slate-50/50 font-bold"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
                                />
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-slate-100 flex gap-3 justify-end items-center">
                            <button 
                                onClick={() => setShowSaveModal(false)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm active:scale-95"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleSaveTemplate}
                                disabled={isSavingTemplate || !templateName.trim()}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-50 transition-all text-sm shadow-sm active:scale-95"
                            >
                                {isSavingTemplate ? "..." : "Enregistrer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de suppression de modèle */}
            {templateToDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Supprimer le modèle ?</h3>
                            <p className="text-sm text-slate-500 leading-relaxed font-medium">Cette action est définitive. Le modèle <b>&quot;{templateToDelete.name}&quot;</b> sera supprimé.</p>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-slate-100 flex gap-3 justify-end items-center">
                            <button 
                                onClick={() => setTemplateToDelete(null)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 transition-all text-sm active:scale-95"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleDeleteTemplate}
                                disabled={isDeleting}
                                className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all text-sm shadow-sm active:scale-95"
                            >
                                {isDeleting ? "..." : "Supprimer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de suppression d'enquête */}
            {surveyToDelete && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-10 pb-8">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">Confirmer la suppression</h3>
                            <p className="text-[15px] text-slate-500 leading-relaxed font-normal">
                                Cette action est définitive. L&apos;enquête <b>&quot;{surveyToDelete.title}&quot;</b> ainsi que tous les avis associés seront définitivement supprimés.
                            </p>
                        </div>
                        <div className="p-6 bg-white border-t border-slate-100 flex gap-3 justify-end items-center">
                            <button 
                                onClick={() => setSurveyToDelete(null)}
                                className="px-5 py-2.5 bg-white text-slate-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all text-sm active:scale-95"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={confirmDeleteSurvey}
                                disabled={isDeletingSurvey}
                                className="px-6 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-all text-sm shadow-sm active:scale-95"
                            >
                                {isDeletingSurvey ? "..." : "Supprimer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Inspecteur détaillé Enquêtes */}
            {showSurveyDetailsModal && selectedSurveyDetails && (
                <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[9999] flex items-center justify-end animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        
                        {/* Header details */}
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <span className={`px-2 py-0.5 rounded-md text-[9px] uppercase font-semibold border ${selectedSurveyDetails.survey_type === 'event' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    {selectedSurveyDetails.survey_type === 'event' ? (selectedSurveyDetails.event_id ? 'Événement' : 'Séance') : 'Général'}
                                </span>
                                <h3 className="font-medium text-slate-900 text-base mt-1">{selectedSurveyDetails.title}</h3>
                                {selectedSurveyDetails.context_title && (
                                    <p className="text-xs text-slate-400 mt-0.5">Contexte : {selectedSurveyDetails.context_title}</p>
                                )}
                            </div>
                            <button 
                                onClick={() => setShowSurveyDetailsModal(false)}
                                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 rounded-xl transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Breakdown Panel */}
                        <div className="p-6 bg-slate-50 border-b border-slate-100 grid grid-cols-3 gap-4 text-center">
                            <div className="bg-white p-4 rounded-xl border border-slate-200/50 shadow-sm">
                                <span className="text-[10px] uppercase font-medium text-slate-400 tracking-wider">Note Moyenne</span>
                                <span className="block font-medium text-2xl text-slate-900 mt-1">
                                    ⭐ {selectedSurveyDetails.stats.average_rating ? Number(selectedSurveyDetails.stats.average_rating).toFixed(1) : "-"}
                                </span>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200/50 shadow-sm">
                                <span className="text-[10px] uppercase font-medium text-slate-400 tracking-wider">Participation</span>
                                <span className="block font-medium text-2xl text-slate-900 mt-1">
                                    {Number(selectedSurveyDetails.stats.response_rate).toFixed(0)}%
                                </span>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200/50 shadow-sm">
                                <span className="text-[10px] uppercase font-medium text-slate-400 tracking-wider">Total Réponses</span>
                                <span className="block font-medium text-2xl text-slate-900 mt-1">
                                    {selectedSurveyDetails.stats.total_responses}/{selectedSurveyDetails.stats.total_sent}
                                </span>
                            </div>
                        </div>

                        {/* Responses list */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Retours Individuels</h4>
                            
                            {selectedSurveyDetails.responses.length === 0 ? (
                                <div className="text-center text-slate-400 text-sm py-12">Aucun retour enregistré pour le moment.</div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedSurveyDetails.responses.map((r: any) => (
                                        <div key={r.id} className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm space-y-2">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-sm text-slate-800">{r.user_name}</p>
                                                    <p className="text-[10px] text-slate-400">{r.user_email}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {r.submitted_at ? (
                                                        <span className="bg-emerald-50 border border-emerald-150 text-[10px] font-medium text-emerald-700 px-2 py-0.5 rounded-full">
                                                            Répondu
                                                        </span>
                                                    ) : r.clicked_at ? (
                                                        <span className="bg-amber-50 border border-amber-150 text-[10px] font-medium text-amber-700 px-2 py-0.5 rounded-full animate-pulse">
                                                            Cliqué
                                                        </span>
                                                    ) : (
                                                        <span className="bg-slate-100 text-[10px] font-medium text-slate-400 px-2 py-0.5 rounded-full">
                                                            Envoyé
                                                        </span>
                                                    )}
                                                    {renderSmileys(r.rating)}
                                                </div>
                                            </div>

                                            {r.comment && (
                                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium text-slate-700 italic">
                                                    &ldquo;{r.comment}&rdquo;
                                                </div>
                                            )}

                                            <div className="text-[10px] text-slate-400 flex justify-between pt-1 border-t border-slate-50">
                                                {r.clicked_at && <span>Premier clic : {new Date(r.clicked_at).toLocaleString()}</span>}
                                                {r.submitted_at && <span>Soumis : {new Date(r.submitted_at).toLocaleString()}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer details */}
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setShowSurveyDetailsModal(false)}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Rendu Réel (Aperçu Responsive) */}
            {showPreviewModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">🔍</span>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 tracking-tight">Rendu Réel de l&apos;Email</h3>
                                    <p className="text-xs text-slate-400">Visualisez le rendu final de l&apos;e-mail tel qu&apos;il sera reçu.</p>
                                </div>
                            </div>
                            
                            {/* Device Mode Selectors */}
                            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                                <button
                                    type="button"
                                    onClick={() => setPreviewDeviceMode("desktop")}
                                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                        previewDeviceMode === "desktop"
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    🖥️ Bureau (640px)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewDeviceMode("mobile")}
                                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                        previewDeviceMode === "mobile"
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    📱 Mobile (380px)
                                </button>
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={() => setShowPreviewModal(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl"
                                title="Fermer"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Iframe Container */}
                        <div className="flex-1 bg-slate-100 p-8 flex items-center justify-center overflow-y-auto">
                            <div
                                style={{
                                    width: previewDeviceMode === "desktop" ? "640px" : "380px",
                                    transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                                }}
                                className="h-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 flex flex-col max-w-full"
                            >
                                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
                                    <div className="flex gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></span>
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                                    </div>
                                    <div className="bg-slate-100 px-3 py-0.5 rounded-md border border-slate-200 select-none">
                                        {previewDeviceMode === "desktop" ? "640px (Desktop Width)" : "380px (Mobile Width)"}
                                    </div>
                                    <div className="w-8"></div>
                                </div>
                                <iframe
                                    srcDoc={generateRealisticHtml()}
                                    className="w-full flex-1 border-0 bg-white"
                                    title="Real Email Preview"
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-white border-t border-slate-100 flex justify-end shrink-0">
                            <button
                                onClick={() => setShowPreviewModal(false)}
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                            >
                                Fermer l&apos;aperçu
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Livvic:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap');
                .quill-editor .ql-toolbar {
                    border: none !important;
                    border-bottom: 1px solid #e2e8f0 !important;
                    background: #f8fafc;
                }
                .quill-editor .ql-container {
                    border: none !important;
                    font-family: 'Livvic', sans-serif !important;
                }
                .quill-editor .ql-editor {
                    min-height: 240px;
                    font-family: 'Livvic', sans-serif !important;
                    font-size: 0.875rem !important;
                    font-weight: 300 !important;
                    line-height: 1.6;
                }
                .ql-editor strong,
                .ql-editor b {
                    font-weight: 600 !important;
                }
                .quill-editor .ql-editor.ql-blank::before {
                    font-family: 'Livvic', sans-serif !important;
                    font-size: 0.875rem !important;
                    font-weight: 300 !important;
                    font-style: normal !important;
                    color: #94a3b8 !important;
                }
                .quill-editor .ql-editor img {
                    max-width: 100%;
                    border-radius: 12px;
                }
            `}</style>
        </div>
    );
}

export default function AdminEmailsPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen bg-slate-50 items-center justify-center">Chargement...</div>}>
            <AdminEmailsContent />
        </Suspense>
    );
}
