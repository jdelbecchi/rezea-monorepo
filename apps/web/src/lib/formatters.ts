/**
 * Formate une durée en minutes en une chaîne lisible (ex: 45 min, 1h, 1h30)
 */
export const formatDuration = (minutes: number): string => {
    if (!minutes || minutes <= 0) return "—";
    
    if (minutes < 60) {
        return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (mins === 0) {
        return `${hours}h`;
    }
    
    // Format "1h30" ou "1h05"
    return `${hours}h${mins < 10 ? '0' + mins : mins}`;
};

/**
 * Calcule la durée en minutes entre deux dates
 */
export const calculateDuration = (start: string | Date, end: string | Date): number => {
    const s = typeof start === 'string' ? new Date(start) : start;
    const e = typeof end === 'string' ? new Date(end) : end;
    
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    
    return Math.round((e.getTime() - s.getTime()) / 60000);
};

/**
 * Formate un solde de crédits (supprime .00 si entier)
 */
export const formatCredits = (balance: any): string => {
    if (balance === null || balance === undefined) return "0";
    const num = Number(balance);
    if (isNaN(num)) return "0";
    
    // Si c'est un entier, on enlève les décimales
    if (num % 1 === 0) {
        return num.toString();
    }
    
    // Sinon on garde 2 décimales (ex: 1.50)
    return num.toFixed(2).replace(/\.00$/, "");
};

/**
 * Formate un prix en centimes (ex: 1000 -> 10€, 1050 -> 10.50€, 0 -> OFFERT)
 */
export const formatPrice = (cents: number | null | undefined): string => {
    if (cents === 0) return "Offert";
    if (cents === null || cents === undefined) return "—";
    
    const amount = cents / 100;
    const formattedAmount = amount % 1 === 0 ? amount.toString() : amount.toFixed(2);
    return `${formattedAmount}€`;
};
