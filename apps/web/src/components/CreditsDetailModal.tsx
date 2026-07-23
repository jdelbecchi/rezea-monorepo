"use client";

import React, { useMemo } from "react";
import { OrderItem, CreditAccount } from "@/lib/api";
import { formatCredits } from "@/lib/formatters";

interface CreditsDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders?: OrderItem[];
  credits?: CreditAccount | null;
  tenantColor?: string;
  backgroundColor?: string;
  onNavigateToPlanning?: () => void;
}

export default function CreditsDetailModal({
  isOpen,
  onClose,
  orders = [],
  credits,
  tenantColor = "#2563eb",
  backgroundColor,
  onNavigateToPlanning,
}: CreditsDetailModalProps) {
  // Process active orders into Offer Cards:
  // Each card displays:
  // - Top: Offer Name (Left) | Expiration Date (Right)
  // - Inside: List of activities with their credit balances
  const sortedOfferCards = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const cards: {
      orderId: string;
      offerName: string;
      endDate: string | null;
      isValidityUnlimited: boolean;
      activities: {
        name: string;
        credits: number | null;
        isUnlimited: boolean;
      }[];
    }[] = [];

    const safeOrders = Array.isArray(orders) ? orders : [];

    safeOrders.forEach((order) => {
      if (!order) return;
      
      // Exclude blocked or terminated/expired orders
      if (order.status === "resiliee" || order.status === "expiree" || order.is_blocked) return;

      const hasCredits =
        order.is_unlimited ||
        (order.balance !== null && order.balance !== undefined && Number(order.balance) > 0);
      if (!hasCredits) return;

      // Check if validity expired
      if (!order.is_validity_unlimited && order.end_date) {
        const endDate = new Date(order.end_date);
        if (!isNaN(endDate.getTime())) {
          endDate.setHours(23, 59, 59, 999);
          if (endDate < now) return;
        }
      }

      // Check if order has specific activity credits breakdown
      const actCreditsMap = (order as any).offer_snap_activity_credits || order.activity_credits;
      const hasSpecificActivityCredits =
        actCreditsMap &&
        typeof actCreditsMap === "object" &&
        Object.keys(actCreditsMap).length > 0 &&
        Object.entries(actCreditsMap).some(
          ([_, val]) => val !== null && val !== undefined && val.toString().trim() !== "" && Number(val) > 0
        );

      const activitiesList: { name: string; credits: number | null; isUnlimited: boolean }[] = [];

      if (hasSpecificActivityCredits) {
        // Calculate initial total to compute remaining ratio if credits have been consumed
        const totalInitial = Object.values(actCreditsMap).reduce(
          (acc: number, val: any) => acc + (Number(val) || 0),
          0
        );

        const currentBalance = order.balance !== null && order.balance !== undefined ? Number(order.balance) : totalInitial;
        const ratio = totalInitial > 0 ? currentBalance / totalInitial : 1;

        Object.entries(actCreditsMap).forEach(([act, val]) => {
          if (val !== null && val !== undefined && val.toString().trim() !== "" && Number(val) > 0) {
            const scaledCredits = Math.round(Number(val) * ratio);
            if (scaledCredits > 0 || order.is_unlimited) {
              activitiesList.push({
                name: act,
                credits: scaledCredits,
                isUnlimited: false,
              });
            }
          }
        });
      } else {
        const name =
          Array.isArray(order.allowed_activities) && order.allowed_activities.length > 0
            ? order.allowed_activities.join(", ")
            : "Toutes activités";

        activitiesList.push({
          name,
          credits: order.balance !== undefined && order.balance !== null ? Number(order.balance) : null,
          isUnlimited: !!order.is_unlimited,
        });
      }

      if (activitiesList.length > 0) {
        cards.push({
          orderId: order.id || Math.random().toString(),
          offerName: order.offer_name || "Offre",
          endDate: order.end_date || null,
          isValidityUnlimited: !!order.is_validity_unlimited,
          limitAmount: order.limit_amount ?? (order as any).offer_snap_limit_amount ?? null,
          limitPeriod: (order.limit_period || (order as any).offer_snap_limit_period || "mois").replace(/^\//, ""),
          activities: activitiesList,
        });
      }
    });

    // Sort offer cards by Expiration Date ascending (earliest first, unlimited last)
    return cards.sort((a, b) => {
      if (a.isValidityUnlimited && !b.isValidityUnlimited) return 1;
      if (!a.isValidityUnlimited && b.isValidityUnlimited) return -1;

      if (a.endDate && b.endDate) {
        const timeA = new Date(a.endDate).getTime();
        const timeB = new Date(b.endDate).getTime();
        if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) return timeA - timeB;
      } else if (a.endDate && !b.endDate) {
        return -1;
      } else if (!a.endDate && b.endDate) {
        return 1;
      }

      return (a.offerName || "").localeCompare(b.offerName || "");
    });
  }, [orders]);

  // ALWAYS calculate total balance by summing all active credit items displayed in the modal cards
  const totalBalance = useMemo(() => {
    let sum = 0;
    sortedOfferCards.forEach((card) => {
      card.activities.forEach((act) => {
        if (act.credits !== null && act.credits !== undefined) {
          const num = Number(act.credits);
          if (!isNaN(num)) {
            sum += num;
          }
        }
      });
    });
    return sum;
  }, [sortedOfferCards]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] border border-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-medium text-slate-900 tracking-tight">
              Mes crédits & validités
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Solde total :{" "}
              <span className="font-semibold text-slate-900">{formatCredits(totalBalance)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Offer Cards List */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {sortedOfferCards.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center">
              <span className="text-4xl mb-2 opacity-40">💳</span>
              <p className="text-sm font-semibold text-slate-700">Aucun crédit actif</p>
              <p className="text-xs text-slate-400 mt-1">
                Vous n'avez pas de pack de crédits en cours de validité.
              </p>
            </div>
          ) : (
            sortedOfferCards.map((card) => (
              <div key={card.orderId} className="space-y-1.5 pt-1">
                {/* Offer Header: Frameless Title (Left) | Expiration Date (Right) */}
                <div className="px-1 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 text-xs truncate capitalize">
                      {card.offerName}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 shrink-0 bg-slate-100 px-2 py-0.5 rounded-md">
                      {card.isValidityUnlimited ? (
                        <span className="text-emerald-600 font-semibold">Validité illimitée</span>
                      ) : card.endDate ? (
                        `Expire le ${new Date(card.endDate).toLocaleDateString("fr-FR")}`
                      ) : (
                        "Validité illimitée"
                      )}
                    </span>
                  </div>
                  {card.limitAmount !== null && card.limitAmount !== undefined && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5 text-slate-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19a8 8 0 0 1 16 0" />
                        <path d="m12 19-4.5-6.5" />
                        <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                      </svg>
                      <span>{formatCredits(card.limitAmount)} par {card.limitPeriod || "mois"}</span>
                    </div>
                  )}
                </div>

                {/* Activities List (Framed Card Container with richer custom tenant color) */}
                <div
                  className="p-3 space-y-2 rounded-2xl border border-slate-200/70 shadow-2xs overflow-hidden"
                  style={{ background: `linear-gradient(to right, ${tenantColor}24, ${tenantColor}0D)` }}
                >
                  {card.activities.map((act, actIdx) => (
                    <div
                      key={actIdx}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-medium text-slate-700 capitalize truncate">
                        {act.name}
                      </span>

                      <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200/60 px-2 py-0.5 rounded-lg shadow-2xs">
                        <span className="text-xs">💎</span>
                        <span className="font-semibold text-slate-900 text-[11px]">
                          {act.isUnlimited ? "Illimité" : `${formatCredits(act.credits)} crédit${(act.credits || 0) > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Fermer
          </button>
          {onNavigateToPlanning && (
            <button
              onClick={() => {
                onClose();
                onNavigateToPlanning();
              }}
              className="px-5 py-2.5 text-white text-xs font-semibold rounded-xl transition-all shadow-sm hover:opacity-90 active:scale-95 flex items-center gap-1.5"
              style={{ backgroundColor: tenantColor }}
            >
              <span>📅</span>
              <span>Réserver une séance</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
