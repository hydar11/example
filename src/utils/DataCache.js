/**
 * 🗄️ Data Cache Manager
 * Implements intelligent caching with different TTLs for different data types
 */

class DataCache {
  constructor() {
    this.debugMode = false; // Set to true for cache debugging
    this.storagePrefix = 'gigaeye_cache_';
    this.cacheConfig = {
      // Chart data - 30 minutes cache
      chartData: { ttl: 30 * 60 * 1000 }, // 30 minutes
      // Market prices - 15 minutes cache
      marketPrices: { ttl: 15 * 60 * 1000 }, // 15 minutes
      // ETH price - 60 minutes cache
      ethPrice: { ttl: 60 * 60 * 1000 }, // 60 minutes
      // Order book - 30 seconds cache
      orderBook: { ttl: 30 * 1000 }, // 30 seconds
      // Stats - 20 minutes cache
      stats: { ttl: 20 * 60 * 1000 }, // 20 minutes
      // Items list - 10 minutes cache
      items: { ttl: 10 * 60 * 1000 }, // 10 minutes
      // Player inventory - 2 minutes cache
      inventory: { ttl: 2 * 60 * 1000 } // 2 minutes
    };
  }

  /**
   * 🔑 Generate cache key
   */
  generateKey(type, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${type}:${sortedParams}`;
  }

  /**
   * 📥 Get cached data from localStorage
   */
  get(type, params = {}) {
    const key = this.generateKey(type, params);
    const storageKey = this.storagePrefix + key;
    
    try {
      const cached = localStorage.getItem(storageKey);
      if (!cached) return null;
      
      const parsedCache = JSON.parse(cached);
      const now = Date.now();
      const ttl = this.cacheConfig[type]?.ttl || 60000; // Default 1 minute
      
      if (now - parsedCache.timestamp > ttl) {
        localStorage.removeItem(storageKey);
        return null;
      }
      
      if (this.debugMode) {
        console.log(`🎯 Cache HIT: ${key} (${Math.round((now - parsedCache.timestamp) / 1000)}s old)`);
      }
      return parsedCache.data;
    } catch (error) {
      // Handle corrupted cache data
      localStorage.removeItem(storageKey);
      return null;
    }
  }

  /**
   * 📤 Set cache data to localStorage
   */
  set(type, data, params = {}) {
    const key = this.generateKey(type, params);
    const storageKey = this.storagePrefix + key;
    const cacheEntry = {
      data,
      timestamp: Date.now(),
      type
    };
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(cacheEntry));
      if (this.debugMode) {
        console.log(`💾 Cache SET: ${key}`);
      }
    } catch (error) {
      // Handle localStorage quota exceeded
      if (error.name === 'QuotaExceededError') {
        console.warn('📦 localStorage quota exceeded, clearing old cache');
        this.cleanup();
        // Try again after cleanup
        try {
          localStorage.setItem(storageKey, JSON.stringify(cacheEntry));
        } catch (retryError) {
          console.error('❌ Failed to cache after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * 🧹 Cleanup expired cache entries from localStorage
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    // Get all localStorage keys that match our prefix
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        try {
          const cached = JSON.parse(localStorage.getItem(key));
          const ttl = this.cacheConfig[cached.type]?.ttl || 60000;
          if (now - cached.timestamp > ttl) {
            keysToRemove.push(key);
            cleaned++;
          }
        } catch (error) {
          // Remove corrupted entries
          keysToRemove.push(key);
          cleaned++;
        }
      }
    }
    
    // Remove expired entries
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries from localStorage`);
    }
  }

  /**
   * 🗑️ Clear specific cache type from localStorage
   */
  clearType(type) {
    let cleared = 0;
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        try {
          const cached = JSON.parse(localStorage.getItem(key));
          if (cached.type === type) {
            keysToRemove.push(key);
            cleared++;
          }
        } catch (error) {
          // Remove corrupted entries
          keysToRemove.push(key);
          cleared++;
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (this.debugMode && cleared > 0) {
      console.log(`🗑️ Cleared ${cleared} ${type} cache entries from localStorage`);
    }
  }

  /**
   * 🔄 Clear all cache from localStorage
   */
  clear() {
    let cleared = 0;
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        keysToRemove.push(key);
        cleared++;
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (this.debugMode) {
      console.log(`🔄 Cleared all cache (${cleared} entries) from localStorage`);
    }
  }

  /**
   * 📊 Get cache statistics from localStorage
   */
  getStats() {
    const stats = {
      totalEntries: 0,
      types: {}
    };
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.storagePrefix)) {
        try {
          const cached = JSON.parse(localStorage.getItem(key));
          stats.totalEntries++;
          if (!stats.types[cached.type]) {
            stats.types[cached.type] = 0;
          }
          stats.types[cached.type]++;
        } catch (error) {
          // Skip corrupted entries
        }
      }
    }
    
    return stats;
  }

  /**
   * 📈 Cached fetch wrapper with automatic caching
   */
  async cachedFetch(type, url, params = {}, fetchOptions = {}) {
    // Try to get from cache first
    const cached = this.get(type, { url, ...params });
    if (cached) {
      return cached;
    }
    
    try {
      if (this.debugMode) {
        console.log(`🌐 Cache MISS: Fetching ${type} from ${url}`);
      }
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache the result
      this.set(type, data, { url, ...params });
      
      return data;
    } catch (error) {
      console.error(`❌ Cache fetch failed for ${type}:`, error);
      throw error;
    }
  }

  /**
   * 🔀 REAL Parallel Batching - loads ALL data in concurrent chunks
   */
  async parallelBatchFetch(type, baseUrl, batchSize = 500, maxConcurrent = 4) {
    try {
      console.time(`🔀 ${type} parallel batching`);
      
      // First, get total count or estimate
      let totalCount = 2000; // Default estimate
      
      if (type === 'stats') {
        totalCount = 1500; // Typical stats count
      } else if (type === 'listings') {
        totalCount = 3000; // Typical listings count
      } else if (type === 'items') {
        totalCount = 800; // Typical items count
      }
      
      // Create concurrent batch requests
      const batches = [];
      for (let i = 0; i < maxConcurrent; i++) {
        const offset = i * batchSize;
        const batchUrl = `${baseUrl}?offset=${offset}&limit=${batchSize}`;
        batches.push(
          fetch(batchUrl)
            .then(res => res.json())
            .then(data => {
              console.log(`✅ ${type} batch ${i + 1}/${maxConcurrent}: ${data?.length || 0} items`);
              return data || [];
            })
            .catch(error => {
              console.warn(`⚠️ ${type} batch ${i + 1} failed:`, error);
              return [];
            })
        );
      }
      
      console.log(`🔀 Fetching ${type} in ${batches.length} parallel batches of ${batchSize} items each`);
      const results = await Promise.all(batches);
      
      // Combine all results
      const combinedData = results.flat();
      console.log(`✅ ${type} parallel batching complete: ${combinedData.length} total items`);
      console.timeEnd(`🔀 ${type} parallel batching`);
      
      // Cache the combined result
      this.set(type, combinedData, { url: baseUrl });
      
      return combinedData;
      
    } catch (error) {
      console.error(`❌ Parallel batching failed for ${type}:`, error);
      // Fallback to regular fetch
      return await this.cachedFetch(type, baseUrl);
    }
  }


  /**
   * ⚡ Preload ALL critical data (simple fetch + localStorage cache)
   */
  async preloadCriticalData(itemId = null) {
    const preloadTasks = [
      // Preload ALL market data
      this.cachedFetch('marketPrices', '/api/items'),
      // Preload ETH price (always needed)  
      this.cachedFetch('ethPrice', '/api/eth-price'),
      // Preload ALL stats
      this.cachedFetch('stats', '/api/stats'),
      // Preload ALL listings
      this.cachedFetch('listings', '/api/listings')
    ];
    
    // Only preload chart data if specific item provided
    if (itemId) {
      preloadTasks.push(
        this.cachedFetch('chartData', `/api/chart-data/${itemId}?timeframe=1h`, { itemId, timeframe: '1h' })
      );
    }
    
    try {
      const results = await Promise.allSettled(preloadTasks);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      console.log(`🚀 ALL critical data preloaded: ${successful}/${preloadTasks.length} successful`);
    } catch (error) {
      console.error('⚠️ Preload failed:', error);
    }
  }

  /**
   * 🔄 Invalidate cache on transaction
   */
  invalidateTransactionCache() {
    // Clear dynamic data that changes after transactions
    this.clearType('orderBook');
    this.clearType('stats');
    this.clearType('inventory');
    this.clearType('marketPrices');
    if (this.debugMode) {
      console.log('🔄 Transaction cache invalidated');
    }
  }
}

// Export singleton instance
export const dataCache = new DataCache();

// Auto cleanup every 5 minutes
setInterval(() => {
  dataCache.cleanup();
}, 5 * 60 * 1000);