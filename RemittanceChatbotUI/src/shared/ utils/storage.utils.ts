// storage.utils.ts
/**
 * Save data to localStorage with expiration
 */
export function saveToStorage<T>(key: string, data: T, expirationMinutes?: number): void {
    if (typeof window === 'undefined') return;

    const item = {
        data,
        timestamp: new Date().getTime(),
        expires: expirationMinutes ? new Date().getTime() + (expirationMinutes * 60 * 1000) : null
    };

    try {
        localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

/**
 * Get data from localStorage, respecting expiration
 */
export function getFromStorage<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    try {
        const storedItem = localStorage.getItem(key);
        if (!storedItem) return null;

        const item = JSON.parse(storedItem);

        // Check if the item has expired
        if (item.expires && item.expires < new Date().getTime()) {
            localStorage.removeItem(key);
            return null;
        }

        return item.data as T;
    } catch (error) {
        console.error('Error retrieving from localStorage:', error);
        return null;
    }
}

/**
 * Remove an item from localStorage
 */
export function removeFromStorage(key: string): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error removing from localStorage:', error);
    }
}

/**
 * Clear all expired items from localStorage
 */
export function clearExpiredItems(): void {
    if (typeof window === 'undefined') return;

    try {
        const now = new Date().getTime();

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const storedItem = localStorage.getItem(key);
                if (storedItem) {
                    try {
                        const item = JSON.parse(storedItem);
                        if (item.expires && item.expires < now) {
                            localStorage.removeItem(key);
                        }
                    } catch (e) {
                        // Skip if not a valid JSON or doesn't have the expected structure
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error clearing expired items:', error);
    }
}