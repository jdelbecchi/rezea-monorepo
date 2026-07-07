const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds

export const getSessionFilter = <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
        const lastActivityStr = sessionStorage.getItem("filter_last_activity");
        if (lastActivityStr) {
            const lastActivity = parseInt(lastActivityStr, 10);
            if (Date.now() - lastActivity > INACTIVITY_TIMEOUT) {
                // Clear all filters from sessionStorage if expired
                const keysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const sKey = sessionStorage.key(i);
                    if (sKey && sKey.startsWith("filter_")) {
                        keysToRemove.push(sKey);
                    }
                }
                keysToRemove.forEach(k => sessionStorage.removeItem(k));
                sessionStorage.removeItem("filter_last_activity");
                return defaultValue;
            }
        }
        
        const item = sessionStorage.getItem(`filter_${key}`);
        if (item === null) return defaultValue;
        return JSON.parse(item) as T;
    } catch (e) {
        return defaultValue;
    }
};

export const setSessionFilter = (key: string, value: any): void => {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(`filter_${key}`, JSON.stringify(value));
        sessionStorage.setItem("filter_last_activity", Date.now().toString());
    } catch (e) {
        // ignore
    }
};

export const updateLastActivity = (): void => {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem("filter_last_activity", Date.now().toString());
    } catch (e) {
        // ignore
    }
};
