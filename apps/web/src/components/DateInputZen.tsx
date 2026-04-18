"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  startOfToday,
  parseISO
} from "date-fns";
import { fr } from "date-fns/locale";

interface DateInputZenProps {
  value: string; // Expected "YYYY-MM-DD"
  onChange: (value: string) => void;
  label?: string;
}

export default function DateInputZen({ value, onChange, label }: DateInputZenProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse date safely
  const selectedDate = useMemo(() => {
    try {
      return value ? parseISO(value) : startOfToday();
    } catch (e) {
      return startOfToday();
    }
  }, [value]);

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(selectedDate));

  // Update current month if value changes externally
  useEffect(() => {
    setCurrentMonth(startOfMonth(selectedDate));
  }, [selectedDate]);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth)
    });
  }, [currentMonth]);

  const handleSelect = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  return (
    <div className="relative w-full">
      {label && <label className="block text-[11px] font-medium text-slate-400 mb-1.5 px-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all outline-none font-medium text-slate-700 bg-slate-50/50 text-sm md:text-base flex items-center justify-between group shadow-sm"
      >
        <span>{format(selectedDate, 'dd/MM/yyyy', { locale: fr })}</span>
        <span className="text-slate-400 group-hover:scale-110 transition-transform">🏁</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-slate-900/10 backdrop-blur-[2px] animate-in fade-in duration-200">
          {/* Backdrop click to close */}
          <div className="absolute inset-0" onClick={() => setIsOpen(false)}></div>
          
          <div 
            className="relative bg-white rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-100 p-6 w-full max-w-sm animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6 px-2">
              <h2 className="font-semibold text-slate-800 capitalize text-sm md:text-base tracking-tight">
                {format(currentMonth, 'MMMM yyyy', { locale: fr })}
              </h2>
              <div className="flex gap-1">
                <button 
                  type="button"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} 
                  className="w-9 h-9 flex items-center justify-center hover:bg-slate-50 rounded-full text-slate-400 transition-colors"
                >
                  ←
                </button>
                <button 
                  type="button"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} 
                  className="w-9 h-9 flex items-center justify-center hover:bg-slate-50 rounded-full text-slate-400 transition-colors"
                >
                  →
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-slate-300 py-3 uppercase tracking-tighter">{day}</div>
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
                    type="button"
                    onClick={() => handleSelect(day)}
                    className={`
                      relative p-2 rounded-2xl text-xs md:text-sm transition-all flex flex-col items-center justify-center aspect-square
                      ${isSelected ? 'bg-slate-100 text-slate-900 font-bold' : 'hover:bg-slate-50 text-slate-600 font-medium'}
                    `}
                  >
                    {day.getDate()}
                    {isToday && (
                      <div className={`absolute bottom-2 w-4 h-0.5 rounded-full ${isSelected ? 'bg-slate-400' : 'bg-slate-200'}`}></div>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-8 flex justify-center">
                <button 
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-10 py-3 bg-slate-900 text-white font-medium rounded-2xl text-xs shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95"
                >
                    Fermer
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
