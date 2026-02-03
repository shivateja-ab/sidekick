/**
 * Local caching logic using IndexedDB
 */

import { config } from './config.js';

class CacheManager {
    constructor() {
        this.dbName = 'sidekick-cache';
        this.storeName = 'images';
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     * @returns {Promise<void>}
     */
    async init() {
        if (!('indexedDB' in window)) {
            console.warn('IndexedDB not supported');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    /**
     * Get cached data
     * @param {string} key - Cache key
     * @returns {Promise<Object|null>}
     */
    async get(key) {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            return null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                if (result && this.isValid(result)) {
                    resolve(result.data);
                } else {
                    // Remove expired entry
                    if (result) {
                        this.delete(key);
                    }
                    resolve(null);
                }
            };
        });
    }

    /**
     * Set cached data
     * @param {string} key - Cache key
     * @param {Object} data - Data to cache
     * @returns {Promise<void>}
     */
    async set(key, data) {
        if (!this.db) {
            await this.init();
        }

        if (!this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const entry = {
                data,
                timestamp: Date.now()
            };

            const request = store.put(entry, key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Delete cached data
     * @param {string} key - Cache key
     * @returns {Promise<void>}
     */
    async delete(key) {
        if (!this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Clear all cached data
     * @returns {Promise<void>}
     */
    async clear() {
        if (!this.db) {
            return;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Check if cached entry is valid (not expired)
     * @param {Object} entry - Cached entry
     * @returns {boolean}
     */
    isValid(entry) {
        if (!entry || !entry.timestamp) {
            return false;
        }

        const age = Date.now() - entry.timestamp;
        return age < config.app.cacheMaxAge;
    }
}

export const cache = new CacheManager();
