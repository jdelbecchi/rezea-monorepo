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

export default function PlanningPage() {
  const params = useParams();
  const slug = params.slug;
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  // Persistance de la date
  useEffect(() => {
    const savedDate = localStorage.getItem('rezea_selected_date');
    if (savedDate) {
      const parsedDate = parseISO(savedDate);
      setSelectedDate(parsedDate);
      setCurrentMonth(startOfMonth(parsedDate));
    }
  }, []);

  const handleSetDate = (date: Date) => {
    setSelectedDate(date);
    localStorage.setItem('rezea_selected_date', date.toISOString());
  };
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Event[]>([]); // Current day events
  const [allUpcomingEvents, setAllUpcomingEvents] = useState<Event[]>([]); // All upcoming for registrations section
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditAccount | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    type: 'session' | 'event';
    title: string;
    description?: string;
    instructor?: string;
    location?: string;
    start?: string;
    duration?: string;
    credits?: number;
    spots?: number;
    max?: number;
  } | null>(null);

  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<{ id: string; title: string } | null>(null);
  const [locationFilter, setLocationFilter] = useState("all");

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
      
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);
      const sessionsData = await api.getSessions({ start_date: startDate.toISOString(), end_date: endDate.toISOString() });
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
      .filter(b => b.status === 'confirmed' || b.status === 'pending')
      .filter(b => {
           if (!b.session?.start_time) return false;
           const start = parseISO(b.session.start_time);
           // Ne montrer que ce qui commence dans le futur
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
              <Link href={`/${slug}/home`} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 active:scale-95 transition-all text-slate-400">
                  <span className="text-lg">←</span>
              </Link>
          </header>
      )}

      <main className={`flex-1 px-5 pb-5 md:p-12 ${!isAdminMode ? 'pt-16 md:pt-14' : ''}`}>
        <div className="max-w-6xl mx-auto">
          {!isAdminMode && (
              <div className="hidden md:flex items-center gap-2 mb-10">
                  <Link href={`/${slug}/home`} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-800 transition-colors group">
                      <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span>
                      Retour
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

              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="font-semibold text-slate-800 capitalize text-sm md:text-base">
                    {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">←</button>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">→</button>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
                    <div key={i} className="text-center text-[9px] font-bold text-slate-400 py-2 uppercase tracking-tighter">{day}</div>
                  ))}
                  {(() => {
                    const firstDay = startOfMonth(currentMonth).getDay();
                    const offset = firstDay === 0 ? 6 : firstDay - 1;
                    return Array.from({ length: offset }, (_, i) => (
                      <div key={`empty-${i}`} className="p-2 aspect-square" />
                    ));
                  })()}
                  {daysInMonth.map((day, i) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, startOfToday());
                    return (
                      <button
                        key={i}
                        onClick={() => handleSetDate(day)}
                        className={`
                          relative p-2 rounded-xl text-xs md:text-sm transition-all flex flex-col items-center justify-center aspect-square
                          ${isSelected ? 'bg-violet-600 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-700'}
                        `}
                      >
                        {day.getDate()}
                        {isToday && !isSelected && (
                          <div className="absolute bottom-1 w-1 h-1 bg-violet-600 rounded-full"></div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hidden md:flex flex-col gap-2 p-6 bg-slate-50 rounded-3xl border border-slate-100 relative overflow-hidden group shadow-sm transition-all hover:shadow-md">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                      <span className="text-4xl text-slate-900">💳</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium leading-none mb-1">Mes crédits</span>
                  <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold text-slate-900 leading-none">{formatCredits(credits?.balance)}</span>
                      <span className="text-xs text-slate-500 font-medium">unités</span>
                  </div>
                  <button 
                    onClick={() => window.location.href = `/${slug}/credits`}
                    className="mt-4 w-full py-3 bg-white text-slate-900 font-medium rounded-2xl text-xs shadow-sm hover:shadow-md hover:bg-violet-600 hover:text-white transition-all active:scale-95 border border-slate-100"
                  >
                    Recharger mon compte
                  </button>
              </div>
              
              <div className="md:hidden sticky top-14 z-30 -mx-5 px-5 py-0 bg-white/90 backdrop-blur-md flex items-center justify-between border-b border-slate-100/50">
                <div className="md:flex-1"></div>
                <div className="flex items-center gap-2 px-4 py-1 rounded-2xl">
                  <span className="text-sm text-slate-400 font-medium">Mes crédits :</span>
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

            <div className="space-y-6 pt-4 md:pt-2">
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1 mb-1">
                  <h3 className="flex items-center gap-2 font-medium text-slate-400 text-sm">
                    {format(selectedDate, 'eeee d MMMM', { locale: fr })}
                  </h3>
                  {loading && <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></div>}
                </div>

                {/* Location Filter Chips */}
                {!loading && tenant && (tenant.locations || []).length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
                    <button
                      onClick={() => setLocationFilter("all")}
                      className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                        locationFilter === "all" 
                          ? "bg-violet-600 text-white border-violet-600 shadow-md" 
                          : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      Tous les lieux
                    </button>
                    {(tenant.locations || []).map((loc: string) => (
                      <button
                        key={loc}
                        onClick={() => setLocationFilter(loc)}
                        className={`px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                          locationFilter === loc
                            ? "bg-violet-600 text-white border-violet-600 shadow-md"
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}

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
                    <p className="text-slate-500 text-xs">Aucun créneau programmé aujourd'hui.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
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
                      const spotsLeft = isEvent ? (item.max_places - item.registrations_count) : item.available_spots;
                      const isFull = isEvent ? (spotsLeft <= 0) : item.is_full;
                      const canWaitlist = !isEvent && item.allow_waitlist && isFull;
                      
                      // Gestion des délais limite
                      const now = new Date();
                      const limit = (isEvent ? tenant?.registration_limit_mins : tenant?.registration_limit_mins) || 0;
                      const startTime = parseISO(isEvent ? `${item.event_date}T${item.event_time}:00` : item.start_time);
                      const isClosed = isAfter(now, new Date(startTime.getTime() - limit * 60000));
                      
                      return (
                        <div key={item.id} className="group bg-white rounded-3xl shadow-sm border border-slate-100 py-2.5 px-4 md:p-2 relative transition-all hover:shadow-md hover:border-violet-100 overflow-hidden">
                          <div className="hidden md:flex items-center gap-6">
                            <div className="w-16">
                              <span className="text-slate-900 font-bold text-base tracking-tight">{time}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-2 min-w-0">
                                  <h4 className="font-medium text-base text-slate-800 first-letter:uppercase truncate">{item.title}</h4>
                                  {isEvent && <span className="text-base font-medium">✨</span>}
                               </div>
                            </div>
                            <div className="w-32 flex items-center gap-2 text-slate-400 text-sm truncate">
                               <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                               </svg>
                               <span className="truncate">{item.instructor_name}</span>
                            </div>
                            <div className="w-32 flex items-center gap-2 text-slate-400 text-sm truncate">
                               <span className="text-sm flex-shrink-0">📍</span>
                               <span className="truncate">{item.location || "N/A"}</span>
                            </div>
                            <div className="w-44 flex items-center justify-center">
                              <span className={`text-[11px] md:text-xs px-3 py-1 rounded-full font-semibold tracking-tight shadow-sm ${isFull ? 'text-rose-400 bg-rose-50/50' : (spotsLeft <= 3 ? 'text-amber-500 bg-amber-50/50' : 'text-emerald-500 bg-emerald-50/50')}`}>
                                {isFull ? (isEvent ? 'Event complet' : 'Séance complète') : `${spotsLeft} places dispos`}
                              </span>
                            </div>
                            <div className="w-14 flex items-center justify-end pr-2">
                              {!isEvent && item.credits_required > 0 && (
                                <div className="flex items-center gap-1.5 text-slate-400 font-black text-xs">
                                  <span className="text-sm">🎫</span>
                                  <span className="opacity-50 text-[10px]">x</span>
                                  <span className="text-slate-700 text-xs">{item.credits_required}</span>
                                </div>
                              )}
                            </div>
                            <div className="w-10">
                              <button 
                                onClick={() => {
                                  setSelectedItem({
                                    id: item.id,
                                    type: isEvent ? 'event' : 'session',
                                    title: item.title,
                                    description: item.description || "Aucune description.",
                                    instructor: item.instructor_name,
                                    location: item.location,
                                    start: time,
                                    duration: isEvent ? formatDuration(item.duration_minutes) : formatDuration(calculateDuration(item.start_time, item.end_time)),
                                    credits: item.credits_required || 0,
                                    spots: spotsLeft,
                                    max: isEvent ? item.max_places : item.max_participants
                                  });
                                  setShowModal(true);
                                }}
                                className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 transition-all rounded-full"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16h.01M12 8v4" />
                                </svg>
                              </button>
                            </div>
                             <div className="w-24 flex justify-end">
                               {booked ? (
                                  isWaitlisted ? (
                                    <div className="w-24 py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-100 shadow-sm">Sur liste</div>
                                  ) : isEvent ? (
                                    <div className="w-24 py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">Inscrit</div>
                                  ) : (
                                    <div className="w-24 py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">Réservé</div>
                                  )
                               ) : canWaitlist ? (
                                  <button 
                                      disabled={bookingLoading === item.id}
                                      onClick={() => handleBooking(item.id)}
                                      className="w-24 py-2 bg-amber-500 text-white font-medium rounded-xl text-[11px] shadow-sm hover:bg-amber-600 transition-all active:scale-95 text-center"
                                  >
                                      {bookingLoading === item.id ? "..." : "En attente"}
                                  </button>
                               ) : isFull ? (
                                  <div className="w-24"></div>
                               ) : (
                                     isEvent ? (
                                     <Link 
                                         href={`/${slug}/events/checkout/${item.id}`}
                                         className="w-24 py-2 bg-blue-600 text-white font-medium rounded-xl text-[11px] shadow-md hover:bg-blue-700 transition-all active:scale-95 text-center"
                                     >
                                         S’inscrire
                                     </Link>
                                   ) : (
                                     <button 
                                         disabled={bookingLoading === item.id}
                                         onClick={() => handleBooking(item.id)}
                                         className="w-24 py-2 bg-slate-900 text-white font-medium rounded-xl text-[11px] shadow-md hover:bg-slate-800 transition-all active:scale-95 text-center"
                                     >
                                         {bookingLoading === item.id ? "..." : "Réserver"}
                                     </button>
                                  )
                               )}
                             </div>
                          </div>

                          <div className="md:hidden flex flex-col gap-3 py-1">
                            {/* Line 1: Time and Title */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-slate-900 font-bold text-sm flex-shrink-0">{time}</span>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <h4 className="font-medium text-sm text-slate-800 first-letter:uppercase truncate">{item.title}</h4>
                                    {isEvent && <span className="text-sm font-medium">✨</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {!isEvent && item.credits_required > 0 && (
                                  <div className="flex items-center gap-1 text-slate-400 font-medium text-[10px]">
                                    <span>🎫</span>
                                    <span className="opacity-50 text-[10px]">x</span>
                                    <span className="text-slate-700 font-semibold">{item.credits_required}</span>
                                  </div>
                                )}
                                <button 
                                   onClick={() => {
                                     setSelectedItem({
                                       id: item.id,
                                       type: isEvent ? 'event' : 'session',
                                       title: item.title,
                                       description: item.description || "Aucune description.",
                                       instructor: item.instructor_name,
                                       location: item.location,
                                       start: time,
                                       duration: isEvent ? formatDuration(item.duration_minutes) : formatDuration(calculateDuration(item.start_time, item.end_time)),
                                       credits: item.credits_required || 0,
                                       spots: spotsLeft,
                                       max: isEvent ? item.max_places : item.max_participants
                                     });
                                     setShowModal(true);
                                   }}
                                   className="w-8 h-8 flex items-center justify-center rounded-full"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16h.01M12 8v4" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Line 2: Coach and Location */}
                            <div className="flex items-center gap-6 text-[11px] font-medium pl-1">
                              <span className="truncate text-slate-400 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {item.instructor_name}
                              </span>
                              {item.location && (
                                <span className="truncate text-slate-400 flex items-center gap-1.5">
                                  <span>📍</span>
                                  {item.location}
                                </span>
                              )}
                            </div>

                            {/* Line 3: Spots and Button */}
                            <div className="flex items-center justify-between">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm ${isFull ? 'text-rose-400 bg-rose-50/50 border-rose-100/50' : (spotsLeft <= 3 ? 'text-amber-500 bg-amber-50/50 border-amber-100/50' : 'text-emerald-500 bg-emerald-50/50 border-emerald-100/50')}`}>
                                <span className="text-xs">👥</span> {isFull ? 'Complet' : `${spotsLeft} PLACES`}
                              </span>

                              <div className="flex justify-end">
                                {booked ? (
                                   isWaitlisted ? (
                                     <div className="w-[84px] py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-100 shadow-sm">Sur liste</div>
                                   ) : isEvent ? (
                                     <div className="w-[84px] py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">Inscrit</div>
                                   ) : (
                                     <div className="w-[84px] py-2 rounded-xl text-[11px] font-medium flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">Réservé</div>
                                   )
                                ) : isClosed ? (
                                  <div className="w-[84px] py-2 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center bg-slate-100 text-slate-400 border border-slate-200 cursor-default">
                                    Fermé
                                  </div>
                                ) : canWaitlist ? (
                                   <button 
                                       disabled={bookingLoading === item.id}
                                       onClick={() => handleBooking(item.id)}
                                       className="w-[84px] py-2 bg-amber-500 text-white font-medium rounded-xl text-[11px] shadow-sm hover:bg-amber-600 transition-all active:scale-95 text-center"
                                   >
                                       {bookingLoading === item.id ? "..." : "En attente"}
                                   </button>
                                ) : isFull ? (
                                   <div className="w-[84px]"></div>
                                ) : (
                                     isEvent ? (
                                      <Link 
                                          href={`/${slug}/events/checkout/${item.id}`}
                                          className="w-[84px] py-2 bg-blue-600 text-white font-medium rounded-xl text-[11px] shadow-md hover:bg-blue-700 transition-all active:scale-95 text-center"
                                      >
                                          S’inscrire
                                      </Link>
                                    ) : (
                                      <button 
                                          disabled={bookingLoading === item.id}
                                          onClick={() => handleBooking(item.id)}
                                          className="w-[84px] py-2 bg-slate-900 text-white font-medium rounded-xl text-[11px] shadow-md hover:bg-slate-800 transition-all active:scale-95 text-center"
                                      >
                                          {bookingLoading === item.id ? "..." : "Réserver"}
                                      </button>
                                   )
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-20 mb-24 px-1">
                 <div className="flex items-center gap-3 mb-5">
                    <div className="flex items-center gap-2">
                       <span className="text-xl">📝</span>
                       <h3 className="font-medium text-slate-800 text-base tracking-tight">Mes inscriptions</h3>
                    </div>
                    <div className="h-px flex-1 bg-slate-100"></div>
                 </div>
                 
                 {myRegistrations.length === 0 ? (
                   <div className="bg-slate-50/50 rounded-3xl p-8 border border-dashed border-slate-200 text-center">
                     <p className="text-xs text-slate-400 font-medium italic">Aucune réservation pour le moment.</p>
                   </div>
                 ) : (
                    <div className="bg-white rounded-[2rem] border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
                      {myRegistrations.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between hover:bg-slate-50/50 transition-colors py-1.5 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                             <div className="flex-shrink-0 flex items-center justify-center w-5">
                                {item.uType === "event" ? (
                                  <span className="text-sm">✨</span>
                                ) : isWaitlistedStatus(item) ? (
                                  <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                             </div>
                             <div className="flex items-center gap-2 min-w-0">
                                <p className="text-[11px] md:text-sm font-medium text-slate-400 whitespace-nowrap">
                                   {item.start_time ? format(parseISO(item.start_time), "dd/MM/yy") : ""}
                                   <span className="mx-1 opacity-50">-</span>
                                   {item.start_time ? format(parseISO(item.start_time), "HH:mm") : ""}
                                </p>
                                <span className="mx-1 text-slate-200 opacity-50">-</span>
                                <p className="font-medium text-slate-800 text-sm md:text-base truncate">{item.title}</p>
                                {isWaitlistedStatus(item) && (
                                  <span className="ml-2 text-[10px] text-amber-600 font-medium opacity-80">(sur liste)</span>
                                )}
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

      {/* Detail Modal */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in duration-300 p-8 text-center">
              <div className="mb-8">
                 <h2 className="text-xl md:text-2xl font-medium text-slate-900 mb-2 leading-tight tracking-tight first-letter:uppercase">
                   {selectedItem.title}
                 </h2>
                 {selectedItem.type === 'event' && (
                   <p className="text-xs font-medium text-violet-400 flex items-center justify-center gap-2 mb-6">
                      événement <span className="text-sm">✨</span>
                   </p>
                 )}
                 
                 <div className="flex flex-wrap items-center justify-center gap-6 mb-8 text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🕒</span>
                      <span className="text-xs font-medium">{selectedItem.start}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">⏳</span>
                      <span className="text-xs font-medium">{selectedItem.duration}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-xs font-medium">{selectedItem.instructor}</span>
                    </div>
                    {selectedItem.location && (
                      <div className="flex items-center gap-2">
                        <span className="text-base transition-all group-hover:scale-110">📍</span>
                        <span className="text-xs font-medium">{selectedItem.location}</span>
                      </div>
                    )}
                 </div>

                 <div className="p-4 bg-slate-50/30 rounded-2xl border border-slate-100/30">
                    <p className="text-slate-500 text-[11px] md:text-xs leading-relaxed italic">
                      {selectedItem.description}
                    </p>
                 </div>
              </div>

              <button 
               onClick={() => setShowModal(false)}
               className="w-full py-4 bg-slate-900 text-white font-medium rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 text-xs"
              >
                 Fermer
              </button>
           </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && bookingToCancel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 p-8 text-center animate-in zoom-in duration-300">
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
