"use client";

import { useState, useRef, useEffect } from "react";

interface Option {
    id: string;
    label: string;
}

interface MultiSelectProps {
    label?: string;
    options: Option[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
    className?: string;
    icon?: string | React.ReactNode;
}

export default function MultiSelect({
    label,
    options,
    selected,
    onChange,
    placeholder = "Tous",
    className = "",
    icon,
}: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (id: string) => {
        if (id === "all") {
            onChange([]);
        } else {
            if (selected.includes(id)) {
                onChange(selected.filter((item) => item !== id));
            } else {
                onChange([...selected, id]);
            }
        }
    };

    const getDisplayText = () => {
        if (selected.length === 0) return placeholder;
        if (selected.length === 1) {
            const opt = options.find((o) => o.id === selected[0]);
            return opt ? opt.label : selected[0];
        }
        return `${selected.length} sélectionnés`;
    };

    return (
        <div className="relative inline-block w-full" ref={containerRef}>
            {label && <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-400 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none ${icon ? 'pl-8' : ''} ${className}`}
            >
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                        {icon}
                    </div>
                )}
                <span className={`truncate ${selected.length === 0 ? "text-slate-400" : "text-slate-700"}`}>
                    {getDisplayText()}
                </span>
                <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg p-2 max-h-60 overflow-y-auto">
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                        <input
                            type="checkbox"
                            checked={selected.length === 0}
                            onChange={() => {
                                onChange([]);
                                // Optionally close on "All" if you want
                                // setIsOpen(false);
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300"
                        />
                        <span className="text-sm font-medium text-slate-700">{placeholder}</span>
                    </label>
                    <div className="my-1 border-t border-gray-100" />
                    <div className="space-y-1">
                        {options.map((opt) => (
                            <label
                                key={opt.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.includes(opt.id)}
                                    onChange={() => toggleOption(opt.id)}
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-700">{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
