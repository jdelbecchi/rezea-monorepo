"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import { api, Session, Event, User, CreditAccount, Tenant, Booking } from "@/lib/api";
import { formatDuration, calculateDuration, formatCredits } from "@/lib/formatters";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfToday,
  addDays,
  isAfter,
  parseISO
} from "date-fns";
import { fr } from "date-fns/locale";

const DiamondToken = ({ className = "w-5 h-5" }: { className?: string }) => (
  <div className={`flex items-center justify-center shrink-0 ${className}`}>
    <span className="text-sm">💎</span>
  </div>
);

export default function PlanningPage() {
  const params = useParams();
  const slug = params.slug;
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [currentMonth, setCurrentMonth] = useState(startOfToday());

  // La date par défaut est aujourd'hui à chaque accès

  const handleSetDate = (date: Date) => {
    setSelectedDate(date);
  };
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Event[]>([]); // Current day events
  const [allUpcomingEvents, setAllUpcomingEvents] = useState<Event[]>([]); // All upcoming for registrations section
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditAccount | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<{ id: string; title: string } | null>(null);
  const [locationFilter, setLocationFilter] = useState("all");
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);

  useEffect(() => {
    const initData = async () => {
      try {
        const [userData, creditData, tenantData, bookingsData, upcomingEventsData] = await Promise.all([
          api.getCurrentUser(),
          api.getCreditAccount(),
          api.getTenantSettings(),
          api.getMyBookings(),
          api.getUpcomingEvents()
        ]);
        setUser(userData);
        setCredits(creditData);
        setTenant(tenantData);
        setMyBookings(bookingsData);
        setAllUpcomingEvents(upcomingEventsData);
      } catch (err) {
        console.error("Error loading profile info", err);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    const fetchPlanning = async () => {
      setLoading(true);
      setError(null);
      try {
        const start = format(selectedDate, "yyyy-MM-dd") + "T00:00:00";
        const end = format(selectedDate, "yyyy-MM-dd") + "T23:59:59";
        
        const [sessionsData, eventsData] = await Promise.all([
          api.getSessions({ start_date: start, end_date: end }),
          allUpcomingEvents.length > 0 ? Promise.resolve(allUpcomingEvents) : api.getUpcomingEvents()
        ]);
        
        if (allUpcomingEvents.length === 0) setAllUpcomingEvents(eventsData);
        
        setSessions(sessionsData);
        const dayEvents = eventsData.filter(e => isSameDay(parseISO(e.event_date), selectedDate));
        setEvents(dayEvents);
      } catch (err) {
        setError("Impossible de charger le planning.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlanning();
  }, [selectedDate, allUpcomingEvents.length === 0]);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const refreshData = async () => {
      const [newCredits, newBookings, upcomingEventsData] = await Promise.all([
        api.getCreditAccount(),
        api.getMyBookings(),
        api.getUpcomingEvents()
      ]);
      setCredits(newCredits);
      setMyBookings(newBookings);
      setAllUpcomingEvents(upcomingEventsData);
      
      // Assurer le même format de date que fetchPlanning pour éviter les décalages de cache/timezone
      const start = format(selectedDate, "yyyy-MM-dd") + "T00:00:00";
      const end = format(selectedDate, "yyyy-MM-dd") + "T23:59:59";
      const sessionsData = await api.getSessions({ start_date: start, end_date: end });
      setSessions(sessionsData);
  };

  const handleBooking = async (sessionId: string) => {
    setBookingLoading(sessionId);
    setError(null);
    setSuccess(null);
    let successState = false;
    try {
      await api.createBooking(sessionId);
      setSuccess("Séance réservée avec succès !");
      setTimeout(() => setSuccess(null), 3000);
      successState = true;
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de la réservation.");
    } finally {
      setBookingLoading(null);
    }

    if (successState) {
        try {
            await refreshData();
        } catch (err) {
            console.error("Refresh failed after booking", err);
        }
    }
  };

  const openCancelModal = (id: string, title: string) => {
    setBookingToCancel({ id, title });
    setShowCancelModal(true);
  };

  const handleCancelBooking = async () => {
    if (!bookingToCancel) return;
    
    setBookingLoading(bookingToCancel.id);
    setError(null);
    let successState = false;
    try {
      await api.cancelBooking(bookingToCancel.id);
      setShowCancelModal(false);
      setBookingToCancel(null);
      setSuccess("Inscription annulée.");
      setTimeout(() => setSuccess(null), 3000);
      successState = true;
    } catch (err: any) {
      setError(err.response?.data?.detail || "Impossible d'annuler (délai dépassé ?)");
      setShowCancelModal(false);
    } finally {
      setBookingLoading(null);
    }

    if (successState) {
        try {
            await refreshData();
        } catch (err) {
            console.error("Refresh failed after cancellation", err);
        }
    }
  };

  const isAlreadyBooked = (sessionId: string) => {
    return myBookings.some(b => b.session_id === sessionId && (b.status === 'confirmed' || b.status === 'pending'));
  };

  const isWaitlistedStatus = (booking: Booking | any) => booking.status === 'pending' || booking.status === 'waiting_list';

  const isAdminMode = false;

  const myRegistrations = useMemo(() => {
    const now = new Date();
    
    const futureBookings = myBookings
      .filter(b => (b.status === 'confirmed' || b.status === 'pending'))
      .filter(b => {
           if (!b.session?.start_time) return false;
           const start = parseISO(b.session.start_time);
           return isAfter(start, now);
      })
        .map(b => ({
            id: b.id,
            title: b.session?.title || 'Séance',
            start_time: b.session?.start_time,
            uType: 'session',
            status: b.status
        }));
        
      const registeredEvents = allUpcomingEvents
        .filter(e => e.is_registered)
        .map(e => ({
            id: e.id,
            title: e.title,
            start_time: `${format(parseISO(e.event_date), 'yyyy-MM-dd')}T${e.event_time}:00`,
            uType: 'event',
            status: 'confirmed'
        }));
        
      return [...futureBookings, ...registeredEvents].sort((a: any, b: any) => {
        const dateA = a.start_time ? parseISO(a.start_time).getTime() : 0;
        const dateB = b.start_time ? parseISO(b.start_time).getTime() : 0;
        return dateA - dateB;
      });
  }, [myBookings, allUpcomingEvents]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-white overflow-x-hidden pb-20 md:pb-0">
      {isAdminMode && <Sidebar user={user} tenant={tenant} />}
      
      {!isAdminMode && (
          <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 flex items-center px-4 z-40 md:hidden safe-top shadow-sm">
              <Link href={`/${slug}/home`} className="flex items-center gap-2 group text-slate-400 active:scale-95 transition-all">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-[13px] font-medium leading-none">Retour</span>
              </Link>
          </header>
      )}

      <main className={`flex-1 px-5 pb-5 md:p-12 ${!isAdminMode ? 'pt-16 md:pt-14' : ''}`}>
        <div className="max-w-6xl mx-auto">
          {!isAdminMode && (
              <div className="hidden md:flex items-center gap-2 mb-10">
                  <Link href={`/${slug}/home`} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 transition-transform group-hover:-translate-x-1" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="leading-none">Retour</span>
                  </Link>
              </div>
          )}

          <div className="md:grid md:grid-cols-[320px_1fr] md:gap-10 items-start">
            <aside className="md:sticky md:top-14 space-y-6">
              <header className="px-1 space-y-1">
                <h1 className="text-xl md:text-2xl font-medium text-slate-900 tracking-tight flex items-center gap-2">
                  <span className="text-2xl md:text-3xl">🗓️</span> Planning
                </h1>
                <p className="text-slate-500 font-medium text-[11px] md:text-xs">Réservez vos séances et évènements</p>
              </header>

              <div className="bg-white -mx-5 md:mx-0 rounded-none md:rounded-3xl shadow-xl shadow-blue-900/10 border-b md:border border-slate-200 p-4 md:p-2">
                <div className="flex items-center justify-between mb-1 px-2">
                  <h2 className="font-semibold text-slate-800 capitalize text-[13px] md:text-sm">
                    {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                  </h2>
                  <div className="flex gap-1">
                    <button onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">←</button>
                    <button onClick={handleNextMonth} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">→</button>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-0.5 md:gap-1">
                  {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
                    <div key={i} className="text-center text-[9px] md:text-[10px] font-bold text-slate-400 py-1 uppercase tracking-tight">{day}</div>
                  ))}
                  {(() => {
                    const firstDay = startOfMonth(currentMonth).getDay();
                    const offset = firstDay === 0 ? 6 : firstDay - 1;
                    return Array.from({ length: offset }, (_, i) => (
                      <div key={`empty-${i}`} className="p-1 md:p-2 md:aspect-square" />
                    ));
                  })()}
                  {daysInMonth.map((day, i) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, startOfToday());
                    const clubColor = tenant?.primary_color;
                    if (!clubColor && isToday && !isSelected) {
                        return (
                          <button
                            key={i}
                            onClick={() => handleSetDate(day)}
                            className="relative py-2 md:py-0 rounded-xl text-xs md:text-sm transition-all flex flex-col items-center justify-center md:aspect-square hover:bg-slate-50 text-slate-700 font-bold"
                          >
                            <span>{day.getDate()}</span>
                            <div className="absolute bottom-1 w-3 md:w-5 h-[2px] rounded-full bg-slate-200" />
                          </button>
                        );
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => handleSetDate(day)}
                        className={`
                          relative py-2 md:py-0 rounded-xl text-xs md:text-sm transition-all flex flex-col items-center justify-center md:aspect-square
                          ${isSelected ? 'shadow-lg text-white font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'}
                        `}
                        style={{ 
                          backgroundColor: isSelected ? clubColor : undefined,
                          color: isSelected ? 'white' : (isToday ? clubColor : undefined)
                        }}
                      >
                        <span>{day.getDate()}</span>
                        {isToday && (
                          <div 
                            className={`absolute bottom-1 w-3 md:w-5 h-[2px] rounded-full ${isSelected ? 'bg-white' : ''}`}
                            style={{ backgroundColor: !isSelected ? clubColor : undefined }}
                          ></div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hidden md:flex flex-col gap-2 p-6 bg-slate-50 rounded-3xl border border-slate-100 relative overflow-hidden group shadow-sm transition-all hover:shadow-md !mt-10">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                      <DiamondToken className="w-12 h-12" />
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium leading-none mb-1 flex items-center gap-1.5">
                    Mes crédits <DiamondToken className="w-4 h-4" />
                  </span>
                  <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold text-slate-900 leading-none">{formatCredits(credits?.balance)}</span>
                      <span className="text-xs text-slate-500 font-medium">unités</span>
                  </div>
                  <button 
                    onClick={() => window.location.href = `/${slug}/credits`}
                    className="mt-4 w-full py-3 text-white font-medium rounded-2xl text-xs transition-all active:scale-95 shadow-lg"
                    style={{ 
                        backgroundColor: tenant?.primary_color || '#2563eb',
                        boxShadow: `0 4px 12px ${(tenant?.primary_color || '#2563eb')}40`
                    }}
                  >
                    Recharger mon compte
                  </button>
              </div>
              
              <div className="md:hidden sticky top-14 z-30 -mx-5 px-5 py-0 bg-white/90 backdrop-blur-md flex items-center justify-between mt-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                <div className="md:flex-1"></div>
                <div className="flex items-center gap-2 px-4 py-1 rounded-2xl">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-400 font-medium whitespace-nowrap">Mes crédits</span>
                    <DiamondToken className="w-4 h-4" />
                    <span className="text-sm text-slate-400 font-medium">:</span>
                  </div>
                  <span className="text-sm md:text-base font-semibold text-slate-900">{formatCredits(credits?.balance)}</span>
                  <button 
                    onClick={() => window.location.href = `/${slug}/credits`}
                    className="w-7 h-7 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full text-lg font-medium shadow-sm shadow-slate-100 hover:bg-slate-200 active:scale-95 transition-all ml-1"
                  >
                    +
                  </button>
                </div>
              </div>
            </aside>

            <div className="space-y-4 pt-2 md:pt-1">
              <div className="space-y-3">
                <div className="h-px w-full md:hidden mb-4" style={{ backgroundColor: `${tenant?.primary_color || '#2563eb'}30` }}></div>
                <div className="flex items-center justify-between gap-4 px-1 mb-4">
                  <h3 className="font-medium text-slate-400 text-sm lowercase whitespace-nowrap">
                    {format(selectedDate, 'eeee d MMMM', { locale: fr })}
                  </h3>
                  
                  {!loading && tenant && (tenant.locations || []).length > 1 && (
                    <div className="relative inline-block w-auto shrink-0">
                      <button 
                        onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}
                        className="flex items-center justify-between bg-white border border-slate-100 text-slate-600 text-[11px] md:text-[12px] font-medium rounded-2xl px-3 md:px-4 py-2 md:py-2.5 outline-none transition-all cursor-pointer shadow-sm hover:shadow-md hover:border-slate-200 gap-2"
                      >
                        <span className="truncate max-w-[100px] md:max-w-[150px]">
                          {locationFilter === "all" ? "Tous les lieux" : locationFilter}
                        </span>
                        <svg className={`w-3 h-3 md:w-4 md:h-4 text-slate-400 transition-transform duration-200 ${isLocationMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isLocationMenuOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setIsLocationMenuOpen(false)}
                          />
                          <div className="absolute top-full right-0 mt-2 z-50 w-48 md:w-64 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 p-2 animate-in fade-in slide-in-from-top-2">
                            <button
                              onClick={() => {
                                setLocationFilter("all");
                                setIsLocationMenuOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-colors ${
                                locationFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              Tous les lieux
                            </button>
                            {(tenant.locations || []).map((loc: string) => (
                              <button
                                key={loc}
                                onClick={() => {
                                  setLocationFilter(loc);
                                  setIsLocationMenuOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 rounded-xl text-[12px] font-medium transition-colors mt-1 ${
                                  locationFilter === loc ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {loc}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {loading && <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>}
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <span>⚠️</span> {error}
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <span>✅</span> {success}
                  </div>
                )}

                {loading ? (
                  <div className="space-y-4 animate-pulse">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-slate-50 rounded-3xl"></div>
                    ))}
                  </div>
                ) : sessions.length === 0 && events.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300">
                    <p className="text-slate-500 text-xs italic">Aucun créneau programmé aujourd'hui.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[
                      ...events.map(e => ({ ...e, uType: 'event' })),
                      ...sessions.map(s => ({ ...s, uType: 'session' }))
                    ]
                    .filter(item => locationFilter === 'all' || item.location === locationFilter)
                    .sort((a: any, b: any) => {
                        const timeA = a.uType === 'event' ? a.event_time : format(parseISO(a.start_time), 'HH:mm');
                        const timeB = b.uType === 'event' ? b.event_time : format(parseISO(b.start_time), 'HH:mm');
                        return timeA.localeCompare(timeB);
                    })
                    .map((item: any) => {
                      const isEvent = item.uType === 'event';
                      const time = isEvent ? item.event_time : format(parseISO(item.start_time), 'HH:mm');
                      const booked = isEvent ? item.is_registered : isAlreadyBooked(item.id);
                      const isWaitlisted = !isEvent && myBookings.find(b => b.session_id === item.id && (b.status === 'confirmed' || b.status === 'pending'))?.status === 'pending';
                      const spotsLeft = isEvent ? (item.max_places - (item.registrations_count || 0)) : item.available_spots;
                      const isFull = isEvent ? (spotsLeft <= 0) : item.is_full;
                      const canWaitlist = !isEvent && item.allow_waitlist && isFull;
                      
                      const now = new Date();
                      const limit = (isEvent ? (tenant?.registration_limit_mins || 0) : (tenant?.registration_limit_mins || 0));
                      const startTime = parseISO(isEvent ? `${item.event_date}T${item.event_time}:00` : item.start_time);
                      const isClosed = isAfter(now, new Date(startTime.getTime() - limit * 60000));
                      
                      const isExpanded = !!expandedItems[item.id];
                      const durationValue = isEvent ? item.duration_minutes : calculateDuration(item.start_time, item.end_time);

                      const handleToggleExpand = () => {
                        setExpandedItems(prev => ({
                          ...prev,
                          [item.id]: !prev[item.id]
                        }));
                      };

                      return (
                        <div 
                          key={item.id} 
                          className={`group ${isEvent ? 'bg-gradient-to-b from-amber-50/80 via-amber-50/40 to-white border-amber-200/50' : 'bg-white border-slate-200/60'} rounded-2xl border transition-all duration-500 hover:shadow-xl flex flex-col overflow-hidden`}
                          style={{ 
                            boxShadow: isEvent ? `3px 4px 14px -2px #f59e0b30` : `3px 4px 14px -2px ${(tenant?.primary_color || '#2563eb')}40`,
                          }}
                        >
                          {/* 1. HEADER : Heure + Titre */}
                          <div className="px-5 pt-3 pb-1">
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-bold text-slate-900 tracking-tight">{time}</span>
                              <div className="flex items-center gap-2 min-w-0">
                                 {isEvent && <span className="text-base md:text-lg">✨</span>}
                                 <h4 className="text-sm md:text-base font-medium text-slate-800 first-letter:uppercase leading-tight">{item.title}</h4>
                              </div>
                            </div>
                          </div>

                          {/* 2. RÉSUMÉ : Durée, Crédits | Bouton + d'infos */}
                          <div className="px-5 py-1 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                              <div className="flex items-center gap-2 text-slate-600 font-medium text-[11px] md:text-xs">
                                <span className="text-sm opacity-60">🕒</span>
                                <span>{formatDuration(durationValue)}</span>
                              </div>
                              {!isEvent && item.credits_required > 0 && (
                                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[11px] md:text-xs">
                                  <DiamondToken className="w-5 h-5" />
                                  <span>{formatCredits(item.credits_required)}</span>
                                </div>
                              )}
                            </div>

                            <button 
                              onClick={handleToggleExpand}
                              className="px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all active:scale-95 flex items-center gap-1.5 bg-slate-200 text-slate-600"
                            >
                              <span>{isExpanded ? '-' : '+'} info</span>
                            </button>
                          </div>

                          {/* 3. ACCORDÉON (Détails) */}
                          <div className={`px-5 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] mb-1 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="pt-0.5 space-y-1.5 pb-2">
                              <div className="flex flex-wrap items-center gap-y-1 gap-x-6">
                                <div className="flex items-center gap-2 text-slate-600 text-sm font-normal">
                                  <svg className="w-5 h-5 shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  <span>{item.instructor_name}</span>
                                </div>
                                {item.location && (
                                  <div className="flex items-center gap-2 text-slate-600 text-sm font-normal">
                                    <span className="text-base opacity-60">📍</span>
                                    <span>{item.location}</span>
                                  </div>
                                )}
                              </div>

                              {item.description && (
                                <div className="px-4 py-2 bg-slate-100/80 rounded-xl border border-slate-200/50">
                                  <p className="text-slate-600 text-[11px] md:text-xs leading-relaxed italic text-center">
                                    {item.description}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 4. ACTION FOOTER (Séparateur + Places + Bouton) */}
                          <div className="px-5 py-2.5 bg-slate-50/10 flex items-center justify-between gap-4 mt-auto">
                            <span 
                              className={`text-xs md:text-sm font-medium tracking-tight ${
                                isFull ? 'text-slate-500 font-medium' : (spotsLeft <= 3 ? 'text-amber-500' : 'text-emerald-500')
                              }`}
                            >
                              {isFull ? (isEvent ? 'Événement complet' : 'Séance complète') : `${spotsLeft} place${spotsLeft > 1 ? 's' : ''} dispo${spotsLeft > 1 ? 's' : ''}`}
                            </span>

                            <div className="shrink-0">
                                {booked ? (
                                   isWaitlisted ? (
                                     <div className="py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-100 shadow-sm w-[90px]">Sur liste</div>
                                   ) : (
                                     <div className="py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm w-[90px]">
                                        {isEvent ? 'Inscrit' : 'Inscrit'}
                                     </div>
                                   )
                                ) : isClosed ? (
                                  <div className="py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-slate-100 text-slate-400 border border-slate-200 cursor-default opacity-50 w-[90px]">
                                    Fermé
                                  </div>
                                ) : canWaitlist ? (
                                   <div className="flex items-center gap-3">
                                       <span className="text-[10px] md:text-xs text-slate-500 italic font-medium">S'inscrire en liste d'attente ?</span>
                                       <button 
                                           disabled={bookingLoading === item.id}
                                           onClick={() => handleBooking(item.id)}
                                           className="px-4 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium rounded-full text-[11px] transition-all active:scale-95 border border-amber-200/50"
                                       >
                                           {bookingLoading === item.id ? "..." : "oui"}
                                       </button>
                                   </div>
                                ) : isFull ? (
                                   <span className="text-[10px] text-slate-300 italic">Complet</span>
                                ) : (
                                   isEvent ? (
                                    <Link 
                                        href={`/${slug}/events/checkout/${item.id}`}
                                        className="block py-2 bg-slate-900 text-white font-medium rounded-xl text-[11px] shadow-md hover:bg-slate-800 transition-all active:scale-95 w-[90px] text-center"
                                    >
                                        S'inscrire
                                    </Link>
                                  ) : (
                                    <button 
                                        disabled={bookingLoading === item.id}
                                        onClick={() => handleBooking(item.id)}
                                        className="py-2 bg-slate-900 text-white font-medium rounded-xl text-[11px] shadow-md hover:bg-slate-800 transition-all active:scale-95 w-[90px] text-center"
                                    >
                                        {bookingLoading === item.id ? "..." : "Réserver"}
                                    </button>
                                 )
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-8 mb-20 px-1">
                  <div className="h-px w-full mb-8" style={{ backgroundColor: `${tenant?.primary_color || '#2563eb'}30` }}></div>
                 <div className="flex items-center gap-2 mb-5">
                    <span className="text-xl">📝</span>
                    <h3 className="font-medium text-slate-800 text-base tracking-tight">Mes inscriptions à venir</h3>
                 </div>
                 
                 {myRegistrations.length === 0 ? (
                   <div className="bg-slate-50/50 rounded-2xl p-8 border border-dashed border-slate-200 text-center">
                     <p className="text-xs text-slate-400 font-medium italic">Aucune réservation pour le moment.</p>
                   </div>
                 ) : (
                    <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
                      {myRegistrations.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between hover:bg-slate-50/50 transition-colors py-2 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                             <div className="flex-shrink-0 flex items-center justify-center w-5">
                                {item.uType === "event" ? (
                                  <span className="text-sm">✨</span>
                                ) : isWaitlistedStatus(item) ? (
                                   <span className="text-sm">⌛</span>
                                ) : (
                                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                             </div>
                             <div className="flex items-center gap-2 min-w-0">
                                <p className="text-[11px] md:text-sm font-medium text-slate-600 whitespace-nowrap">
                                   {item.start_time ? format(parseISO(item.start_time), "dd/MM") : (item.event_date ? format(parseISO(item.event_date), "dd/MM") : "")}
                                   <span className="mx-1 opacity-50">-</span>
                                   {item.start_time ? format(parseISO(item.start_time), "HH:mm") : (item.event_time ? item.event_time : "")}
                                </p>
                                <span className="mx-1 text-slate-200 opacity-50">-</span>
                                <p className="font-medium text-slate-800 text-sm md:text-base truncate">{item.title}</p>
                              </div>
                           </div>
                          {item.uType === "session" && (() => {
                            const now = new Date();
                            const limit = tenant?.cancellation_limit_mins || 0;
                            const startTime = parseISO(item.start_time);
                            const isCancellationClosed = isAfter(now, new Date(startTime.getTime() - limit * 60000));
                            
                            if (isCancellationClosed) return null;
                            
                            return (
                              <button 
                                 onClick={() => openCancelModal(item.id, item.title)}
                                 className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                                 title="Annuler ma réservation"
                              >
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                 </svg>
                              </button>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                 )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && bookingToCancel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 p-8 text-center animate-in zoom-in duration-300">
              <h2 className="text-xl md:text-2xl font-medium text-slate-900 mb-2 tracking-tight">Annuler l'inscription</h2>
              <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
                Confirmer l'annulation de <span className="text-slate-900 font-bold truncate inline-block max-w-[200px] align-bottom">"{bookingToCancel.title}"</span> ?
              </p>

              <div className="flex gap-4 mt-auto">
                <button 
                  onClick={() => {
                    setShowCancelModal(false);
                    setBookingToCancel(null);
                  }}
                  className="flex-1 py-4 bg-slate-100 text-slate-400 font-medium rounded-2xl hover:bg-slate-200 transition-all text-xs"
                >
                  Garder ma place
                </button>
                <button 
                  disabled={bookingLoading === bookingToCancel.id}
                  onClick={handleCancelBooking}
                  className="flex-1 py-4 bg-rose-500 text-white font-medium rounded-2xl hover:bg-rose-600 transition-all shadow-xl shadow-rose-100/50 text-xs disabled:opacity-50"
                >
                  {bookingLoading === bookingToCancel.id ? "Annulation..." : "Oui, annuler"}
                </button>
              </div>
           </div>
        </div>
      )}

      <BottomNav userRole={user?.role} />

      <style jsx global>{`
          @supports (-webkit-touch-callout: none) {
              .safe-top { padding-top: env(safe-area-inset-top); }
              .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
          }
      `}</style>
    </div>
  );
}
