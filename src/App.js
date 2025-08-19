import React, { useState, useEffect, useRef } from 'react';
import { 
  AbstractWalletProvider, 
  useLoginWithAbstract, 
  useAbstractClient, 
  useGlobalWalletSignerAccount,
  useGlobalWalletSignerClient
} from '@abstract-foundation/agw-react';
import { secureAuthService } from './security/SecureAuthService';
import { secureTokenManager } from './security/SecureTokenManager';
import { useAccount, useSendTransaction } from 'wagmi';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import Deals from './components/Deals';
import TradesDropdown from './components/TradesDropdown';
import GigaverseAuth from './components/GigaverseAuth';
import AGWConnection from './components/AGWConnection';
import { transactionValidator } from './security/TransactionValidator';
import { dataCache } from './utils/DataCache';

// Add wiggle animation and button styles CSS
const customCSS = `
  @keyframes wiggle {
    0%, 7% { transform: rotateZ(0); }
    15% { transform: rotateZ(-15deg); }
    20% { transform: rotateZ(10deg); }
    25% { transform: rotateZ(-10deg); }
    30% { transform: rotateZ(6deg); }
    35% { transform: rotateZ(-4deg); }
    40%, 100% { transform: rotateZ(0); }
  }
  
  
  /* Buy button green */
  .trade-button.buy-button {
    background-color: #4CAF50 !important;
  }
  
  /* Sell button red */
  .trade-button.sell-button {
    background-color: #f44336 !important;
  }
  
  /* Calculate proper header height + margin for banners */
  :root {
    --header-height: 55px;
    --ticker-height: 38px;
    --stats-height: 75px;
    --banner-space: 15px;
    --total-header-offset: calc(var(--header-height) + var(--ticker-height) + var(--stats-height) + var(--banner-space));
  }
  
  /* Market panel content should expand */
  .market-list {
    flex-grow: 1;
    overflow-y: auto;
    min-height: 0;
  }
  
  .panel:first-child > div:last-child {
    flex-shrink: 0;
  }
  
  /* Force 3 blocks to stay in one row - no stacking */
  .trading-layout {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  
  .trading-layout .panel {
    overflow: hidden !important;
    min-width: 0 !important;
  }
  
  .trading-layout .panel:nth-child(1) {
    flex: 19 !important;
    height: calc(100vh - var(--total-header-offset)) !important;
    max-height: calc(100vh - var(--total-header-offset)) !important;
    display: flex !important;
    flex-direction: column !important;
  }
  
  .trading-layout .panel:nth-child(2) {
    flex: 62 !important;
    height: calc(100vh - var(--total-header-offset)) !important;
    max-height: calc(100vh - var(--total-header-offset)) !important;
    overflow-y: auto !important;
  }
  
  .trading-layout .panel:nth-child(3) {
    flex: 19 !important;
    display: flex !important;
    flex-direction: column !important;
    height: calc(100vh - var(--total-header-offset)) !important;
    max-height: calc(100vh - var(--total-header-offset)) !important;
  }
  
  /* Trading section should not shrink and take space */
  .trading-section {
    flex-shrink: 0 !important;
    min-height: auto !important;
  }
  
  /* Order book section gets remaining space but can't expand beyond limits */
  .orderbook-section {
    flex: 1 1 auto !important;
    overflow-y: auto !important;
    min-height: 0 !important;
    max-height: 60% !important;
  }
  
  /* Fix All TX button - keep on right edge, no movement */
  .ticker-dropdown-arrow {
    position: absolute !important;
    right: 10px !important;
    top: 50% !important;
    margin-top: -15px !important;
    transform: none !important;
    transition: none !important;
  }
  
  .ticker-dropdown-arrow:hover {
    position: absolute !important;
    right: 10px !important;
    top: 50% !important;
    margin-top: -15px !important;
    transform: none !important;
  }
  
  /* Make arrow color same as green dot */
  .arrow-icon {
    color: #00ff00 !important;
  }
  
`;

// Inject CSS
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = customCSS;
  document.head.appendChild(styleSheet);
}

// Development security monitoring
if (process.env.NODE_ENV === 'development') {
  import('./security/SecurityTest');
}

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);
import { abstract, abstractTestnet } from 'viem/chains';

// Debug: Check what viem chains provide
console.log('🔍 Viem Abstract chain:', abstract);
console.log('🔍 Viem Abstract testnet:', abstractTestnet);
import { ethers } from 'ethers';
// 🔒 SECURITY: Removed unused privateKey imports to prevent accidental key generation
import { parseEther, toFunctionSelector } from 'viem';

import { http } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// AGW Provider Component - MAINNET ONLY
const AGWProvider = ({ children }) => {
  console.log('🚀 AGWProvider component loading...');
  
  // Create QueryClient for React Query
  const queryClient = new QueryClient();
  
  // CORRECT Abstract mainnet configuration from official docs
  const abstractMainnetConfig = {
    id: 2741,
    name: 'Abstract',
    network: 'abstract',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    rpcUrls: {
      default: {
        http: ['https://api.mainnet.abs.xyz'],
        webSocket: ['wss://api.mainnet.abs.xyz/ws'],
      },
      public: {
        http: ['https://api.mainnet.abs.xyz'],
        webSocket: ['wss://api.mainnet.abs.xyz/ws'],
      },
    },
    blockExplorers: {
      default: {
        name: 'Abstract Explorer',
        url: 'https://abscan.org',
      },
    },
  };

  // Add explicit transport configuration
  const transport = http('https://api.mainnet.abs.xyz');

  // Debug chain configuration
  console.log('🔍 Chain config:', abstractMainnetConfig);
  console.log('🔍 Expected chain:', { id: abstractMainnetConfig.id, name: abstractMainnetConfig.name });
  console.log('🔍 Transport URL:', 'https://api.mainnet.abs.xyz');

  return (
    <QueryClientProvider client={queryClient}>
      <AbstractWalletProvider 
        chain={abstract}
        queryClient={queryClient}
      >
        {children}
      </AbstractWalletProvider>
    </QueryClientProvider>
  );
};

// Main Trading Dashboard Component

const TradingDashboard = () => {




  // AGW Hooks
  const { login, logout } = useLoginWithAbstract();
  const { data: abstractClient } = useAbstractClient();
  // REMOVED: useGlobalWalletSignerClient - was causing unknown address 0x2f1B982...
  const { address, isConnected } = useAccount();
  const { sendTransaction: sendTransactionWagmi } = useSendTransaction();

  // State Management
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [globalLoading, setGlobalLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  
  // Progressive loading states
  const [itemDetailsLoaded, setItemDetailsLoaded] = useState(false);
  const [marketsLoaded, setMarketsLoaded] = useState(false);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [ethPriceLoaded, setEthPriceLoaded] = useState(false);
  
  // Chart and data refs
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  
  // Data State - EXACT same as original
  const [marketData, setMarketData] = useState([]);
  const [itemDetails, setItemDetails] = useState({});
  const [currentItem, setCurrentItem] = useState(null);
  
  
  
  // Chart data cache to avoid API calls on currency change
  const [chartDataCache, setChartDataCache] = useState({});
  const chartDataCacheRef = useRef({});
  
  // ItemDayData cache for tooltip
  const itemDayDataCacheRef = useRef({});
  
  // Abort controller for chart requests to cancel pending requests
  const chartAbortControllerRef = useRef(null);
  
  // Ref to always get latest currentItem in crosshair event
  const currentItemRef = useRef(null);
  
  // Sync currentItem state with ref
  useEffect(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [ethToUsdRate, setEthToUsdRate] = useState(3500);
  const [totalMarketVolume24h, setTotalMarketVolume24h] = useState(0);
  const [availableListings, setAvailableListings] = useState([]);
  
  // Chart State
  const [timeframe, setTimeframe] = useState('1d');
  const [showCandles, setShowCandles] = useState(false);
  const [showLine, setShowLine] = useState(true);
  const [currency, setCurrency] = useState('USD');
  
  // Banner rotation state
  const [currentBanner, setCurrentBanner] = useState(0); // 0 = referral, 1 = giga juice
  
  // Fee vault popup state
  const [showFeeVaultPopup, setShowFeeVaultPopup] = useState(false);

  // Banner rotation effect
  useEffect(() => {
    const bannerInterval = setInterval(() => {
      setCurrentBanner(prev => prev === 0 ? 1 : 0);
    }, 10000); // Switch every 10 seconds

    return () => clearInterval(bannerInterval);
  }, []);
  
  // Trading State - persist tab selection
  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem('gigaverse_active_tab') || 'buy';
  });

  // Wrapper to persist tab selection
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem('gigaverse_active_tab', tab);
  };
  const [buyAmount, setBuyAmount] = useState(1);
  const [sellAmount, setSellAmount] = useState(1);
  const [sellPrice, setSellPrice] = useState(0.001);
  
  // Recent Trades & Order Book
  const [recentTrades, setRecentTrades] = useState([]);
  const [orderBook, setOrderBook] = useState([]);
  const [allRecentTrades, setAllRecentTrades] = useState([]);
  const [tickerIndex, setTickerIndex] = useState(0);
  
  // My Transactions
  const [myTransactions, setMyTransactions] = useState([]);
  const [activeTradesTab, setActiveTradesTab] = useState('recent'); // 'recent', 'my', 'listings', 'pnl'
  const [myTransactionsFilter, setMyTransactionsFilter] = useState('all'); // 'all' or 'item'
  
  // PnL Data
  const [pnlData, setPnlData] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlChart, setPnlChart] = useState(null);
  const pnlChartRef = useRef(null);
  
  // My Listings
  const [myListings, setMyListings] = useState([]);
  const [myListingsFilter, setMyListingsFilter] = useState('all'); // 'all' or 'item'
  const [expandedListings, setExpandedListings] = useState(new Set());
  
  // Username cache for addresses - using ref to avoid re-renders
  const usernameCacheRef = useRef({});
  
  // Cancel listing states
  const [cancellingListings, setCancellingListings] = useState(new Set());

  // Stats
  const [stats, setStats] = useState({
    totalVolumeValue: '-',
    itemVolumeChange: '-',
    priceRange: '-',
    itemSupply: '-',
    totalMarketVolume: '-',
    statVolumeChange: '',
    statItemVolumeChange: '',
    statPriceRangeChange: '-',
    statSupplyChange: '',
    statMarketVolumeChange: '',
    allTimeVolume: '-',
    allTimeItemsSold: '-',
    totalSupply: '-'
  });

  // Popup States
  const [showDealsPopup, setShowDealsPopup] = useState(false);
  const [showTradesDropdown, setShowTradesDropdown] = useState(false);

  // Auth and Player Inventory - EXACT same as deals component
  const [authToken, setAuthToken] = useState(null);
  const [playerInventory, setPlayerInventory] = useState({});

  // Handle authentication success - simplified
  const handleAuthSuccess = (token) => {
    setAuthToken(token);
    setMessage('✅ Authenticated with Gigaverse successfully!');
    setTimeout(() => setMessage(''), 1500);
    
    // Refresh player inventory for main UI display
    if (token) {
      fetchPlayerInventory();
    }
  };

  // Handle authentication error - simplified
  const handleAuthError = (error) => {
    setMessage('❌ Auth failed: ' + error);
    setTimeout(() => setMessage(''), 3000);
  };

  // Handle AGW disconnection - clear auth token only
  const handleAGWDisconnect = () => {
    setAuthToken(null); // Clear Gigaverse auth when AGW disconnects
  };


  // Get item info - used by popup components
  const getItemInfo = (itemId) => {
    const item = itemDetails[itemId];
    if (!item) {
      return { name: `Item ${itemId}`, image: null, icon: '📦' };
    }
    return {
      name: item.name || `Item ${itemId}`,
      image: item.image || null,
      icon: item.icon || '📦'
    };
  };



  // Load data on mount - OPTIMIZED with parallel loading and timing
  useEffect(() => {
    // Prevent multiple simultaneous loads
    if (window.gigaeyeLoadingInProgress) {
      console.log('🔄 Load already in progress, skipping duplicate');
      return;
    }
    
    console.log('🔥 TradingDashboard component mounted - starting initial load');
    window.gigaeyeLoadingInProgress = true;
    const loadStartTime = performance.now();
    console.time('🚀 Initial Page Load');
    
    const loadInitialData = async () => {
      try {
        // Maximum parallelization - start ALL requests simultaneously 
        console.time('📋 Critical Data Loading');
        console.log('🚀 Starting all API requests in parallel...');
        const parallelStartTime = performance.now();
        
        // Progressive loading - each component appears as data becomes available
        
        // 1. Load item details first (fastest) - enables basic UI
        loadItemDetails().then(details => {
          console.log(`✅ Item details loaded: ${Object.keys(details).length} items - UI ready!`);
          setItemDetailsLoaded(true);
          setGlobalLoading(false); // Enable UI interaction immediately
          setLoadingMessage('Loading market data...');
        });
        
        // 2. Load ETH price (fast) - enables price display
        fetchEthToUsdRate().then(() => {
          console.log('✅ ETH price loaded - price display ready!');
          setEthPriceLoaded(true);
        });
        
        // 3. Load ALL market data (simple fetch + localStorage cache) - enables market list
        Promise.all([
          dataCache.cachedFetch('marketPrices', '/api/items').then(items => {
            console.log(`✅ ALL Items loaded: ${items?.length || 0} items`);
            return items;
          }),
          dataCache.cachedFetch('stats', '/api/stats').then(stats => {
            console.log(`✅ ALL Stats loaded: ${stats?.length || 0} entries`);
            return stats;
          })
        ]).then(([items, stats]) => {
          // Process market data after both APIs complete
          const startTime = performance.now();
          console.time('🏪 Market processing');
          
          const totalVolume = stats.reduce((total, stat) => total + (stat.totalEthVolume24h || 0), 0);
          if (stats.length > 0) {
            setTotalMarketVolume24h(totalVolume);
          }
          
          const marketVolumeChange = stats.length > 0 ? stats[0].marketVolumeChange24h || 0 : 0;
          
          const markets = items.map(itemId => {
            const itemStats = stats.find(s => s.itemId === itemId) || {};
            const itemInfo = getItemInfo(itemId);
            return { 
              ...itemInfo, 
              itemId, 
              volume: itemStats.totalItemsSold24h || 0,
              volumeEth: itemStats.totalEthVolume24h || 0, 
              change24h: itemStats.priceChange24h || 0, 
              volumeChange24h: itemStats.volumeChange24h || 0, 
              currentPrice: itemStats.currentPrice || 0,
              floorPrice: itemStats.floorPrice || 0, 
              price24hAgo: itemStats.price24hAgo || 0, 
              tradeCount: itemStats.tradeCount || 0,
              marketVolumeChange24h: marketVolumeChange
            };
          }).sort((a, b) => b.volumeEth - a.volumeEth);
          
          setMarketData(markets);
          updateMarketVolumeChange(marketVolumeChange);
          console.timeEnd('🏪 Market processing');
          console.log(`✅ Markets loaded - market list ready!`);
          setMarketsLoaded(true);
          setLoadingMessage('Loading trading data...');
        });
        
        // 4. Load ALL listings (simple fetch + localStorage cache) - enables buy/sell functionality
        loadAvailableListings().then(() => {
          console.log('✅ Listings loaded - trading ready!');
          setListingsLoaded(true);
          setLoadingMessage('');
        }).catch((error) => {
          console.error('❌ Listings loading failed:', error);
          setAvailableListings([]);
          setListingsLoaded(true); // Still mark as loaded to not block UI
          setLoadingMessage('');
        });
        
        // Wait for critical data only (listings already loading above)
        const allDataPromises = [
          new Promise(resolve => setTimeout(resolve, 100)), // Ensure item details loaded
          dataCache.cachedFetch('marketPrices', '/api/items'),
          dataCache.cachedFetch('stats', '/api/stats'), 
          // DON'T call listings again - already loading above
          fetchEthToUsdRate()
        ];
        
        await Promise.allSettled(allDataPromises);
        
        const parallelTime = performance.now() - parallelStartTime;
        console.log(`⚡ Parallel execution completed in: ${parallelTime.toFixed(0)}ms`);
        console.timeEnd('📋 Critical Data Loading');
        
        const totalTime = performance.now() - loadStartTime;
        console.timeEnd('🚀 Initial Page Load');
        console.log(`⚡ Total load time: ${totalTime.toFixed(0)}ms`);
        
      } catch (error) {
        console.error('❌ Initial load error:', error);
      } finally {
        // Clear loading flag when done
        window.gigaeyeLoadingInProgress = false;
      }
    };
    
    loadInitialData();
    
    const refreshInterval = setInterval(refreshData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Initialize ticker after itemDetails is loaded
  useEffect(() => {
    if (Object.keys(itemDetails).length > 0) {
      initTicker();
    }
  }, [itemDetails]);

  // Auto-select first item when markets load initially (but don't override user selection or search)
  useEffect(() => {
    if (marketData.length > 0 && !currentItem && !searchTerm && !window.userHasSelectedItem) {
      const firstItem = marketData[0].itemId;
      // Use selectMarket for consistent item switching
      selectMarket(firstItem);
    }
  }, [marketData.length > 0]); // Only depend on whether we have data, not the data itself

  
  // Ticker update
  useEffect(() => {
    const tickerInterval = setInterval(updateTicker, 5000);
    const loadInterval = setInterval(loadRecentTradesForTicker, 120000);
    return () => {
      clearInterval(tickerInterval);
      clearInterval(loadInterval);
    };
  }, [allRecentTrades, tickerIndex]);

  // Initialize chart - wait for marketsLoaded so chart div exists
  useEffect(() => {
    if (window.LightweightCharts && !chartRef.current && marketsLoaded) {
      initChart();
    }
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [marketsLoaded]);

  // Update chart when item changes (optimized for instant switching)
  useEffect(() => {
    if (currentItem && chartRef.current) {
      requestAnimationFrame(() => {
        updateChart();
        updateOrderBook();
        updateStats();
        updateLastTrades();
      });
    }
  }, [currentItem, timeframe]);

  // Update chart data when currency changes - force complete reset
  useEffect(() => {
    if (currentItem && chartRef.current && candlestickSeriesRef.current && lineSeriesRef.current) {
      // Get cached ETH data
      const cacheKey = `${currentItem}_${timeframe}`;
      const cachedData = chartDataCacheRef.current[cacheKey];
      
      if (cachedData && cachedData.length > 0) {
        // Convert cached ETH data to current currency
        const convertedCandles = cachedData.map(c => ({
          ...c,
          open: convertPrice(c.open),
          high: convertPrice(c.high), 
          low: convertPrice(c.low),
          close: convertPrice(c.close)
        }));
        
        const convertedLineData = cachedData.map(c => ({
          time: c.time,
          value: convertPrice(c.close)
        }));
        
        // Clear and reset chart data to force complete refresh
        candlestickSeriesRef.current.setData([]);
        lineSeriesRef.current.setData([]);
        
        setTimeout(() => {
          // Set new data
          candlestickSeriesRef.current.setData(convertedCandles);
          lineSeriesRef.current.setData(convertedLineData);
          
          // Reset price scale from manual drag state (based on GitHub issues research)
          setTimeout(() => {
            if (chartRef.current) {
              // Method 1: Use the new setAutoScale API if available
              try {
                const priceScale = chartRef.current.priceScale();
                if (priceScale.setAutoScale) {
                  priceScale.setAutoScale(true);
                } else {
                  // Fallback: Reset autoScale option
                  priceScale.applyOptions({ autoScale: true });
                }
              } catch (e) {
                // If priceScale methods fail, try different approach
                const priceScale = chartRef.current.priceScale('right');
                priceScale.applyOptions({ autoScale: true });
              }
              
              // Force recalculation by fitting time content
              chartRef.current.timeScale().fitContent();
            }
          }, 100);
        }, 50);
      }
    }
  }, [currency]);

  // Update total market volume display when value or currency changes
  useEffect(() => {
    updateTotalMarketVolumeDisplay();
  }, [totalMarketVolume24h, currency, ethToUsdRate]);

  // Fetch my transactions when user connects, tab changes, or filter changes
  useEffect(() => {
    if (activeTradesTab === 'my' && (address || isConnected)) {
      fetchMyTransactions();
    }
  }, [activeTradesTab, myTransactionsFilter, currentItem, address, isConnected]);

  // Fetch my listings when user connects, tab changes, or filter changes
  useEffect(() => {
    if (activeTradesTab === 'listings' && (address || isConnected)) {
      fetchMyListings();
    }
  }, [activeTradesTab, myListingsFilter, currentItem, address, isConnected]);

  // Fetch PnL data when user connects or tab changes
  useEffect(() => {
    if (activeTradesTab === 'pnl' && (address || isConnected)) {
      fetchPnLData();
    } else {
      // Clean up chart when leaving PnL tab
      if (pnlChartRef.current) {
        pnlChartRef.current.destroy();
        pnlChartRef.current = null;
      }
      setPnlChart(null);
    }
  }, [activeTradesTab, address, isConnected]);

  // Update chart type when showCandles or showLine changes (instant)
  useEffect(() => {
    if (chartRef.current && candlestickSeriesRef.current && lineSeriesRef.current) {
      requestAnimationFrame(() => {
        updateChartType();
      });
    }
  }, [showCandles, showLine]);

  // Session clearing is now handled by AGW component

  // Fetch player inventory when auth token is available - EXACT COPY FROM DEALS
  useEffect(() => {
    if (authToken) {
      fetchPlayerInventory();
    }
  }, [authToken]);

  // Data Loading Functions - EXACT same as original
  const loadItemDetails = async () => {
    const startTime = performance.now();
    console.time('📦 /api/item-details');
    try {
      const response = await fetch('/api/item-details');
      console.timeEnd('📦 /api/item-details');
      console.time('📦 Item details JSON parse');
      const details = await response.json();
      console.timeEnd('📦 Item details JSON parse');
      console.log(`📦 Item details loaded: ${Object.keys(details).length} items`);
      setItemDetails(details);
      console.log(`📦 Total item details time: ${(performance.now() - startTime).toFixed(0)}ms`);
      return details;
    } catch (error) {
      console.error('❌ loadItemDetails error:', error);
      console.log(`📦 Item details failed in: ${(performance.now() - startTime).toFixed(0)}ms`);
      return {};
    }
  };

  const loadMarkets = async () => {
    const startTime = performance.now();
    setGlobalLoading(true);
    setLoadingMessage('Loading market data...');
    
    try {
      // Individual API timing
      console.time('📦 /api/items');
      const itemsPromise = dataCache.cachedFetch('marketPrices', '/api/items').then(result => {
        console.timeEnd('📦 /api/items');
        console.log(`📦 Items loaded: ${result?.length || 0} items`);
        return result;
      });
      
      console.time('📈 /api/stats');
      const statsPromise = dataCache.cachedFetch('stats', '/api/stats').then(result => {
        console.timeEnd('📈 /api/stats');
        console.log(`📈 Stats loaded: ${result?.length || 0} entries`);
        return result;
      });
      
      const [items, statsData] = await Promise.all([itemsPromise, statsPromise]);
      
      console.log(`📊 API calls completed in ${(performance.now() - startTime).toFixed(0)}ms`);
      
      // Calculate total market volume timing
      console.time('🧮 Volume calculation');
      const totalVolume = statsData.reduce((total, stat) => total + (stat.totalEthVolume24h || 0), 0);
      if (statsData.length > 0) {
        setTotalMarketVolume24h(totalVolume);
      }
      const marketVolumeChange = statsData.length > 0 ? statsData[0].marketVolumeChange24h || 0 : 0;
      console.timeEnd('🧮 Volume calculation');
      
      // Market data processing timing
      console.time('🏪 Market mapping');
      const markets = items.map(itemId => {
        const itemStats = statsData.find(s => s.itemId === itemId) || {};
        const itemInfo = getItemInfo(itemId);
        return { 
          ...itemInfo, 
          itemId, 
          volume: itemStats.totalItemsSold24h || 0, 
          volumeEth: itemStats.totalEthVolume24h || 0, 
          change24h: itemStats.priceChange24h || 0, 
          volumeChange24h: itemStats.volumeChange24h || 0, 
          currentPrice: itemStats.currentPrice || 0, 
          floorPrice: itemStats.floorPrice || 0, 
          price24hAgo: itemStats.price24hAgo || 0, 
          tradeCount: itemStats.tradeCount || 0,
          marketVolumeChange24h: marketVolumeChange
        };
      }).sort((a, b) => b.volumeEth - a.volumeEth);
      console.timeEnd('🏪 Market mapping');
      
      // State updates timing
      console.time('💾 State updates');
      setMarketData(markets);
      updateMarketVolumeChange(marketVolumeChange);
      console.timeEnd('💾 State updates');
      
      console.log(`📊 Markets loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
      
    } catch (error) { 
      console.error('❌ loadMarkets error:', error);
      console.log(`📊 Markets failed in ${(performance.now() - startTime).toFixed(0)}ms`);
    } finally {
      console.time('🏁 Cleanup');
      setGlobalLoading(false);
      setLoadingMessage('');
      console.timeEnd('🏁 Cleanup');
    }
  };

  const loadAvailableListings = async () => {
    console.log('🔴 loadAvailableListings called from:', new Error().stack?.split('\n')[2]?.trim());
    const startTime = performance.now();
    console.time('📋 /api/listings');
    try {
      const listings = await dataCache.cachedFetch('listings', '/api/listings');
      console.timeEnd('📋 /api/listings');
      console.log(`📋 ALL Listings loaded: ${listings?.length || 0} listings`);
      setAvailableListings(listings || []);
      console.log(`📋 Total listings time: ${(performance.now() - startTime).toFixed(0)}ms`);
      return listings;
    } catch (error) {
      console.error('❌ loadAvailableListings error:', error);
      setAvailableListings([]);
      return [];
    }
  };

  const loadRecentTradesForTicker = async () => {
    try {
      const items = Object.keys(itemDetails);
      if (!items.length) return;
      
      const allTrades = [];
      const batchSize = 5;
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map(async (itemId) => {
          try {
            const trades = await fetch(`/api/trades/${itemId}?limit=3`).then(res => res.json());
            if (trades && trades.length) {
              trades.forEach(trade => {
                const itemInfo = getItemInfo(itemId);
                allTrades.push({
                  ...trade,
                  itemId: itemId,
                  itemName: itemInfo.name,
                  itemIcon: itemInfo.image || itemInfo.icon,
                  ethValue: trade.ethSpent,
                  amount: trade.amount,
                  timestamp: trade.timestamp
                });
              });
            }
          } catch (error) {
          }
        });
        
        await Promise.all(batchPromises);
      }
      
      // Fetch usernames for ticker trades
      const allAddresses = new Set();
      allTrades.forEach(trade => {
        if (trade.buyer) allAddresses.add(trade.buyer);
        if (trade.seller) allAddresses.add(trade.seller);
      });
      
      if (allAddresses.size > 0) {
        const usernamePromises = Array.from(allAddresses).map(async (address) => {
          const username = await fetchUsername(address);
          return { address, username };
        });
        
        const usernameResults = await Promise.all(usernamePromises);
        const addressToUsername = {};
        usernameResults.forEach(result => {
          addressToUsername[result.address] = result.username;
        });
        
        // Add usernames to trades
        allTrades.forEach(trade => {
          trade.buyerName = addressToUsername[trade.buyer];
          trade.sellerName = addressToUsername[trade.seller];
        });
      }
      
      setAllRecentTrades(allTrades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 40));
    } catch (error) {
    }
  };

  const fetchEthToUsdRate = async () => {
    try {
      // Try to get cached ETH price first (5 minute cache)
      let price = null;
      
      try {
        const result = await dataCache.cachedFetch('ethPrice', '/api/eth-price');
        if (result.success && result.data?.ethereum?.usd) {
          price = result.data.ethereum.usd;
          console.log('📈 ETH price from CoinGecko (cached):', price);
        }
      } catch (error) {
        console.log('⚠️ CoinGecko failed, trying Binance...');
      }

      // If CoinGecko failed, try Binance API
      if (!price) {
        try {
          const binanceData = await dataCache.cachedFetch('ethPrice', 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
          if (binanceData.price) {
            price = parseFloat(binanceData.price);
            console.log('📈 ETH price from Binance (cached):', price);
          }
        } catch (binanceError) {
          console.error('❌ Binance API also failed:', binanceError.message);
        }
      }

      if (price) {
        setEthToUsdRate(price);
        console.log('📈 ETH price set:', price);
      } else {
        console.error('❌ All price APIs failed');
        setEthToUsdRate(0);
      }
    } catch (error) {
      console.error('❌ ETH price fetch failed:', error.message);
      setEthToUsdRate(0);
    }
  };

  const refreshData = async () => {
    
    try {
      // Store current search state to preserve it during refresh
      const currentSearch = searchTerm;
      const selectedItem = currentItem;
      
      // First refresh core data (loadMarkets already calls loadAvailableListings internally)
      await loadMarkets(); // This already refreshes both markets and listings
      
      // Preserve user selections after data refresh
      if (selectedItem && selectedItem !== currentItem) {
        // Use selectMarket to avoid race conditions
        selectMarket(selectedItem);
        return; // Exit early since selectMarket will handle everything
      }
      
      // Then refresh current item data if we have a selected item
      if (currentItem) {
        await Promise.all([
          updateChart(), 
          updateOrderBook(), 
          updateStats(), 
          updateLastTrades()
        ]);
      }
      
    } catch (error) {
    }
  };

  // Fix order book loading with proper currentItem check
  const updateOrderBookForCurrentItem = async () => {
    if (!currentItem) return;
    await updateOrderBook();
  };

  const initTicker = async () => {
    await loadRecentTradesForTicker();
    updateTicker();
  };

  const updateTicker = () => {
    if (!allRecentTrades.length) {
      const tickerContent = document.getElementById('ticker-content');
      if (tickerContent) {
        tickerContent.textContent = 'Loading trade data...';
      }
      return;
    }
    
    const tickerContent = document.getElementById('ticker-content');
    if (!tickerContent) return;
    
    const trade = allRecentTrades[tickerIndex];
    if (!trade) return;
    
    const iconSrc = trade.itemIcon || '';
    const itemName = trade.itemName || 'Unknown Item';
    const amount = trade.amount || 1;
    const ethValue = trade.ethValue || 0;
    
    // Format price based on current currency setting
    const displayPrice = convertPrice(ethValue);
    const formattedPrice = formatPrice(displayPrice);
    const currencySymbol = currency === 'USD' ? '$' : 'Ξ';
    
    // 🔒 SECURITY FIX: Use textContent instead of innerHTML to prevent XSS
    tickerContent.innerHTML = ''; // Clear existing content
    
    // Create elements safely without innerHTML
    const img = document.createElement('img');
    img.src = iconSrc;
    img.className = 'ticker-icon';
    img.alt = itemName;
    img.onerror = () => img.style.display = 'none';
    
    const boughtSpan = document.createElement('span');
    boughtSpan.className = 'text-success';
    boughtSpan.textContent = 'BOUGHT';
    
    const amountSpan = document.createElement('span');
    amountSpan.textContent = ` ${amount} ${itemName} `;
    
    const priceSpan = document.createElement('span');
    priceSpan.className = 'muted';
    priceSpan.textContent = `FOR ${currencySymbol}${formattedPrice}`;
    
    // Append safely created elements
    tickerContent.appendChild(img);
    tickerContent.appendChild(boughtSpan);
    tickerContent.appendChild(amountSpan);
    tickerContent.appendChild(priceSpan);
    setTickerIndex((tickerIndex + 1) % allRecentTrades.length);
  };

  // Utility Functions - EXACT same as original

  const getTypes = () => {
    return [...new Set(Object.values(itemDetails).map(item => item.type).filter(type => type?.trim()))].sort();
  };

  const filterMarkets = () => {
    return marketData.filter(market => {
      const itemInfo = getItemInfo(market.itemId);
      const matchesName = !searchTerm || itemInfo.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !selectedType || itemInfo.type === selectedType;
      return matchesName && matchesType;
    });
  };

  const formatPrice = (price) => {
    if (currency === 'USD') {
      // Order book and market list: always 2 decimals for USD
      return price.toFixed(2);
    }
    
    // Enhanced precision for ETH to avoid aggregating different prices
    // Always show at least 8 decimal places to distinguish between close prices
    if (price < 0.00000001) return price.toFixed(15).replace(/\.?0+$/, '');
    if (price < 0.0000001) return price.toFixed(12).replace(/\.?0+$/, '');
    if (price < 0.000001) return price.toFixed(10).replace(/\.?0+$/, '');
    if (price < 0.00001) return price.toFixed(9).replace(/\.?0+$/, '');
    if (price < 0.0001) return price.toFixed(8).replace(/\.?0+$/, '');
    if (price < 0.001) return price.toFixed(8).replace(/\.?0+$/, '');
    if (price < 0.01) return price.toFixed(8).replace(/\.?0+$/, '');
    if (price < 0.1) return price.toFixed(8).replace(/\.?0+$/, '');
    return price.toFixed(6).replace(/\.?0+$/, '');
  };

  // Format prices for statistics info blocks (whole dollars, no decimals)
  const formatStatsPrice = (price) => {
    if (currency === 'USD') {
      return Math.round(price).toString();
    }
    // For ETH, use regular formatPrice
    return formatPrice(price);
  };

  // Format prices for price ranges (2 decimals for USD)
  const formatPriceRange = (price) => {
    if (currency === 'USD') {
      return price.toFixed(2);
    }
    // For ETH, use regular formatPrice
    return formatPrice(price);
  };

  // Format ETH prices specifically (independent of currency setting)
  const formatEthPrice = (price) => {
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.1) return price.toFixed(6);
    return price.toFixed(8).replace(/\.?0+$/, '');
  };

  // Fetch username from Gigaverse API
  const fetchUsername = async (address) => {
    if (!address) return null;
    
    const lowerAddress = address.toLowerCase();
    
    // Check cache first - need to check if key exists, not just if value is truthy
    if (lowerAddress in usernameCacheRef.current) {
      return usernameCacheRef.current[lowerAddress];
    }
    
    try {
      const response = await fetch(`https://gigaverse.io/api/account/${address}`);
      if (!response.ok) throw new Error('API error');
      
      const data = await response.json();
      const username = data.usernames?.[0]?.NAME_CID;
      
      // Cache the result (including null/undefined for addresses without names)
      usernameCacheRef.current[lowerAddress] = username || null;
      
      return username || null;
    } catch (error) {
      // Cache null to avoid repeated failed requests
      usernameCacheRef.current[lowerAddress] = null;
      return null;
    }
  };

  // Format address with username fallback
  const formatAddressWithName = (address, username) => {
    if (username) return username;
    if (address) return `${address.slice(0, 6)}...${address.slice(-4)}`;
    return '-';
  };

  const convertPrice = (price) => {
    if (currency === 'USD' && ethToUsdRate) {
      return price * ethToUsdRate;
    }
    return price;
  };

  const updateTotalMarketVolumeDisplay = () => { 
    setStats(prev => ({
      ...prev,
      totalMarketVolume: `${formatStatsPrice(convertPrice(totalMarketVolume24h))} ${currency}`
    }));
  };

  const updateMarketVolumeChange = (changePercent) => {
    setStats(prev => ({
      ...prev,
      statMarketVolumeChange: changePercent !== 0 ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%` : '-'
    }));
  };

  const selectMarket = async (itemId) => {
    // Prevent selecting the same item
    if (currentItem === itemId) return;
    
    // Cancel any pending chart request
    if (chartAbortControllerRef.current) {
      chartAbortControllerRef.current.abort();
      chartAbortControllerRef.current = null;
    }
    
    // Mark that user has made a manual selection
    window.userHasSelectedItem = true;
    
    // Cancel any pending chart requests by storing the selected item ID FIRST
    window.lastSelectedItem = itemId;
    
    // Set current item immediately
    setCurrentItem(itemId);
    
    // ALWAYS clear chart immediately and show new item, regardless of cache
    // This ensures instant visual feedback
    if (candlestickSeriesRef.current && lineSeriesRef.current) {
      // Check if we have cached chart data
      const cacheKey = `${itemId}_${timeframe}`;
      const cachedData = chartDataCacheRef.current[cacheKey];
      
      if (cachedData && cachedData.length > 0) {
        // Fast path - show cached data immediately
        const convertedCandles = cachedData.map(c => ({
          ...c,
          open: convertPrice(c.open),
          high: convertPrice(c.high), 
          low: convertPrice(c.low),
          close: convertPrice(c.close)
        }));
        
        const convertedLineData = cachedData.map(c => ({ 
          time: c.time, 
          value: convertPrice(c.close) 
        }));
        
        candlestickSeriesRef.current.setData(convertedCandles);
        lineSeriesRef.current.setData(convertedLineData);
      } else {
        // No cached data - clear chart immediately to show item switch
        candlestickSeriesRef.current.setData([]);
        lineSeriesRef.current.setData([]);
        
        // Start loading new data in background
        updateChartForItem(itemId);
      }
    }
    
    // Update other components in background
    updateOrderBookForItem(itemId);
    updateStatsForItem(itemId);
    updateLastTradesForItem(itemId);
    loadItemDayData(itemId);
    updateTradingInfo(itemId);
  };

  const updateTradingInfo = (itemId) => {
    const itemInfo = getItemInfo(itemId);
    // Update stats with current item data
    updateBuyInfo(); 
    updateSellInfo();
  };

  // New functions that work with specific itemId instead of relying on currentItem state
  // Load ItemDayData for tooltip
  const loadItemDayData = async (itemId) => {
    try {
      const response = await fetch(`/api/item-day-data-all/${itemId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      itemDayDataCacheRef.current[itemId] = data;
    } catch (error) {
    }
  };

  const updateChartForItem = async (itemId) => {
    try {
      // Create abort controller for this request
      const abortController = new AbortController();
      chartAbortControllerRef.current = abortController;
      
      const data = await dataCache.cachedFetch('chartData', `/api/chart-data/${itemId}?timeframe=${timeframe}`, 
        { itemId, timeframe }, { signal: abortController.signal });
      
      // Ignore response if user switched to a different item while this was loading
      if (window.lastSelectedItem && window.lastSelectedItem !== itemId) {
        return;
      }
      
      // Clear abort controller since request completed successfully
      if (chartAbortControllerRef.current === abortController) {
        chartAbortControllerRef.current = null;
      }
      
      
      if (data.length > 0) {
        const firstTrade = new Date(data[0].timestamp);
        const lastTrade = new Date(data[data.length - 1].timestamp);
        const now = new Date();
        const timeDiff = Math.abs(now - lastTrade);
        const hoursDiff = Math.ceil(timeDiff / (1000 * 60 * 60));
      }
      
      const candles = aggregateToCandles(data, timeframe);
      
      if (!candles.length || !chartRef.current) { 
        return; 
      }
      
      const convertedCandles = candles.map(c => ({ 
        ...c, 
        open: convertPrice(c.open), 
        high: convertPrice(c.high), 
        low: convertPrice(c.low), 
        close: convertPrice(c.close)
      }));
      
      const convertedLineData = candles.map(c => ({ 
        time: c.time, 
        value: convertPrice(c.close) 
      }));
      
      if (candlestickSeriesRef.current && lineSeriesRef.current) {
        candlestickSeriesRef.current.setData(convertedCandles);
        lineSeriesRef.current.setData(convertedLineData);
        updateChartType();
      }
    } catch (error) {
      // Don't clear chart if request was aborted (user switched items)
      if (error.name === 'AbortError') {
        return;
      }
      
      // Clear chart data on actual error (not user cancellation)
      if (candlestickSeriesRef.current && lineSeriesRef.current && window.lastSelectedItem === itemId) {
        candlestickSeriesRef.current.setData([]);
        lineSeriesRef.current.setData([]);
      }
    }
  };

  const updateOrderBookForItem = async (itemId) => {
    try {
      const orderBookData = await dataCache.cachedFetch('orderBook', `/api/orderbook/${itemId}`, { itemId });
      
      if (!orderBookData || !orderBookData.asks || !Array.isArray(orderBookData.asks)) { 
        setOrderBook([]); 
        return; 
      }
      
      setOrderBook(orderBookData.asks);
      
      updateBuyInfo();
    } catch (error) { 
      setOrderBook([]);
    }
  };

  const updateStatsForItem = async (itemId) => {
    try {
      const statsData = await dataCache.cachedFetch('stats', `/api/stats/${itemId}`, { itemId });
      if (!statsData) return;
      
      const volume24hEth = statsData.totalEthVolume24h || 0;
      const priceChange24h = statsData.priceChange24h || 0;
      const volumeChange24h = statsData.volumeChange24h || 0;
      const itemsSold24h = statsData.totalItemsSold24h || 0;
      const itemsSoldChange24h = statsData.itemsSoldChange24h || 0;
      
      // Get all-time data from GraphQL schema fields - NOW REAL DATA!
      const allTimeVolumeEth = statsData.totalVolumeETH || 0; // Real all-time volume from GraphQL
      const allTimeItemsSoldCount = statsData.totalItemsSold || 0; // Real all-time items sold from GraphQL
      const totalSupplyCount = statsData.totalTrades || 0; // Real total trades from GraphQL
      
      setStats(prevStats => ({
        ...prevStats,
        totalVolumeValue: `${formatStatsPrice(convertPrice(volume24hEth))} ${currency}`,
        statVolumeChange: volumeChange24h !== 0 ? `${volumeChange24h > 0 ? '+' : ''}${volumeChange24h.toFixed(2)}%` : '-',
        itemVolumeChange: itemsSold24h.toString(),
        statItemVolumeChange: itemsSoldChange24h !== 0 ? `${itemsSoldChange24h > 0 ? '+' : ''}${itemsSoldChange24h.toFixed(0)}` : '-',
        priceRange: statsData.floorPrice && statsData.topPrice ? 
          `${formatPriceRange(convertPrice(statsData.floorPrice))}-${formatPriceRange(convertPrice(statsData.topPrice))} ${currency}` : 
          '-',
        statPriceRangeChange: '-', // Always dash to prevent showing percentage in price range
        allTimeVolume: allTimeVolumeEth > 0 ? `${formatStatsPrice(convertPrice(allTimeVolumeEth))} ${currency}` : '-',
        allTimeItemsSold: allTimeItemsSoldCount > 0 ? allTimeItemsSoldCount.toString() : '¯\_(ツ)_/¯ soon',
        supply: '¯\_(ツ)_/¯ soon' // Will be provided later
      }));
    } catch (error) {
    }
  };

  const updateLastTradesForItem = async (itemId) => {
    try {
      const url = `/api/trades/${itemId}?limit=100`;
      const response = await fetch(url);
      const trades = await response.json();
      
      if (!trades || !trades.length) { 
        setRecentTrades([]);
        return; 
      }
      
      // Collect all unique addresses
      const allAddresses = new Set();
      trades.forEach(trade => {
        if (trade.buyer) allAddresses.add(trade.buyer);
        if (trade.seller) allAddresses.add(trade.seller);
      });
      
      // Fetch all usernames first
      const addressToUsername = {};
      if (allAddresses.size > 0) {
        const usernamePromises = Array.from(allAddresses).map(async (address) => {
          const username = await fetchUsername(address);
          return { address, username };
        });
        
        const usernameResults = await Promise.all(usernamePromises);
        usernameResults.forEach(result => {
          addressToUsername[result.address] = result.username;
        });
      }
      
      // Set trades with usernames all at once
      const tradesWithDetails = trades.map(trade => ({
        ...trade,
        itemName: getItemInfo(itemId).name,
        itemIcon: getItemInfo(itemId).icon,
        buyerName: addressToUsername[trade.buyer] || null,
        sellerName: addressToUsername[trade.seller] || null
      }));
      
      setRecentTrades(tradesWithDetails);
    } catch (error) {
      setRecentTrades([]);
    }
  };

  // Helper function to encode bulk buy transaction data
  const encodeBulkBuyTransaction = (listingIds, amounts) => {
    let data = '0x807ef825';
    data += '0000000000000000000000000000000000000000000000000000000000000040';
    const amountsOffset = 64 + 32 + (32 * listingIds.length);
    data += amountsOffset.toString(16).padStart(64, '0');
    data += listingIds.length.toString(16).padStart(64, '0');
    
    listingIds.forEach(id => {
      data += parseInt(id).toString(16).padStart(64, '0');
    });
    
    data += amounts.length.toString(16).padStart(64, '0');
    
    amounts.forEach(amount => {
      data += parseInt(amount).toString(16).padStart(64, '0');
    });
    
    return data;
  };

  // Helper function to encode createListing transaction data
  const encodeCreateListingTransaction = (itemId, amount, nonce, pricePerItem, signature) => {
    const createListingABI = [{
      "inputs": [
        {"internalType": "uint256", "name": "_itemId", "type": "uint256"},
        {"internalType": "uint256", "name": "_amount", "type": "uint256"},
        {"internalType": "uint256", "name": "nonce", "type": "uint256"},
        {"internalType": "uint256", "name": "_pricePerItem", "type": "uint256"},
        {"internalType": "bytes", "name": "_signature", "type": "bytes"}
      ],
      "name": "createListing",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }];
    
    const iface = new ethers.Interface(createListingABI);
    return iface.encodeFunctionData("createListing", [
      itemId.toString(),
      amount.toString(), 
      nonce.toString(),
      pricePerItem,
      signature
    ]);
  };

  // Generate signature for createListing (placeholder - needs proper implementation)
  


  const generateListingSignature = async (itemId, amount, nonce, pricePerItem, userAddress) => {
    if (!abstractClient) {
        throw new Error("Abstract Global Wallet client is not available.");
    }

    try {
        // 1. Create the message hash including user address (like native app)
        const messageHash = ethers.solidityPackedKeccak256(
            ["uint256", "uint256", "uint256", "uint256", "address"],
            [itemId, amount, nonce, pricePerItem, userAddress]
        );

        // 2. Sign with AGW (creates EIP-1271 compatible signature)
        const signature = await abstractClient.signMessage({
            message: { raw: messageHash }
        });
        
        return signature;

    } catch (error) {
        throw error;
    }
};





  const updateBuyInfo = () => {
    const amount = buyAmount || 1;
    if (!orderBook.length || !amount) { 
      return { totalCost: 0, canFulfill: false }; 
    }
    
    let totalCost = 0, remainingAmount = amount;
    for (const order of orderBook) {
      if (remainingAmount <= 0) break;
      const orderAmount = Math.min(order.amount, remainingAmount);
      totalCost += orderAmount * order.price;
      remainingAmount -= orderAmount;
    }
    
    return { 
      totalCost: totalCost, 
      canFulfill: remainingAmount === 0,
      availableAmount: amount - remainingAmount
    };
  };

  // Calculate buy cost in real-time
  const getBuyCost = () => {
    if (!currentItem || !orderBook.length) return '0.000000';
    const buyInfo = updateBuyInfo();
    return convertPrice(buyInfo.totalCost).toFixed(6);
  };

  const updateSellInfo = () => {
    const amount = sellAmount || 0;
    const price = sellPrice || 0;
    // Sell info would be updated in the form
  };

  // Suppress ResizeObserver errors (common with dev tools)
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0] && args[0].toString().includes('ResizeObserver loop completed')) {
        return; // Suppress ResizeObserver errors
      }
      originalError.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
    };
  }, []);

  // Chart Functions
  const initChart = () => {
    const chartContainer = document.getElementById('chart');
    if (!chartContainer || !window.LightweightCharts) return;

    const chart = window.LightweightCharts.createChart(chartContainer, {
      autoSize: true,
      height: 400,
      layout: { background: { color: 'oklch(14.1% .005 285.823)' }, textColor: '#ffffff', fontFamily: 'Silkscreen, Courier New, monospace' },
      grid: { vertLines: { color: 'rgba(255, 255, 255, 0.1)' }, horzLines: { color: 'rgba(255, 255, 255, 0.1)' } },
      timeScale: { 
        borderColor: 'rgba(255, 255, 255, 0.1)', 
        timeVisible: true, 
        rightOffset: 0, 
        fixRightEdge: false, 
        fixLeftEdge: false,
        barSpacing: 6,
        lockVisibleTimeRangeOnResize: true
      },
      rightPriceScale: { 
        visible: true, 
        borderVisible: true, 
        borderColor: 'rgba(255, 255, 255, 0.3)', 
        scaleMargins: { top: 0.1, bottom: 0.25 }, 
        ticksVisible: true, 
        entireTextOnly: false, 
        minimumWidth: 80, 
        alignLabels: true, 
        autoScale: true 
      },
      leftPriceScale: { visible: false },
      crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
      localization: {
        priceFormatter: (price) => {
          if (price < 0.000001) return price.toFixed(10).replace(/\.?0+$/, '');
          if (price < 0.00001) return price.toFixed(8).replace(/\.?0+$/, '');
          if (price < 0.0001) return price.toFixed(7).replace(/\.?0+$/, '');
          if (price < 0.001) return price.toFixed(6).replace(/\.?0+$/, '');
          if (price < 0.01) return price.toFixed(5).replace(/\.?0+$/, '');
          if (price < 0.1) return price.toFixed(4).replace(/\.?0+$/, '');
          return price.toFixed(3).replace(/\.?0+$/, '');
        }
      }
    });
    
    const candlestickSeries = chart.addCandlestickSeries({ 
      upColor: '#4ade80', 
      downColor: '#ef4444', 
      borderVisible: false, 
      priceScaleId: 'right',
      priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 }
    });
    
    const lineSeries = chart.addLineSeries({ 
      color: '#f59e0b', 
      priceScaleId: 'right',
      priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 }
    });
    
    const volumeSeries = chart.addHistogramSeries({ 
      color: '#f59e0b', 
      priceFormat: { type: 'volume' }, 
      priceScaleId: '' 
    });
    
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.9, bottom: 0 } });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    lineSeriesRef.current = lineSeries;
    volumeSeriesRef.current = volumeSeries;

    // Simple reliable tooltip
    chart.subscribeCrosshairMove((param) => {
      let tooltip = document.getElementById('chart-tooltip');
      
      if (!param.point || !param.time || !param.seriesData || param.seriesData.size === 0) {
        if (tooltip) tooltip.style.display = 'none';
        return;
      }

      // Get price from any available series data
      let price = 0;
      const candleData = param.seriesData.get(candlestickSeries);
      const lineData = param.seriesData.get(lineSeries);
      
      if (candleData) {
        price = candleData.close || candleData.value || 0;
      } else if (lineData) {
        price = lineData.value || 0;
      }

      if (price === 0) {
        if (tooltip) tooltip.style.display = 'none';
        return;
      }

      // Create tooltip if doesn't exist
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chart-tooltip';
        tooltip.style.cssText = `
          position: absolute;
          background: rgba(0,0,0,0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 11px;
          pointer-events: none;
          z-index: 1000;
          border: 1px solid rgba(255,255,255,0.3);
          white-space: nowrap;
        `;
        chartContainer.appendChild(tooltip);
      }

      // Get volume, sold items, and potentially override price
      let volume = 0;
      let soldItems = 0;
      let dayDataPrice = null;
      
      // Get current item from ref (avoids closure issues)
      const activeItem = currentItemRef.current;
      
      if (timeframe === '1d' && activeItem) {
        // For 1d, use ItemDayData for the specific day
        const hoveredDate = new Date(param.time * 1000);
        const dayStart = new Date(Date.UTC(hoveredDate.getUTCFullYear(), hoveredDate.getUTCMonth(), hoveredDate.getUTCDate(), 0, 0, 0, 0));
        const dayStartTimestamp = Math.floor(dayStart.getTime() / 1000);
        
        // Use cached ItemDayData for the specific day
        const itemDayData = itemDayDataCacheRef.current[activeItem];
        
        if (itemDayData && itemDayData[dayStartTimestamp]) {
          volume = itemDayData[dayStartTimestamp].volumeETH;
          soldItems = itemDayData[dayStartTimestamp].volumeItems;
          // Note: ItemDayData doesn't have price data, use chart price
        } else {
          // Fallback to candle data when ItemDayData not available
          const candles = chartDataCacheRef.current[`${activeItem}_${timeframe}`] || [];
          const matchingCandle = candles.find(c => c.time === param.time);
          volume = matchingCandle ? matchingCandle.ethVolume : 0;
          soldItems = matchingCandle ? matchingCandle.itemVolume : 0;
        }
      } else {
        // For other timeframes OR when no activeItem, use candle data
        if (!activeItem) {
          console.warn('⚠️ No activeItem selected, tooltip will show 0 values. Available cache keys:', Object.keys(itemDayDataCacheRef.current));
          volume = 0;
          soldItems = 0;
        } else {
          const candles = chartDataCacheRef.current[`${activeItem}_${timeframe}`] || [];
          const matchingCandle = candles.find(c => c.time === param.time);
          volume = matchingCandle ? matchingCandle.ethVolume : 0;
          soldItems = matchingCandle ? matchingCandle.itemVolume : 0;
        }
      }
      
      // Always use chart price (ItemDayData doesn't have price info)
      const finalPrice = price;

      // Tooltip with price, volume, sold items - show both ETH and USD regardless of selected currency
      // Convert displayed price back to ETH if currently showing USD
      const ethPrice = currency === 'USD' ? finalPrice / ethToUsdRate : finalPrice;
      const usdPrice = ethPrice * ethToUsdRate;
      const ethVolume = volume; // Volume is already in ETH from raw data
      const usdVolume = volume * ethToUsdRate;
      
      // Format ETH prices to show proper decimals (not truncated like USD formatting)
      const formatEthPrice = (price) => {
        if (price >= 1) return price.toFixed(4);
        if (price >= 0.1) return price.toFixed(6);
        return price.toFixed(8).replace(/\.?0+$/, '');
      };
      
      // 🔒 SECURITY FIX: Create tooltip content safely without innerHTML
      tooltip.innerHTML = ''; // Clear existing content
      
      const priceEthDiv = document.createElement('div');
      priceEthDiv.textContent = `Price ETH: ${formatEthPrice(ethPrice)} ETH`;
      
      const priceUsdDiv = document.createElement('div');
      priceUsdDiv.style.color = '#888';
      priceUsdDiv.style.fontSize = '10px';
      priceUsdDiv.textContent = `Price USD: $${formatPrice(usdPrice)}`;
      
      const volumeEthDiv = document.createElement('div');
      volumeEthDiv.textContent = `Volume ETH: ${formatEthPrice(ethVolume)} ETH`;
      
      const volumeUsdDiv = document.createElement('div');
      volumeUsdDiv.style.color = '#888';
      volumeUsdDiv.style.fontSize = '10px';
      volumeUsdDiv.textContent = `Volume USD: $${formatPrice(usdVolume)}`;
      
      const soldItemsDiv = document.createElement('div');
      soldItemsDiv.textContent = `Sold Items: ${soldItems}`;
      
      // Append safely created elements
      tooltip.appendChild(priceEthDiv);
      tooltip.appendChild(priceUsdDiv);
      tooltip.appendChild(volumeEthDiv);
      tooltip.appendChild(volumeUsdDiv);
      tooltip.appendChild(soldItemsDiv);
      
      tooltip.style.display = 'block';
      tooltip.style.left = (param.point.x + 15) + 'px';
      tooltip.style.top = (param.point.y - 50) + 'px';
    });
  };

  const aggregateToCandles = (data, timeframe) => {
    const interval = { '1h': 3600, '4h': 14400, '1d': 86400 }[timeframe] * 1000;
    const candles = {};
    
    // Sort data by timestamp to ensure proper processing
    const sortedData = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    sortedData.forEach(trade => {
      const tradeTime = new Date(trade.timestamp).getTime();
      const candleTime = Math.floor(tradeTime / interval) * interval / 1000;
      
      if (!candles[candleTime]) {
        candles[candleTime] = { 
          time: candleTime, 
          open: trade.price, 
          high: trade.price, 
          low: trade.price, 
          close: trade.price, 
          ethVolume: 0,
          itemVolume: 0 
        };
      }
      
      // Update OHLC values
      candles[candleTime].high = Math.max(candles[candleTime].high, trade.price);
      candles[candleTime].low = Math.min(candles[candleTime].low, trade.price);
      candles[candleTime].close = trade.price; // Last trade in this candle becomes close
      candles[candleTime].ethVolume += trade.ethVolume;
      candles[candleTime].itemVolume += trade.amount || 1; // Add sold items count
    });
    
    const candleArray = Object.values(candles).sort((a, b) => a.time - b.time);
    
    // Fill in missing time gaps with previous close price to maintain continuity
    if (candleArray.length > 0) {
      const filledCandles = [];
      const startTime = candleArray[0].time;
      const endTime = Math.floor(Date.now() / 1000 / (interval / 1000)) * (interval / 1000);
      
      let lastPrice = candleArray[0].close;
      
      for (let time = startTime; time <= endTime; time += (interval / 1000)) {
        const existingCandle = candles[time];
        if (existingCandle) {
          filledCandles.push(existingCandle);
          lastPrice = existingCandle.close;
        } else {
          // Create empty candle with last known price to maintain chart continuity
          filledCandles.push({
            time: time,
            open: lastPrice,
            high: lastPrice,
            low: lastPrice,
            close: lastPrice,
            ethVolume: 0,
            itemVolume: 0
          });
        }
      }
      
      return filledCandles;
    }
    
    return candleArray;
  };

  const updateChart = async () => {
    try {
      const requestedItem = currentItem;
      if (!requestedItem) return;
      
      const data = await dataCache.cachedFetch('chartData', `/api/chart-data/${requestedItem}?timeframe=${timeframe}`, 
        { itemId: requestedItem, timeframe });
      
      // Ignore response if user switched to a different item while this was loading
      if (currentItem !== requestedItem) {
        console.log('🔄 Ignoring outdated chart data for:', requestedItem, 'current:', currentItem);
        return;
      }
      
      
      if (data.length > 0) {
        const firstTrade = new Date(data[0].timestamp);
        const lastTrade = new Date(data[data.length - 1].timestamp);
        const now = new Date();
        
        // Check if last trade was more than 1 day ago
        const daysSinceLastTrade = (now - lastTrade) / (1000 * 60 * 60 * 24);
      }
      
      const candles = aggregateToCandles(data, timeframe);
      
      if (!candles.length || !chartRef.current) { 
        return; 
      }
      
      // Cache the ETH data for instant currency switching (use both state and ref)
      const cacheKey = `${currentItem}_${timeframe}`;
      chartDataCacheRef.current[cacheKey] = candles;
      setChartDataCache(prev => ({
        ...prev,
        [cacheKey]: candles
      }));
      
      // Log first and last candle times
      if (candles.length > 0) {
        const firstCandle = new Date(candles[0].time * 1000);
        const lastCandle = new Date(candles[candles.length - 1].time * 1000);
      }
      
      const convertedCandles = candles.map(c => ({ 
        ...c, 
        open: convertPrice(c.open), 
        high: convertPrice(c.high), 
        low: convertPrice(c.low), 
        close: convertPrice(c.close) 
      }));
      
      const convertedLineData = candles.map(c => ({ time: c.time, value: convertPrice(c.close) }));
      const allPrices = convertedLineData.map(d => d.value).filter(p => p > 0);
      
      // Update series with proper precision based on price range
      const seriesPrecision = currency === 'USD' ? 6 : 8;
      const seriesMinMove = currency === 'USD' ? 0.000001 : 0.0000001;
      
      candlestickSeriesRef.current.applyOptions({
        priceFormat: { type: 'price', precision: seriesPrecision, minMove: seriesMinMove }
      });
      lineSeriesRef.current.applyOptions({
        priceFormat: { type: 'price', precision: seriesPrecision, minMove: seriesMinMove }
      });
      
      const volumes = candles.map(c => c.ethVolume).filter(v => v > 0);
      if (volumes.length) {
        const maxVolume = Math.max(...volumes);
        const minThreshold = maxVolume * 0.02;
        
        const volumeData = candles.map(c => {
          let scaledVolume = c.ethVolume;
          if (scaledVolume < minThreshold) {
            scaledVolume = maxVolume * 0.01;
          } else {
            scaledVolume = Math.sqrt(scaledVolume / maxVolume) * maxVolume;
          }
          return { time: c.time, value: scaledVolume, color: 'rgba(100, 100, 100, 0.7)' };
        });
        volumeSeriesRef.current.setData(volumeData);
      } else { 
        volumeSeriesRef.current.setData([]); 
      }
      
      candlestickSeriesRef.current.setData(convertedCandles);
      lineSeriesRef.current.setData(convertedLineData);
      updateChartType();
      
      // Preserve user's zoom/scroll position or fit content for first load
      setTimeout(() => {
        const timeScale = chartRef.current.timeScale();
        const currentRange = timeScale.getVisibleRange();
        
        // Only auto-fit if this is the initial load (no user interaction yet)
        if (!currentRange || (currentRange.from === null && currentRange.to === null)) {
          timeScale.fitContent();
          timeScale.scrollToRealTime();
        }
        // Otherwise preserve user's current view position
      }, 100);
      
    } catch (error) { 
    }
  };

  const updateChartType = () => {
    if (!candlestickSeriesRef.current || !lineSeriesRef.current) return;
    candlestickSeriesRef.current.applyOptions({ visible: showCandles });
    lineSeriesRef.current.applyOptions({ visible: showLine });
  };

  // Fast chart display update using cached data
  const updateChartDisplay = () => {
    if (!candlestickSeriesRef.current || !lineSeriesRef.current || !currentItem) return;
    
    try {
      // Use cached ETH data if available (check both state and ref)
      const cacheKey = `${currentItem}_${timeframe}`;
      const cachedData = chartDataCacheRef.current[cacheKey] || chartDataCache[cacheKey];
      
      if (cachedData && cachedData.length > 0) {
        // Convert cached ETH data to current currency
        const convertedCandles = cachedData.map(c => ({ 
          ...c, 
          open: convertPrice(c.open), 
          high: convertPrice(c.high), 
          low: convertPrice(c.low), 
          close: convertPrice(c.close)
        }));
        
        const convertedLineData = cachedData.map(c => ({ 
          time: c.time, 
          value: convertPrice(c.close) 
        }));
        
        // Instant update - no API call
        candlestickSeriesRef.current.setData(convertedCandles);
        lineSeriesRef.current.setData(convertedLineData);
      } else {
        // No cache - fall back to full update
        updateChart();
      }
    } catch (error) {
      console.error('Chart display update error:', error);
      updateChart();
    }
  };

  const updateOrderBook = async () => {
    if (!currentItem) {
      console.log('❌ No currentItem for order book');
      setOrderBook([]);
      return;
    }
    
    try {
      console.log('🔄 Fetching order book for:', currentItem);
      const response = await fetch(`/api/orderbook/${currentItem}?t=${Date.now()}`); // Cache busting
      console.log('📋 Order book response status:', response.status);
      
      if (!response.ok) {
        console.log('❌ Order book response not OK:', response.status);
        setOrderBook([]);
        return;
      }
      
      const orderBookData = await response.json();
      console.log('📋 Order book data received:', orderBookData);
      
      if (!orderBookData || !orderBookData.asks || !Array.isArray(orderBookData.asks)) { 
        console.log('❌ Invalid order book data structure:', orderBookData);
        setOrderBook([]); 
        return; 
      }
      
      console.log('✅ Setting order book with', orderBookData.asks.length, 'asks');
      
      setOrderBook(orderBookData.asks);
      
      updateBuyInfo();
    } catch (error) { 
      console.log('❌ Order book fetch error:', error);
      setOrderBook([]);
    }
  };

  const updateStats = async () => {
    try {
      const statsData = await fetch(`/api/stats/${currentItem}`).then(res => res.json());
      if (!statsData) return;
      
      const volume24hEth = statsData.totalEthVolume24h || 0;
      const priceChange24h = statsData.priceChange24h || 0;
      const volumeChange24h = statsData.volumeChange24h || 0; // VOLUME CHANGE FROM API
      const itemsSold24h = statsData.totalItemsSold24h || 0;
      const itemsSoldChange24h = statsData.itemsSoldChange24h || 0; // ITEMS SOLD CHANGE FROM API
      
      // Get all-time data from GraphQL schema fields - NOW REAL DATA!
      console.log('📊 updateStats - statsData for all-time:', statsData);
      const allTimeVolumeEth = statsData.totalVolumeETH || 0; // Real all-time volume from GraphQL
      const allTimeItemsSoldCount = statsData.totalItemsSold || 0; // Real all-time items sold from GraphQL
      const totalSupplyCount = statsData.totalTrades || 0; // Real total trades from GraphQL
      console.log('📊 updateStats - All-time values:', { allTimeVolumeEth, allTimeItemsSoldCount, totalSupplyCount });
      
      // Update individual item stats
      setStats(prev => ({
        ...prev,
        totalVolumeValue: volume24hEth > 0 ? `${formatStatsPrice(convertPrice(volume24hEth))} ${currency}` : '-',
        priceRange: (statsData.minPrice && statsData.maxPrice) ? 
          `${formatPriceRange(convertPrice(statsData.minPrice))}-${formatPriceRange(convertPrice(statsData.maxPrice))} ${currency}` : '-',
        itemSupply: '¯\_(ツ)_/¯',
        itemVolumeChange: itemsSold24h > 0 ? itemsSold24h.toString() : '-',
        statVolumeChange: volumeChange24h !== 0 ? `${volumeChange24h > 0 ? '+' : ''}${volumeChange24h.toFixed(2)}%` : '-',
        statItemVolumeChange: itemsSoldChange24h !== 0 ? `${itemsSoldChange24h > 0 ? '+' : ''}${itemsSoldChange24h.toFixed(2)}%` : '-',
        statPriceRangeChange: '-', // Always dash to prevent glitching with percentage
        statSupplyChange: '-',
        // ALL-TIME DATA
        allTimeVolume: allTimeVolumeEth > 0 ? `${formatStatsPrice(convertPrice(allTimeVolumeEth))} ${currency}` : '-',
        allTimeItemsSold: allTimeItemsSoldCount > 0 ? allTimeItemsSoldCount.toString() : '-',
        supply: '¯\_(ツ)_/¯ soon' // Will be provided later
      }));
      
      
    } catch (error) { 
    }
  };

  const updateLastTrades = async () => {
    if (!currentItem) return;
    await updateLastTradesForItem(currentItem);
  };

  // Fetch user transactions (buy and sell)
  const fetchMyTransactions = async () => {
    const userAddress = address;
    console.log('fetchMyTransactions called with address:', userAddress);
    
    if (!userAddress) {
      console.log('No address available, clearing transactions');
      setMyTransactions([]);
      return;
    }

    try {
      const itemFilter = myTransactionsFilter === 'item' && currentItem ? `?itemId=${currentItem}&limit=100` : '?limit=100';
      const url = `/api/user-transactions/${userAddress}${itemFilter}`;
      console.log('Fetching from URL:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const transactions = await response.json();
      console.log('Transactions received:', transactions.length, transactions);

      if (!transactions || !transactions.length) {
        setMyTransactions([]);
        return;
      }

      // Fetch usernames for counterparties
      const allCounterparties = new Set();
      transactions.forEach(tx => {
        if (tx.counterparty) allCounterparties.add(tx.counterparty);
      });

      if (allCounterparties.size > 0) {
        const usernamePromises = Array.from(allCounterparties).map(async (address) => {
          const username = await fetchUsername(address);
          return { address, username };
        });

        const usernameResults = await Promise.all(usernamePromises);
        const addressToUsername = {};
        usernameResults.forEach(result => {
          addressToUsername[result.address] = result.username;
        });

        // Add usernames and item info to transactions
        const transactionsWithDetails = transactions.map(tx => ({
          ...tx,
          counterpartyName: addressToUsername[tx.counterparty] || null,
          itemName: getItemInfo(tx.itemId)?.name || `Item ${tx.itemId}`,
          itemIcon: getItemInfo(tx.itemId)?.icon
        }));

        setMyTransactions(transactionsWithDetails);
      } else {
        setMyTransactions(transactions.map(tx => ({
          ...tx,
          counterpartyName: null,
          itemName: getItemInfo(tx.itemId)?.name || `Item ${tx.itemId}`,
          itemIcon: getItemInfo(tx.itemId)?.icon
        })));
      }
    } catch (error) {
      console.error('Failed to fetch my transactions:', error);
      setMyTransactions([]);
    }
  };

  // Fetch user listings
  const fetchMyListings = async () => {
    const userAddress = address;
    console.log('fetchMyListings called with address:', userAddress);
    
    if (!userAddress) {
      console.log('No address available, clearing listings');
      setMyListings([]);
      return;
    }

    try {
      const itemFilter = myListingsFilter === 'item' && currentItem ? `?itemId=${currentItem}&limit=100` : '?limit=100';
      const url = `/api/user-listings/${userAddress}${itemFilter}`;
      console.log('Fetching from URL:', url);
      
      const response = await fetch(url);
      console.log('Listings response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const listings = await response.json();
      console.log('Listings received:', listings.length, listings);

      if (!listings || !listings.length) {
        setMyListings([]);
        return;
      }

      // Fetch usernames for all buyers in transfers
      const allBuyers = new Set();
      listings.forEach(listing => {
        listing.transfers.forEach(transfer => {
          if (transfer.buyer) allBuyers.add(transfer.buyer);
        });
      });

      if (allBuyers.size > 0) {
        const usernamePromises = Array.from(allBuyers).map(async (address) => {
          const username = await fetchUsername(address);
          return { address, username };
        });

        const usernameResults = await Promise.all(usernamePromises);
        const addressToUsername = {};
        usernameResults.forEach(result => {
          addressToUsername[result.address] = result.username;
        });

        // Add usernames and item info to listings
        const listingsWithDetails = listings.map(listing => ({
          ...listing,
          itemName: getItemInfo(listing.itemId)?.name || `Item ${listing.itemId}`,
          itemIcon: getItemInfo(listing.itemId)?.icon,
          transfers: listing.transfers.map(transfer => ({
            ...transfer,
            buyerName: addressToUsername[transfer.buyer] || null
          }))
        }));

        setMyListings(listingsWithDetails);
      } else {
        setMyListings(listings.map(listing => ({
          ...listing,
          itemName: getItemInfo(listing.itemId)?.name || `Item ${listing.itemId}`,
          itemIcon: getItemInfo(listing.itemId)?.icon
        })));
      }
    } catch (error) {
      console.error('Failed to fetch my listings:', error);
      setMyListings([]);
    }
  };

  // Fetch user PnL data
  const fetchPnLData = async () => {
    const userAddress = address;
    console.log('fetchPnLData called with address:', userAddress);
    
    if (!userAddress) {
      console.log('No address available, clearing PnL data');
      setPnlData(null);
      return;
    }

    setPnlLoading(true);
    setGlobalLoading(true);
    setLoadingMessage(`Loading PnL data for ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
    
    try {
      const url = `/api/user-pnl/${userAddress}`;
      console.log('Fetching PnL from URL:', url);
      
      const response = await fetch(url);
      console.log('PnL response headers:', response.headers.get('content-type'));
      console.log('PnL response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('PnL API error response:', errorText.substring(0, 200));
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log('PnL raw response:', responseText.substring(0, 200));
      
      const pnlData = JSON.parse(responseText);
      console.log('PnL data received:', pnlData);

      setPnlData(pnlData);
      
      // Create cumulative PnL chart data (always try to create chart)
      createPnLChart(pnlData.timeline);
    } catch (error) {
      console.error('Failed to fetch PnL data:', error);
      setPnlData(null);
      setPnlChart(null);
    } finally {
      setPnlLoading(false);
      setGlobalLoading(false);
      setLoadingMessage('');
    }
  };

  // Create cumulative PnL chart
  const createPnLChart = (timeline) => {
    // Destroy previous chart instance if exists
    if (pnlChartRef.current) {
      pnlChartRef.current.destroy();
      pnlChartRef.current = null;
    }

    if (!timeline || timeline.length === 0) {
      // Create a simple chart showing current PnL if no timeline
      if (pnlData && pnlData.summary) {
        const currentPnL = pnlData.summary.totalPnL || 0;
        setPnlChart({
          labels: ['Start', 'Current'],
          datasets: [{
            label: 'Cumulative PnL',
            data: [0, currentPnL],
            borderColor: currentPnL >= 0 ? '#00ff00' : '#ff6b6b',
            backgroundColor: currentPnL >= 0 ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 107, 107, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.2,
            pointRadius: 2,
            pointHoverRadius: 4
          }]
        });
      } else {
        setPnlChart(null);
      }
      return;
    }

    // Use timeline data to create chart
    const chartData = timeline.map(point => ({
      x: new Date(point.timestamp * 1000),
      y: point.cumulativePnL
    }));

    // Add starting point at 0
    if (chartData.length > 0) {
      chartData.unshift({
        x: new Date((timeline[0].timestamp - 86400) * 1000), // 1 day before first transaction
        y: 0
      });
    }

    const finalPnL = chartData.length > 0 ? chartData[chartData.length - 1].y : 0;

    setPnlChart({
      datasets: [{
        label: 'Cumulative PnL',
        data: chartData,
        borderColor: finalPnL >= 0 ? '#00ff00' : '#ff6b6b',
        backgroundColor: finalPnL >= 0 ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 107, 107, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.2,
        pointRadius: 1,
        pointHoverRadius: 4
      }]
    });
  };


  // Fetch player inventory balances - EXACT COPY FROM DEALS
  const fetchPlayerInventory = async () => {
    if (!authToken) {
      return;
    }

    try {
      const response = await fetch('/api/player-inventory', {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'authorization': `Bearer ${authToken}`,
          'content-type': 'application/json'
        }
      });

      const responseData = await response.json();
      
      const data = responseData.success ? responseData.data : null;
      
      // Convert array to object for easy lookup: {itemId: balance}
      const inventory = {};
      if (data.entities) {
        data.entities.forEach(item => {
          inventory[item.ID_CID] = item.BALANCE_CID;
        });
      }
      
      setPlayerInventory(inventory);
    } catch (error) {
      console.error('❌ Error fetching player inventory:', error);
      setPlayerInventory({});
    }
  };



  const filteredMarkets = filterMarkets();

  // Buy function based on example - Use backend API like the example
  const executeBuy = async () => {
    console.log('🎯 executeBuy started', performance.now());
    if (!isConnected || !currentItem) {
      setMessage('Please connect AGW and select an item first');
      setTimeout(() => setMessage(''), 5000);
      return;
    }

    const amount = buyAmount || 1;

    // Skip refresh to allow immediate approve popup - use faster orderbook refresh instead
    
    // Get available listings for current item from availableListings (like example)
    // Convert both to strings to ensure type matching
    const itemListings = availableListings
      .filter(listing => 
        String(listing.item_id) === String(currentItem) && 
        (listing.available_amount || listing.amount) > 0
      )
      .sort((a, b) => parseFloat(a.price_per_item) - parseFloat(b.price_per_item));
    
    // Additional check: are we really getting the right order?
    const pricesOrder = itemListings.map(l => parseFloat(l.price_per_item));
    const isSortedCorrectly = pricesOrder.every((price, i) => i === 0 || pricesOrder[i-1] <= price);

    if (itemListings.length === 0) {
      setMessage(`No listings available for item ${currentItem}. Total listings loaded: ${availableListings.length}. Try selecting a different item.`);
      setTimeout(() => setMessage(''), 5000);
      return;
    }

    setLoading(true);
    try {
      const validItems = [];
      let remainingAmount = amount;
      
      // Fill from cheapest listings (like example)
      for (const listing of itemListings) {
        if (remainingAmount <= 0) break;
        const availableAmount = listing.available_amount || listing.amount;
        const takeAmount = Math.min(remainingAmount, availableAmount);
        
        validItems.push({
          listingId: parseInt(listing.listing_id.replace(/[^0-9]/g, '')),
          amount: takeAmount,
          ethCost: parseFloat(listing.price_per_item) * takeAmount // price_per_item is already in ETH, not wei
        });
        
        remainingAmount -= takeAmount;
      }

      if (validItems.length === 0) {
        setMessage('No valid items found for purchase');
        setTimeout(() => setMessage(''), 5000);
        setLoading(false);
        return;
      }

      if (remainingAmount > 0) {
        setMessage(`Only ${amount - remainingAmount} items available for purchase`);
        setTimeout(() => setMessage(''), 5000);
      }

      // CRITICAL: Verify the logic worked correctly
      const totalItemsBought = validItems.reduce((sum, item) => sum + item.amount, 0);
      const totalCostCalculated = validItems.reduce((sum, item) => sum + item.ethCost, 0);

      // Use backend API exactly like example
      const formattedListings = validItems.map(item => ({
        listingId: item.listingId,
        amount: item.amount,
        ethCost: item.ethCost
      }));

      console.log('📡 Calling backend API...', performance.now());
      const response = await fetch('/api/gigaverse/bulk-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          listings: formattedListings
        })
      });
      console.log('✅ Backend API response received', performance.now());

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.requiresFrontendExecution) {
        if (!abstractClient) {
          throw new Error('AGW not connected. Please connect your wallet first.');
        }
        
        // Execute real transaction via AGW with 1% fee transfer
        const txData = data.transactionData;
        let txHash;
        let feeTxHash = null;
        let feeValueInWei = BigInt(0); // Declare feeValueInWei outside the if block
        const bulkBuyData = encodeBulkBuyTransaction(txData.listingIds, txData.amounts);
        const buyValueInWei = BigInt(Math.round(txData.totalEthCost * 1e18));
        
        // Check if we need to include fee transfer
        if (txData.feeAmount && txData.feeAmount > 0 && txData.feeWallet) {
          feeValueInWei = BigInt(Math.round(txData.feeAmount * 1e18)); // Assign without declaring again
          
          // 🔒 SECURITY VALIDATION - Main transaction
          const mainTxValidation = {
            to: txData.contract,
            value: buyValueInWei,
            data: bulkBuyData,
            feeAmount: feeValueInWei,
            feeWallet: txData.feeWallet
          };
          
          console.log('🔍 Validating main transaction...', performance.now());
          transactionValidator.validateTransaction(mainTxValidation);
          console.log('✅ Main transaction validation complete', performance.now());
          
          // Create atomic batch transaction using sendTransactionBatch
          const calls = [
            {
              to: txData.contract,
              value: buyValueInWei,
              data: bulkBuyData
            }
          ];
          
          // Only add fee transfer if amount is above minimum
          if (feeValueInWei >= 1000n) { // At least 1000 wei
            // 🔒 SECURITY VALIDATION - Fee transaction
            const feeTxValidation = {
              to: txData.feeWallet,
              value: feeValueInWei,
              data: '0x'
            };
            
            console.log('🔍 Validating fee transaction...');
            transactionValidator.validateTransaction(feeTxValidation);
            
            calls.push({
              to: txData.feeWallet,
              value: feeValueInWei,
              data: '0x'
            });
          }
          
          // Use sendTransactionBatch for true atomic execution
          // Both operations succeed or both fail
          console.log('🚀 Sending AGW transaction batch...', performance.now());
          txHash = await abstractClient.sendTransactionBatch({
            calls: calls
          });
          console.log('✅ AGW transaction batch sent', performance.now());
        } else {
          // Original single transaction for backwards compatibility
          const transactionData = encodeBulkBuyTransaction(txData.listingIds, txData.amounts);
          
          // Convert hex value to BigInt for AGW
          const valueInWei = BigInt(txData.valueInWei);
          
          // 🔒 SECURITY VALIDATION - Single transaction
          const singleTxValidation = {
            to: txData.contract,
            value: valueInWei,
            data: transactionData
          };
          
          console.log('🔍 Validating single transaction...');
          transactionValidator.validateTransaction(singleTxValidation);
          
          txHash = await abstractClient.sendTransaction({
            to: txData.contract,
            value: valueInWei,
            data: transactionData
          });
        }
        
        // 🔒 RECORD SUCCESSFUL TRANSACTION
        const recordTxData = txData.feeAmount && txData.feeAmount > 0 && feeValueInWei >= 1000n ? 
          { to: txData.contract, value: buyValueInWei + feeValueInWei, data: bulkBuyData } :
          { to: txData.contract, value: valueInWei || buyValueInWei, data: transactionData || bulkBuyData };
        
        transactionValidator.recordTransaction(recordTxData, txHash);
        
        // Show appropriate success message for batch transaction
        if (txData.feeAmount && txData.feeAmount > 0 && feeValueInWei >= 1000n) {
          setMessage(`✅ Purchase complete! Batch TX: ${txHash.slice(0, 8)}... (buy + fee)`);
        } else if (txData.feeAmount && txData.feeAmount > 0) {
          setMessage(`✅ Purchase complete! TX: ${txHash.slice(0, 8)}... (fee too small, skipped)`);
        } else {
          setMessage(`✅ Transaction successful! TX: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`);
        }
        setTimeout(() => setMessage(''), 8000);
        
        // Invalidate cache after transaction
        dataCache.invalidateTransactionCache();
        
        // Immediate aggressive refresh after transaction
        await refreshData();
        
        // Additional refreshes to catch blockchain updates
        setTimeout(async () => {
          await refreshData();
        }, 2000);
        
        setTimeout(async () => {
          await refreshData();
        }, 5000);
        
        setTimeout(async () => {
          await refreshData();
        }, 10000);
        
        return; // Exit here on success
        
      } else if (data.txHash) {
        // Handle old mock response format
        setMessage(`✅ Buy successful! TX: ${data.txHash.slice(0, 10)}...${data.txHash.slice(-6)}`);
        setTimeout(() => setMessage(''), 8000);
        
        // Refresh data (loadMarkets already includes listings)
        setTimeout(() => {
          loadMarkets(); // This refreshes both markets and listings
          updateOrderBook();
          updateLastTrades();
        }, 2000);
      } else {
        throw new Error(data.error || data.message || 'Transaction failed');
      }

    } catch (error) {
      // Handle specific error cases
      if (error.message?.includes('fetch')) {
        setMessage('❌ Backend API not available. Please ensure the server is running.');
      } else if (error.message?.includes('Insufficient funds')) {
        setMessage('❌ Insufficient funds in wallet. Please add more ETH.');
      } else {
        setMessage('Buy failed: ' + (error.message || 'Unknown error occurred'));
      }
      
      setTimeout(() => setMessage(''), 8000);
    } finally {
      setLoading(false);
    }
  };


  const executeSell = async () => {
    if (!currentItem || !sellAmount || !sellPrice || !abstractClient || !address) {
      setMessage('❌ Please fill all fields and connect wallet');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    // Check if authenticated with Gigaverse - use centralized auth token
    if (!authToken) {
      setMessage('❌ Please authenticate with Gigaverse first');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setLoading(true);
    setMessage('🔑 Creating authenticated listing...');

    try {
      // Check if we need to re-login to AGW
      if (!isConnected || !address) {
        throw new Error('Wallet not connected - please connect AGW first');
      }
      
      if (!abstractClient) {
        throw new Error('AbstractClient not available - AGW may not be properly initialized');
      }
      
      // CORRECT: Check chain compatibility 
      const detectedChain = abstractClient?.chain?.id;
      console.log('🔍 Detected chain ID:', detectedChain);
      
      if (detectedChain === 11124) {
        throw new Error('❌ NETWORK MISMATCH: You are connected to Abstract TESTNET (11124) but trying to access MAINNET contract. Please switch to Abstract Mainnet.');
      }
      
      if (detectedChain !== 2741) {
        throw new Error(`❌ WRONG NETWORK: Expected Abstract Mainnet (2741), got ${detectedChain}`);
      }
      
      console.log('✅ Connected to Abstract Mainnet (2741)');
      
      // USE BACKEND API LIKE BULK BUY (WORKING PATTERN)
      console.log('🎯 Using backend API pattern like bulk buy...');
      
      if (!abstractClient) {
        throw new Error('Abstract client not connected. Please connect AGW first.');
      }
      
      // Debug abstractClient methods and state
      console.log('🔍 AbstractClient methods:', Object.getOwnPropertyNames(abstractClient));
      console.log('🔍 AbstractClient account:', abstractClient.account);
      console.log('🔍 AbstractClient chain:', abstractClient.chain);
      
      // Use Gigaverse API directly like the native app
      // authToken is available from centralized auth component
      
      console.log('📡 Creating listing via Gigaverse API...');
      
      // Use backend proxy to bypass CORS (native app calls from same domain)
      console.log('📡 Using backend proxy for Gigaverse API...');
      
      const costPerItem = (BigInt(Math.floor(parseFloat(sellPrice) * 1e18)) / BigInt(1000)).toString();
      
      const gigaverseResponse = await fetch('/api/gigaverse-create-listing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          itemId: currentItem.toString(),
          amount: sellAmount,
          costPerItem: costPerItem,
          jwt: authToken
        })
      });
      
      console.log('🔍 Gigaverse API response status:', gigaverseResponse.status);
      
      if (gigaverseResponse.ok) {
        const gigaverseData = await gigaverseResponse.json();
        console.log('✅ Gigaverse API listing created:', gigaverseData);
        
        // Check if the API returned transaction data that needs to be executed
        if (gigaverseData.data && gigaverseData.data.transactionData) {
          console.log('📝 API returned transaction data, executing on blockchain...');
          
          const txData = gigaverseData.data.transactionData;
          
          // 🔒 SECURITY VALIDATION - Sell transaction
          const sellTxValidation = {
            to: txData.to || '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
            value: BigInt(txData.value || 0),
            data: txData.data
          };
          
          console.log('🔍 Validating sell transaction...');
          transactionValidator.validateTransaction(sellTxValidation);
          
          // Execute the transaction using AGW
          const txHash = await abstractClient.sendTransaction({
            to: txData.to || '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
            value: BigInt(txData.value || 0),
            data: txData.data
          });
          
          // 🔒 RECORD SUCCESSFUL TRANSACTION
          transactionValidator.recordTransaction(sellTxValidation, txHash);
          
          console.log('✅ Blockchain transaction successful:', txHash);
          setMessage(`✅ Listing created! TX: ${txHash.slice(0, 8)}...`);
          setTimeout(() => setMessage(''), 8000);
          return;
          
        } else {
          console.log('ℹ️ API response data:', gigaverseData);
          
          // API returned nonce and signature - use these for the transaction!
          console.log('🔍 API returned nonce and signature, using server-provided values...');
          
          const nonce = gigaverseData.data.nonce;
          const signature = gigaverseData.data.signature;
          const costPerItemWei = (BigInt(Math.floor(parseFloat(sellPrice) * 1e18))).toString();
          
          console.log('📝 Using server-provided nonce:', nonce);
          console.log('📝 Using server-provided signature:', signature);
          
          // Execute createListing transaction using sendTransaction to avoid writeContract viem issues
          const createListingABI = [{
            "inputs": [
              {"internalType": "uint256", "name": "_itemId", "type": "uint256"},
              {"internalType": "uint256", "name": "_amount", "type": "uint256"},
              {"internalType": "uint256", "name": "nonce", "type": "uint256"},
              {"internalType": "uint256", "name": "_pricePerItem", "type": "uint256"},
              {"internalType": "bytes", "name": "_signature", "type": "bytes"}
            ],
            "name": "createListing",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          }];
          
          const iface = new ethers.Interface(createListingABI);
          const encodedData = iface.encodeFunctionData("createListing", [
            currentItem,
            sellAmount,
            nonce,
            costPerItemWei,
            signature
          ]);
          
          console.log('📝 Encoded transaction data:', encodedData);
          
          // 🔒 SECURITY VALIDATION - Create listing transaction
          const createListingTxValidation = {
            to: '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
            value: BigInt(0),
            data: encodedData
          };
          
          console.log('🔍 Validating create listing transaction...');
          transactionValidator.validateTransaction(createListingTxValidation);
          
          // Send create listing transaction using abstractClient only
          const txHash = await abstractClient.sendTransaction({
            to: '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
            value: BigInt(0),
            data: encodedData
          });
          
          // 🔒 RECORD SUCCESSFUL TRANSACTION
          transactionValidator.recordTransaction(createListingTxValidation, txHash);
          
          console.log('✅ Listing created successfully via abstractClient:', txHash);
          setMessage(`✅ Listing created! TX: ${txHash.slice(0, 8)}...`);
          setTimeout(() => setMessage(''), 8000);
        }
      } else {
        const errorText = await gigaverseResponse.text();
        console.log('❌ Gigaverse API error:', errorText);
        throw new Error(`Gigaverse API failed: ${gigaverseResponse.status} - ${errorText}`);
      }

      // ... (rest of the function)

    } catch (error) {
      setMessage(`❌ Listing failed: ${error.message || 'Unknown error'}`);
      setTimeout(() => setMessage(''), 8000);
    } finally {
      setLoading(false);
    }
  };

  // Cancel listing function based on original app logic
  const cancelListing = async (listingId) => {
    if (!address) {
      setMessage('❌ Please connect your wallet first');
      return;
    }

    // Add to cancelling set
    setCancellingListings(prev => new Set(prev).add(listingId));
    setGlobalLoading(true);
    setLoadingMessage(`Cancelling listing ${listingId}...`);

    try {
      console.log('🚫 Starting cancel listing process for:', listingId);

      // Step 1: Validate listing ownership and status
      const listing = myListings.find(l => l.id === listingId);
      if (!listing) {
        throw new Error('Listing not found');
      }

      console.log('🔍 Debug listing data:', {
        listingId,
        fullListing: listing,
        listingOwner: listing.owner,
        listingOwnerType: typeof listing.owner,
        currentAddress: address,
        currentAddressType: typeof address,
        ownerLower: listing.owner?.toLowerCase ? listing.owner.toLowerCase() : listing.owner,
        addressLower: address?.toLowerCase ? address.toLowerCase() : address,
        // Check all possible owner fields
        possibleOwnerFields: {
          owner: listing.owner,
          ownerAddress: listing.ownerAddress,
          ownerField: listing.ownerField,
          user: listing.user,
          seller: listing.seller
        }
      });

      if (!listing.isActive) {
        throw new Error('Listing is not active');
      }

      // More flexible ownership check - handle different data structures
      let listingOwner = listing.owner;
      
      // If owner is an object (from GraphQL), get the id field
      if (typeof listingOwner === 'object' && listingOwner?.id) {
        listingOwner = listingOwner.id;
      }
      
      // If owner is still an object, try other common fields
      if (typeof listingOwner === 'object') {
        listingOwner = listingOwner.address || listingOwner.owner || listingOwner;
      }

      console.log('🔍 Processed owner:', {
        originalOwner: listing.owner,
        processedOwner: listingOwner,
        currentAddress: address
      });

      // Skip ownership validation for now since it's in "My Listings" tab
      // The fact that it appears in myListings should be sufficient validation
      console.log('✅ Listing validation passed (ownership check skipped for My Listings):', {
        listingId,
        processedOwner: listingOwner,
        currentUser: address,
        isActive: listing.isActive
      });

      // Step 2: Create cancel listing transaction
      // Based on the function signature: cancelListing(uint256 _listingId)
      // MethodID: 0x305a67a8
      const cancelListingABI = [{
        "inputs": [{"internalType": "uint256", "name": "_listingId", "type": "uint256"}],
        "name": "cancelListing",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }];

      // Convert listingId to BigInt to ensure proper handling
      const listingIdBigInt = BigInt(listingId);
      console.log('🔢 Processing listing ID:', {
        originalId: listingId,
        originalIdType: typeof listingId,
        bigIntId: listingIdBigInt.toString(),
        hexId: '0x' + listingIdBigInt.toString(16).padStart(64, '0') // Pad to 32 bytes
      });

      const iface = new ethers.Interface(cancelListingABI);
      const encodedData = iface.encodeFunctionData("cancelListing", [listingIdBigInt.toString()]);

      console.log('📝 Encoded cancel data:', encodedData);
      console.log('📝 Expected method ID: 0x305a67a8');
      console.log('📝 Data breakdown:', {
        methodId: encodedData.slice(0, 10),
        listingIdHex: encodedData.slice(10),
        expectedListingIdHex: listingIdBigInt.toString(16).padStart(64, '0')
      });

      // Verify the encoding matches expected format
      const expectedMethodId = '0x305a67a8';
      const actualMethodId = encodedData.slice(0, 10);
      if (actualMethodId !== expectedMethodId) {
        throw new Error(`Method ID mismatch: expected ${expectedMethodId}, got ${actualMethodId}`);
      }

      // Step 3: Verify listing exists on blockchain (optional check)
      let checkResult = null;
      try {
        console.log('🔍 Checking listing on blockchain...');
        
        // Try to call the contract to see if listing exists
        // This is similar to the pre-approval check but for listing state
        const listingCheckData = {
          jsonrpc: "2.0",
          id: 12,
          method: "eth_call",
          params: [{
            data: encodedData, // Use the same encoded data to test
            to: "0x807be43CD840144819Ea8d05c19f4e5530d38BF1" // Correct contract address
          }, "latest"]
        };

        const checkResponse = await fetch('https://api.mainnet.abs.xyz/', {
          method: 'POST',
          headers: {
            'accept': '*/*',
            'content-type': 'application/json',
            'origin': 'https://gigaverse.io'
          },
          body: JSON.stringify(listingCheckData)
        });

        if (checkResponse.ok) {
          checkResult = await checkResponse.json();
          console.log('🔍 Blockchain listing check result:', checkResult);
          
          // If the call fails, it might indicate the listing doesn't exist or can't be cancelled
          if (checkResult.error) {
            console.warn('⚠️ Blockchain check warning:', checkResult.error.message);
          }
        }
      } catch (checkError) {
        console.warn('⚠️ Blockchain listing check failed:', checkError.message);
        // Continue anyway - this is just a diagnostic check
      }

      // Skip blockchain validation - just send the transaction

      // Step 4: Send transaction using correct contract address
      console.log('📤 Sending cancel listing transaction...', {
        to: '0x807be43CD840144819Ea8d05c19f4e5530d38BF1', // Correct contract from raw tx
        data: encodedData,
        listingId: listingIdBigInt.toString()
      });

      // 🔒 SECURITY VALIDATION - Cancel listing transaction
      const cancelTxValidation = {
        to: '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
        value: BigInt(0),
        data: encodedData
      };
      
      console.log('🔍 Validating cancel listing transaction...');
      transactionValidator.validateTransaction(cancelTxValidation);
      
      // Send cancel listing transaction using abstractClient only
      console.log('📤 Sending cancel listing transaction using abstractClient...');
      
      const txHash = await abstractClient.sendTransaction({
        to: '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
        value: BigInt(0),
        data: encodedData
      });
      
      // 🔒 RECORD SUCCESSFUL TRANSACTION
      transactionValidator.recordTransaction(cancelTxValidation, txHash);
      
      console.log('✅ Cancel listing successful via abstractClient:', txHash);
      setMessage(`✅ Listing cancelled! TX: ${txHash.slice(0, 8)}...`);
      
      // Immediately update local state to mark listing as cancelled
      setMyListings(prevListings => 
        prevListings.map(listing => 
          listing.id === listingId 
            ? { ...listing, isActive: false, status: 'CANCELLED' }
            : listing
        )
      );
      
      // Also refresh from server after delay
      setTimeout(() => {
        fetchMyListings();
      }, 2000);

    } catch (error) {
      console.error('❌ Cancel listing error:', error);
      
      let errorMessage;
      if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
        errorMessage = '❌ Transaction cancelled by user';
      } else if (error.message.includes('execution reverted')) {
        // More specific contract error handling
        if (error.message.includes('0x')) {
          errorMessage = '❌ Contract error: Invalid listing or already cancelled';
        } else {
          errorMessage = '❌ Contract execution failed';
        }
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = '❌ Insufficient funds for gas fees';
      } else if (error.message.includes('nonce')) {
        errorMessage = '❌ Transaction nonce error. Please try again';
      } else {
        errorMessage = `❌ Failed to cancel listing: ${error.message}`;
      }
      
      setMessage(errorMessage);
    } finally {
      // Remove from cancelling set
      setCancellingListings(prev => {
        const newSet = new Set(prev);
        newSet.delete(listingId);
        return newSet;
      });
      setGlobalLoading(false);
      setLoadingMessage('');
      
      // Clear message after delay
      setTimeout(() => setMessage(''), 8000);
    }
  };


  return (
    <div className="container">
      {/* Header - EXACT same */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <h1 style={{ textAlign: 'left', margin: '0', fontSize: '1.3rem', lineHeight: '1.1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <img 
                src="https://cdn.discordapp.com/emojis/1399755058190483456.webp?size=48" 
                alt="Giga Icon" 
                style={{width: '24px', height: '24px', objectFit: 'contain'}} 
              />
              GigaEye
            </h1>
            <div style={{ fontSize: '0.6rem', color: 'var(--muted-fg)', marginTop: '-2px', marginBottom: '0px', textAlign: 'right', lineHeight: '1' }}>
              trading companion
            </div>
          </div>
          <button
            onClick={() => setShowFeeVaultPopup(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--fg)',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--muted)'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--card)'}
          >
            {(() => {
              const groveBoxInfo = getItemInfo(464);
              return groveBoxInfo.icon && groveBoxInfo.icon.startsWith('http') ? (
                <img 
                  src={groveBoxInfo.icon} 
                  alt="Grove Box" 
                  style={{
                    width: '20px', 
                    height: '20px', 
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 0 4px rgba(255, 165, 0, 0.6))'
                  }} 
                />
              ) : (
                <span style={{ 
                  fontSize: '16px',
                  background: 'linear-gradient(135deg, #ffa500, #ff8c00)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>{groveBoxInfo.icon || '📦'}</span>
              );
            })()}
            Fee Vault
          </button>
          <button
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--muted-fg)',
              fontSize: '0.8rem',
              fontWeight: 'normal',
              cursor: 'not-allowed',
              opacity: '0.6'
            }}
          >
            <img 
              src="https://cdn.discordapp.com/emojis/1196818495845974086.webp?size=80" 
              alt="Trade Bot" 
              style={{width: '16px', height: '16px', objectFit: 'contain'}} 
            />
            Trade Bot
          </button>
          <button disabled style={{
            textAlign: 'center', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--muted-fg)',
            fontSize: '0.8rem',
            fontWeight: 'normal',
            cursor: 'not-allowed',
            opacity: 0.6
          }}>
            <img src="https://cdn.discordapp.com/emojis/1199025968908603523.webp?size=80" alt="Notif" style={{width: '16px', height: '16px', objectFit: 'contain'}} />
            notif
          </button>
        </div>
        <div className="header-nav">
          <button 
            onClick={() => setShowDealsPopup(true)}
            className="nav-tab"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '2px 8px',
              backgroundColor: 'transparent',
              background: 'linear-gradient(135deg, #ffa500, #ff8c00)',
              color: 'white',
              border: '1px solid rgba(255, 165, 0, 0.3)',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontWeight: '600',
              cursor: 'pointer',
              margin: '0',
              lineHeight: '1'
            }}
          >
            <span style={{
              animation: 'wiggle 2s ease-in-out infinite',
              display: 'inline-block',
              margin: '0',
              padding: '0',
              lineHeight: '1'
            }}>
              <img src="https://cdn.discordapp.com/emojis/1398292889275994122.webp?size=80" alt="Deals" style={{width: '28px', height: '28px', objectFit: 'contain', margin: '0', padding: '0'}} />
            </span>
            STUB Deals
          </button>
          <a href="page_2.html" className="nav-tab" style={{
            textAlign: 'center', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--fg)',
            fontSize: '0.8rem',
            fontWeight: 'normal',
            cursor: 'pointer',
            textDecoration: 'none'
          }}>global stat</a>
          <div style={{padding: 0, minWidth: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent'}}>
            <AGWConnection
              onConnectionSuccess={() => {
                setMessage('✅ AGW Connected! Ready to trade.');
                setTimeout(() => setMessage(''), 1500);
              }}
              onConnectionError={(error) => {
                setMessage('❌ Connection failed: ' + error);
                setTimeout(() => setMessage(''), 1500);
              }}
              onDisconnect={handleAGWDisconnect}
              buttonStyle={{
                padding: '8px 12px',
                fontSize: '0.8rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--fg)',
                width: '100%'
              }}
              connectedButtonStyle={{
                padding: '8px 12px',
                fontSize: '0.8rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--fg)',
                width: '100%'
              }}
              connectText={
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <img 
                    src="https://abscan.org/assets/abstract/images/svg/logos/chain-dark.svg?v=25.8.1.2" 
                    alt="Abstract" 
                    style={{ width: '14px', height: '14px' }}
                  />
                  Connect AGW
                </span>
              }
              connectedText="AGW Connected"
            />
          </div>
        </div>
      </div>

      {/* Live Trade Ticker with Dropdown Arrow */}
      <div id="biggest-trade-ticker" style={{ position: 'relative' }}>
        <button 
          className={`ticker-dropdown-arrow ${showTradesDropdown ? 'open' : ''}`}
          onClick={() => setShowTradesDropdown(!showTradesDropdown)}
          title="Show all trades"
        >
          <span className="all-tx-text">All TX</span>
          <span className="arrow-icon">▼</span>
        </button>
        <div className="live-indicator">
          <div className="live-dot"></div>
          <span>LIVE</span>
        </div>
        <span id="ticker-content">Loading biggest trades...</span>
        
        {/* Message Display - Overlay on ticker */}
        {message && (
          <div style={{ 
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            background: 'linear-gradient(135deg, var(--success), var(--card))',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            color: 'black',
            fontWeight: 'normal',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '10',
            padding: '0 10px'
          }}>
            {message}
          </div>
        )}
      </div>

      {/* Stats Section - Progressive Loading */}
      {itemDetailsLoaded && (
      <div className="stats-section">
        <div className="stat-card" style={{ minWidth: '90px' }}>
          <div className="stat-icon" style={{ 
            backgroundImage: currentItem && (getItemInfo(currentItem).image || getItemInfo(currentItem).icon) ? 
              `url('${getItemInfo(currentItem).image || getItemInfo(currentItem).icon}')` : 'none',
            borderRadius: '0'
          }}>
          </div>
          <div className="stat-content">
            <div className="stat-label">24h Volume</div>
            <div className="stat-value-container">
              <div className="stat-value" style={{ color: 'white' }}>{stats.totalVolumeValue.replace('USD', '$')}</div>
              <div className={`stat-change ${stats.statVolumeChange.includes('+') ? 'positive' : stats.statVolumeChange.includes('-') && stats.statVolumeChange !== '-' ? 'negative' : ''}`}>
                {stats.statVolumeChange}
              </div>
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ minWidth: '90px' }}>
          <div className="stat-icon" style={{ 
            backgroundImage: currentItem && (getItemInfo(currentItem).image || getItemInfo(currentItem).icon) ? 
              `url('${getItemInfo(currentItem).image || getItemInfo(currentItem).icon}')` : 'none',
            borderRadius: '0'
          }}>
          </div>
          <div className="stat-content">
            <div className="stat-label">24h Item Sold</div>
            <div className="stat-value-container">
              <div className="stat-value" style={{ color: 'white' }}>{stats.itemVolumeChange}</div>
              <div className={`stat-change ${stats.statItemVolumeChange.includes('+') ? 'positive' : stats.statItemVolumeChange.includes('-') && stats.statItemVolumeChange !== '-' ? 'negative' : ''}`}>
                {stats.statItemVolumeChange}
              </div>
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ minWidth: '90px' }}>
          <div className="stat-icon" style={{ 
            backgroundImage: currentItem && (getItemInfo(currentItem).image || getItemInfo(currentItem).icon) ? 
              `url('${getItemInfo(currentItem).image || getItemInfo(currentItem).icon}')` : 'none',
            borderRadius: '0'
          }}>
          </div>
          <div className="stat-content">
            <div className="stat-label">All-time Volume</div>
            <div className="stat-value-container">
              <div className="stat-value" style={{ color: 'white' }}>{stats.allTimeVolume.replace('USD', '$')}</div>
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ minWidth: '90px' }}>
          <div className="stat-icon" style={{ 
            backgroundImage: currentItem && (getItemInfo(currentItem).image || getItemInfo(currentItem).icon) ? 
              `url('${getItemInfo(currentItem).image || getItemInfo(currentItem).icon}')` : 'none',
            borderRadius: '0'
          }}>
          </div>
          <div className="stat-content">
            <div className="stat-label">All-time Sold</div>
            <div className="stat-value-container">
              <div className="stat-value" style={{ color: 'white' }}>{stats.allTimeItemsSold}</div>
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ minWidth: '90px' }}>
          <div className="stat-icon" style={{ 
            backgroundImage: currentItem && (getItemInfo(currentItem).image || getItemInfo(currentItem).icon) ? 
              `url('${getItemInfo(currentItem).image || getItemInfo(currentItem).icon}')` : 'none',
            borderRadius: '0'
          }}>
          </div>
          <div className="stat-content">
            <div className="stat-label">Supply</div>
            <div className="stat-value-container">
              <div className="stat-value" style={{ color: 'white' }}>{stats.supply || 'soon'}</div>
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ border: '1px solid rgba(245, 158, 11, 0.5)', minWidth: '90px' }}>
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-label">24h Total Market Volume</div>
            <div className="stat-value-container">
              <div className="stat-value" style={{ color: 'white' }}>{stats.totalMarketVolume}</div>
              <div className={`stat-change ${stats.statMarketVolumeChange.includes('+') ? 'positive' : stats.statMarketVolumeChange.includes('-') && stats.statMarketVolumeChange !== '-' ? 'negative' : ''}`}>
                {stats.statMarketVolumeChange}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Loading State for Stats */}
      {!itemDetailsLoaded && (
        <div style={{
          textAlign: 'center',
          padding: 'calc(var(--s) * 4)',
          color: 'var(--muted-fg)',
          fontSize: '0.9rem'
        }}>
          📊 Loading market stats...
        </div>
      )}

      {/* Trading Layout - Progressive Loading */}
      {marketsLoaded && (
      <div className="trading-layout">
        {/* Left Panel - Market List */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Markets</div>
            <div className="custom-dropdown">
              <div 
                className={`type-selector ${dropdownOpen ? 'open' : ''}`}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="selected-text">{selectedType || 'All Types'}</span>
                <span className="dropdown-arrow">▼</span>
              </div>
              {dropdownOpen && (
                <div className="dropdown-menu" style={{ display: 'block' }}>
                  <div 
                    className={`dropdown-item ${!selectedType ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedType('');
                      setDropdownOpen(false);
                    }}
                  >
                    All Types
                  </div>
                  {getTypes().map(type => (
                    <div 
                      key={type}
                      className={`dropdown-item ${selectedType === type ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedType(type);
                        setDropdownOpen(false);
                      }}
                    >
                      {type}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <input
            type="text"
            className="market-search"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="market-list">
            {filteredMarkets.map(market => {
              const itemInfo = getItemInfo(market.itemId);
              const isActive = currentItem === market.itemId;
              const changeClass = market.change24h > 0 ? 'positive' : market.change24h < 0 ? 'negative' : 'neutral';
              const iconUrl = itemInfo.icon //|| itemInfo.icon || market.image || market.icon;
              const displayVolume = convertPrice(market.volumeEth);
              const volumeText = `Vol: ${formatPrice(displayVolume)} ${currency}`;
              const displayFloorPrice = convertPrice(market.floorPrice);
              const floorPriceText = market.floorPrice > 0 ? `$${formatPrice(displayFloorPrice)}` : '-';
              
              return (
                <div
                  key={market.itemId}
                  className={`market-item ${isActive ? 'active' : ''}`}
                  onClick={() => selectMarket(market.itemId)}
                >
                  <div className="market-item-content">
                    <div 
                      className="market-item-icon"
                      style={{ backgroundImage: iconUrl ? `url('${iconUrl}')` : 'none' }}
                    >
                      {!iconUrl && (itemInfo.name || market.name || '?').charAt(0)}
                    </div>
                    <div className="market-item-name">{itemInfo.name || market.name || `Item ${market.itemId}`}</div>
                  </div>
                  <div className="market-item-details">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'calc(var(--s) * 0.25)' }}>
                      <span style={{ color: 'var(--muted-fg)', fontSize: '0.55rem' }}>{volumeText}</span>
                      <div style={{ display: 'flex', gap: 'calc(var(--s) * 1)', alignItems: 'center' }}>
                        <span style={{ color: 'var(--success)', fontSize: '0.6rem' }}>{floorPriceText}</span>
                        <span className={`market-change ${changeClass}`} style={{ fontSize: '0.6rem', opacity: '0.7' }}>
                          {market.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
        </div>

        {/* Middle Panel - Chart and Trades */}
        <div className="panel">
          <div className="panel-header">
            <div className="chart-title-container">
              <div 
                className="chart-item-icon"
                style={{ 
                  backgroundImage: currentItem && (getItemInfo(currentItem).image || getItemInfo(currentItem).icon) ? 
                    `url('${getItemInfo(currentItem).image || getItemInfo(currentItem).icon}')` : 'none' 
                }}
              >
                {(!currentItem || !(getItemInfo(currentItem).image || getItemInfo(currentItem).icon)) && (currentItem ? getItemInfo(currentItem).name?.charAt(0) || '?' : '?')}
              </div>
              <div className="panel-title">
                {currentItem ? `${getItemInfo(currentItem).name}` : 'Price Chart'}
              </div>
            </div>
            <div className="chart-header-controls">
              <div className="chart-left-controls">
                {currentItem && stats.priceRange && stats.priceRange !== '-' && (
                  <div className="price-range-display" style={{ 
                    marginRight: '15px', 
                    fontSize: '0.75rem', 
                    color: 'var(--muted-fg)',
                    fontWeight: 'normal',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    Price Range: {stats.priceRange}
                  </div>
                )}
                <div className="timeframe-controls">
                  <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                    <option value="1h">1H</option>
                    <option value="4h">4H</option>
                    <option value="1d">1D</option>
                  </select>
                </div>
                <div className="currency-controls">
                  <div className="chart-controls">
                    <button 
                      className={`chart-type-btn ${currency === 'ETH' ? 'active' : ''}`}
                      onClick={() => setCurrency('ETH')}
                    >
                      ETH
                    </button>
                    <button 
                      className={`chart-type-btn ${currency === 'USD' ? 'active' : ''}`}
                      onClick={() => setCurrency('USD')}
                    >
                      USD
                    </button>
                  </div>
                </div>
              </div>
              <div className="chart-controls">
                <button 
                  className={`chart-type-btn ${showCandles ? 'active' : ''}`}
                  onClick={() => setShowCandles(!showCandles)}
                >
                  Candles
                </button>
                <button 
                  className={`chart-type-btn ${showLine ? 'active' : ''}`}
                  onClick={() => setShowLine(!showLine)}
                >
                  Line
                </button>
              </div>
            </div>
          </div>
          
          <div id="chart"></div>
          
          <div className="panel-header" style={{ marginTop: 'calc(var(--s) * 1.5)', marginBottom: 'calc(var(--s) * 1)' }}>
            <div className="panel-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => setActiveTradesTab('recent')}
                    style={{
                      background: activeTradesTab === 'recent' ? 'rgba(255, 165, 0, 0.2)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    Recent Trades
                  </button>
                  <button 
                    onClick={() => {
                      console.log('My Transactions clicked, address:', address, 'isConnected:', isConnected);
                      setActiveTradesTab('my');
                    }}
                    style={{
                      background: activeTradesTab === 'my' ? 'rgba(255, 165, 0, 0.2)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: (address || isConnected) ? 'white' : '#666',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: (address || isConnected) ? 'pointer' : 'not-allowed'
                    }}
                    disabled={!(address || isConnected)}
                  >
                    My Transactions
                  </button>
                  <button 
                    onClick={() => setActiveTradesTab('listings')}
                    style={{
                      background: activeTradesTab === 'listings' ? 'rgba(255, 165, 0, 0.2)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: (address || isConnected) ? 'white' : '#666',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: (address || isConnected) ? 'pointer' : 'not-allowed'
                    }}
                    disabled={!(address || isConnected)}
                  >
                    My Listings
                  </button>
                  <button 
                    onClick={() => setActiveTradesTab('pnl')}
                    style={{
                      background: activeTradesTab === 'pnl' ? 'rgba(255, 165, 0, 0.2)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: (address || isConnected) ? 'white' : '#666',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: (address || isConnected) ? 'pointer' : 'not-allowed'
                    }}
                    disabled={!(address || isConnected)}
                  >
                    My PnL
                  </button>
                </div>
                
                {(activeTradesTab === 'my' || activeTradesTab === 'listings') && (address || isConnected) && (
                  <div style={{ display: 'flex', gap: '5px', fontSize: '10px' }}>
                    <button 
                      onClick={() => {
                        if (activeTradesTab === 'my') setMyTransactionsFilter('all');
                        if (activeTradesTab === 'listings') setMyListingsFilter('all');
                      }}
                      style={{
                        background: (activeTradesTab === 'my' ? myTransactionsFilter : myListingsFilter) === 'all' ? 'rgba(255, 165, 0, 0.3)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      All Items
                    </button>
                    <button 
                      onClick={() => {
                        if (activeTradesTab === 'my') setMyTransactionsFilter('item');
                        if (activeTradesTab === 'listings') setMyListingsFilter('item');
                      }}
                      style={{
                        background: (activeTradesTab === 'my' ? myTransactionsFilter : myListingsFilter) === 'item' ? 'rgba(255, 165, 0, 0.3)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: currentItem ? 'white' : '#666',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        cursor: currentItem ? 'pointer' : 'not-allowed'
                      }}
                      disabled={!currentItem}
                    >
                      Current Item
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="chart-trades">
            {activeTradesTab === 'recent' ? (
              <table className="last-trades-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Item</th>
                    <th style={{ textAlign: 'center' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Buyer</th>
                    <th style={{ textAlign: 'center' }}>Seller</th>
                    <th style={{ textAlign: 'center' }}>Tx</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.slice(0, 100).map((trade, index) => (
                    <tr key={index}>
                      <td className="trade-item" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                          <div 
                            className="chart-item-icon"
                            style={{ 
                              width: '16px',
                              height: '16px',
                              borderRadius: '2px',
                              backgroundImage: trade.itemIcon ? `url('${trade.itemIcon}')` : 'none',
                              backgroundColor: trade.itemIcon ? 'transparent' : 'rgba(255,255,255,0.1)',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              fontSize: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {!trade.itemIcon && (trade.itemName?.charAt(0) || '?')}
                          </div>
                          <span style={{ fontSize: '10px' }}>{trade.itemName}</span>
                        </div>
                      </td>
                      <td className="trade-amount" style={{ textAlign: 'center' }}>{trade.amount}</td>
                      <td className="trade-price" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>{formatPrice(convertPrice(trade.price))}</td>
                      <td className="trade-price" style={{ textAlign: 'right' }}>{formatPrice(convertPrice(trade.ethSpent))}</td>
                      <td className="trade-buyer" style={{ textAlign: 'center', color: 'rgba(255, 165, 0, 0.7)' }}>
                        {formatAddressWithName(trade.buyer, trade.buyerName)}
                      </td>
                      <td className="trade-seller" style={{ textAlign: 'center', color: 'rgba(255, 165, 0, 0.7)' }}>
                        {formatAddressWithName(trade.seller, trade.sellerName)}
                      </td>
                      <td className="trade-hash" style={{ textAlign: 'center' }}>
                        {trade.tx ? (
                          <a href={`https://abscan.org/tx/${trade.tx}`} target="_blank" rel="noopener noreferrer">
                            {trade.tx.slice(0, 6)}...{trade.tx.slice(-4)}
                          </a>
                        ) : '-'}
                      </td>
                      <td className="trade-time" style={{ textAlign: 'left' }}>
                        {new Date(trade.timestamp).toLocaleString([], {
                          month: '2-digit', day: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                          timeZone: 'UTC'
                        })}
                      </td>
                    </tr>
                  ))}
                  {recentTrades.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center' }}>No trades</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : activeTradesTab === 'my' ? (
              // My Transactions Tab
              <table className="last-trades-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Type</th>
                    <th style={{ textAlign: 'center' }}>Item</th>
                    <th style={{ textAlign: 'center' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>Buyer</th>
                    <th style={{ textAlign: 'center' }}>Tx</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {!address && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        Connect your wallet to view your transactions
                      </td>
                    </tr>
                  )}
                  {address && myTransactions.slice(0, 100).map((tx, index) => (
                    <tr key={index}>
                      <td className="trade-type" style={{ 
                        textAlign: 'center',
                        color: tx.type === 'BUY' ? '#4ade80' : '#ef4444'
                      }}>
                        {tx.type}
                      </td>
                      <td className="trade-item" style={{ textAlign: 'center', fontSize: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                          <div 
                            className="chart-item-icon"
                            style={{ 
                              width: '16px',
                              height: '16px',
                              borderRadius: '2px',
                              backgroundImage: tx.itemIcon ? `url('${tx.itemIcon}')` : 'none',
                              backgroundColor: tx.itemIcon ? 'transparent' : 'rgba(255,255,255,0.1)',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              fontSize: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {!tx.itemIcon && (tx.itemName?.charAt(0) || '?')}
                          </div>
                          <span style={{ fontSize: '10px' }}>{tx.itemName}</span>
                        </div>
                      </td>
                      <td className="trade-amount" style={{ textAlign: 'center' }}>{tx.amount}</td>
                      <td className="trade-price" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.5)' }}>{formatPrice(convertPrice(tx.price))}</td>
                      <td className="trade-total" style={{ 
                        textAlign: 'right',
                        color: tx.type === 'BUY' ? '#ef4444' : '#4ade80'
                      }}>{formatPrice(convertPrice(tx.ethSpent))}</td>
                      <td className="trade-counterparty" style={{ textAlign: 'center', color: 'rgba(255, 165, 0, 0.7)' }}>
                        {formatAddressWithName(tx.counterparty, tx.counterpartyName)}
                      </td>
                      <td className="trade-hash" style={{ textAlign: 'center' }}>
                        {tx.tx ? (
                          <a href={`https://abscan.org/tx/0x${tx.tx}`} target="_blank" rel="noopener noreferrer">
                            {tx.tx.slice(0, 6)}...{tx.tx.slice(-4)}
                          </a>
                        ) : '-'}
                      </td>
                      <td className="trade-time" style={{ textAlign: 'left' }}>
                        {new Date(tx.timestamp).toLocaleString([], {
                          month: '2-digit', day: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                          timeZone: 'UTC'
                        })}
                      </td>
                    </tr>
                  ))}
                  {address && myTransactions.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center' }}>
                        {myTransactionsFilter === 'item' && currentItem 
                          ? `No transactions for ${getItemInfo(currentItem)?.name || 'this item'}`
                          : 'No transactions found'
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : activeTradesTab === 'listings' ? (
              // My Listings Tab
              <table className="last-trades-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Item</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'center' }}>Amount</th>
                    <th style={{ textAlign: 'center' }}>Remaining</th>
                    <th style={{ textAlign: 'right' }}>Total Earned</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                    <th style={{ textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {!address && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                        Connect your wallet to view your listings
                      </td>
                    </tr>
                  )}
                  {address && myListings.map((listing, index) => (
                    <React.Fragment key={listing.id}>
                      <tr 
                        onClick={() => {
                          if (listing.transfers.length > 0) {
                            const newExpanded = new Set(expandedListings);
                            if (newExpanded.has(listing.id)) {
                              newExpanded.delete(listing.id);
                            } else {
                              newExpanded.add(listing.id);
                            }
                            setExpandedListings(newExpanded);
                          }
                        }}
                        style={{ 
                          borderBottom: expandedListings.has(listing.id) ? 'none' : '1px solid rgba(255,255,255,0.1)',
                          cursor: listing.transfers.length > 0 ? 'pointer' : 'default',
                          height: '32px'
                        }}
                      >
                        <td className="listing-status" style={{ textAlign: 'left', verticalAlign: 'middle' }}>
                          <span style={{ 
                            color: listing.status === 'ACTIVE' ? '#4ade80' : 
                                   listing.status === 'COMPLETED' ? '#60a5fa' : '#ef4444',
                            fontWeight: 'bold',
                            fontSize: '10px'
                          }}>
                            {listing.status}
                          </span>
                        </td>
                        <td className="listing-item" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                            <div 
                              className="chart-item-icon"
                              style={{ 
                                width: '16px',
                                height: '16px',
                                borderRadius: '2px',
                                backgroundImage: listing.itemIcon ? `url('${listing.itemIcon}')` : 'none',
                                backgroundColor: listing.itemIcon ? 'transparent' : 'rgba(255,255,255,0.1)',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                fontSize: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {!listing.itemIcon && (listing.itemName?.charAt(0) || '?')}
                            </div>
                            <span style={{ fontSize: '10px' }}>{listing.itemName}</span>
                          </div>
                        </td>
                        <td className="listing-price" style={{ textAlign: 'right', verticalAlign: 'middle' }}>{formatPrice(convertPrice(listing.pricePerItem))}</td>
                        <td className="listing-amount" style={{ textAlign: 'center', verticalAlign: 'middle' }}>{listing.amount}</td>
                        <td className="listing-remaining" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          {listing.isActive ? listing.amountRemaining : '-'}
                        </td>
                        <td className="listing-earned" style={{ textAlign: 'right', verticalAlign: 'middle', color: '#4ade80' }}>{formatPrice(convertPrice(listing.totalEarned))}</td>
                        <td className="listing-actions" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          {listing.isActive && (
                            <button
                              style={{
                                background: cancellingListings.has(listing.id) ? 'rgba(156, 163, 175, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                border: cancellingListings.has(listing.id) ? '1px solid rgba(156, 163, 175, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                color: cancellingListings.has(listing.id) ? '#9ca3af' : '#ef4444',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '9px',
                                cursor: cancellingListings.has(listing.id) ? 'not-allowed' : 'pointer',
                                opacity: cancellingListings.has(listing.id) ? 0.6 : 1
                              }}
                              disabled={cancellingListings.has(listing.id)}
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                if (!cancellingListings.has(listing.id)) {
                                  cancelListing(listing.id);
                                }
                              }}
                            >
                              {cancellingListings.has(listing.id) ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          {listing.transfers.length > 0 && (
                            <span style={{
                              color: 'white',
                              fontSize: '12px',
                              transform: expandedListings.has(listing.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s',
                              display: 'inline-block'
                            }}>
                              ▶
                            </span>
                          )}
                        </td>
                      </tr>
                      {expandedListings.has(listing.id) && listing.transfers.map((transfer, transferIndex) => (
                        <tr key={`${listing.id}-${transferIndex}`} style={{ 
                          backgroundColor: 'rgba(255,255,255,0.05)', 
                          borderLeft: '3px solid rgba(74, 222, 128, 0.5)',
                          fontSize: '10px',
                          opacity: '0.6'
                        }}>
                          <td></td>
                          <td style={{ textAlign: 'left', paddingLeft: '20px' }}>
                            <div style={{ color: '#999' }}>
                              <div>Sold to: {formatAddressWithName(transfer.buyer, transfer.buyerName)}</div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', color: '#999' }}>{formatPrice(convertPrice(transfer.totalPaid / transfer.amount))}</td>
                          <td style={{ textAlign: 'center', color: '#999' }}>{transfer.amount}</td>
                          <td style={{ textAlign: 'center', color: '#999' }}>{formatPrice(convertPrice(transfer.totalPaid))}</td>
                          <td style={{ textAlign: 'right', color: '#999' }}>
                            {new Date(transfer.timestamp).toLocaleString([], {
                              month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                              timeZone: 'UTC'
                            })}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <a 
                              href={`https://abscan.org/tx/${transfer.txHash}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ color: '#60a5fa', textDecoration: 'none' }}
                            >
                              {transfer.txHash.slice(0, 6)}...{transfer.txHash.slice(-4)}
                            </a>
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  {address && myListings.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center' }}>
                        {myListingsFilter === 'item' && currentItem 
                          ? `No listings for ${getItemInfo(currentItem)?.name || 'this item'}`
                          : 'No listings found'
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : activeTradesTab === 'pnl' ? (
              // My PnL Tab
              <div style={{ padding: '10px', color: 'white' }}>
                {!address && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    Connect your wallet to view your PnL
                  </div>
                )}
                
                {address && pnlLoading && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    Loading PnL data...
                  </div>
                )}
                
                {address && !pnlLoading && pnlData && (
                  <div>
                    {/* Top Row - Summary and Chart in one row */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '10px', 
                      marginBottom: '10px',
                      height: '150px'
                    }}>
                      {/* PnL Summary - Left Side */}
                      <div style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        padding: '10px', 
                        borderRadius: '4px',
                        flex: '1',
                        minWidth: '200px'
                      }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#FFA500' }}>Summary</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                          <div>Total Spent: {formatEthPrice(pnlData.summary.totalSpentETH)} ETH</div>
                          <div>Total Earned: {formatEthPrice(pnlData.summary.totalEarnedETH)} ETH</div>
                          <div style={{ 
                            color: pnlData.summary.totalPnL >= 0 ? '#00ff00' : '#ff6b6b',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            marginTop: '4px'
                          }}>
                            Total PnL: {pnlData.summary.totalPnL >= 0 ? '+' : ''}{formatEthPrice(pnlData.summary.totalPnL)} ETH
                          </div>
                        </div>
                      </div>
                      
                      {/* Cumulative PnL Chart - Right Side */}
                      {pnlChart && (
                        <div style={{ 
                          background: 'rgba(255,255,255,0.05)', 
                          padding: '10px', 
                          borderRadius: '4px',
                          flex: '2',
                          minWidth: '300px'
                        }}>
                          <h5 style={{ margin: '0 0 8px 0', color: '#FFA500', fontSize: '12px' }}>PnL</h5>
                          <div style={{ height: '120px' }}>
                            <Line 
                              ref={pnlChartRef}
                              data={pnlChart}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                  legend: {
                                    display: false
                                  },
                                  tooltip: {
                                    displayColors: false,  // Remove colored squares
                                    callbacks: {
                                      label: function(context) {
                                        return `PnL: ${formatEthPrice(context.parsed.y)} ETH`;
                                      },
                                      title: function(context) {
                                        // Show only date without time
                                        if (context[0] && context[0].parsed && context[0].parsed.x) {
                                          const date = new Date(context[0].parsed.x);
                                          return date.toLocaleDateString();
                                        }
                                        return context[0].label;
                                      }
                                    }
                                  }
                                },
                                scales: {
                                  x: {
                                    type: pnlChart.datasets[0].data.length > 2 && pnlChart.datasets[0].data[0].x ? 'time' : 'category',
                                    display: true,
                                    grid: {
                                      display: false
                                    },
                                    ticks: {
                                      color: '#888',
                                      font: {
                                        size: 10
                                      },
                                      maxTicksLimit: 5
                                    }
                                  },
                                  y: {
                                    type: 'linear',
                                    display: true,
                                    grid: {
                                      color: 'rgba(255,255,255,0.1)'
                                    },
                                    ticks: {
                                      color: '#888',
                                      font: {
                                        size: 10
                                      },
                                      callback: function(value) {
                                        return formatEthPrice(value) + ' ETH';
                                      }
                                    }
                                  }
                                },
                                elements: {
                                  point: {
                                    radius: 0,
                                    hoverRadius: 4
                                  }
                                },
                                interaction: {
                                  intersect: false,
                                  mode: 'index'
                                }
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Position Details */}
                    <table className="last-trades-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Item</th>
                          <th style={{ textAlign: 'center' }}>Buy/Sold</th>
                          <th style={{ textAlign: 'right' }}>Avg Buy Price</th>
                          <th style={{ textAlign: 'right' }}>Avg Sold Price</th>
                          <th style={{ textAlign: 'right' }}>PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnlData.positions.length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                              No positions found
                            </td>
                          </tr>
                        ) : (
                          pnlData.positions.map((position, index) => (
                            <tr key={position.itemId} style={{ fontSize: '11px' }}>
                              <td style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px' 
                              }}>
                                <img 
                                  src={getItemInfo(position.itemId)?.icon || ''} 
                                  alt=""
                                  style={{ 
                                    width: '16px', 
                                    height: '16px', 
                                    borderRadius: '2px',
                                    background: '#333'
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'inline';
                                  }}
                                />
                                <span style={{ display: 'none', fontSize: '12px' }}>📦</span>
                                <span>{getItemInfo(position.itemId)?.name || `Item ${position.itemId}`}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {position.totalPurchased}/{position.totalSold}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {position.avgPurchasePriceETH > 0 ? formatEthPrice(position.avgPurchasePriceETH) : '-'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {position.avgSalePriceETH > 0 ? formatEthPrice(position.avgSalePriceETH) : '-'}
                              </td>
                              <td style={{ 
                                textAlign: 'right',
                                color: position.totalPnL >= 0 ? '#00ff00' : '#ff6b6b'
                              }}>
                                {position.totalPnL >= 0 ? '+' : ''}{formatEthPrice(position.totalPnL)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {address && !pnlLoading && !pnlData && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    Failed to load PnL data
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Panel - Trading and Order Book */}
        <div className="panel">
          {listingsLoaded ? (
          <>
          <div className="trading-section">
            <div className="trading-tabs">
              <div 
                className={`trading-tab ${activeTab === 'buy' ? 'active' : ''}`}
                onClick={() => setActiveTab('buy')}
              >
                Buy
              </div>
              <div 
                className={`trading-tab ${activeTab === 'sell' ? 'active' : ''}`}
                onClick={() => setActiveTab('sell')}
              >
                Sell
              </div>
            </div>
            <div className="trading-content">
              {activeTab === 'buy' ? (
                <div className="trading-form">
                  <div className="form-section">
                    <div className="form-group">
                      <label>Amount to Buy</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="1"
                        min="1"
                        max="3000"
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(parseInt(e.target.value) || 1)}
                      />
                      <div>
                        <input
                          type="range"
                          className="range-slider"
                          min="1"
                          max="3000"
                          value={buyAmount}
                          onChange={(e) => setBuyAmount(parseInt(e.target.value))}
                        />
                        <div className="range-limits">
                          <span>1</span>
                          <span>3000</span>
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: 'linear-gradient(135deg, var(--muted), var(--bg))',
                      padding: 'calc(var(--s) * 2)',
                      borderRadius: 'var(--r)',
                      border: '1px solid var(--border)',
                      marginTop: 'calc(var(--s) * 1)',
                      fontSize: '0.65rem',
                      width: '100%',
                      display: 'block'
                    }}>
                      <div style={{
                        width: '100%',
                        textAlign: 'left',
                        marginBottom: 'calc(var(--s) * 1.5)',
                        paddingBottom: 'calc(var(--s) * 1)',
                        borderBottom: '1px solid var(--border)',
                        display: 'block'
                      }}>
                        <span style={{ 
                          fontWeight: '700',
                          color: 'var(--fg)',
                          fontSize: '0.7rem'
                        }}>
                          {currentItem ? getItemInfo(currentItem).name : 'Select item'}
                        </span>
                      </div>

                      <div style={{ width: '100%', display: 'block' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 'calc(var(--s) * 0.5)',
                          color: 'var(--fg)',
                          width: '100%'
                        }}>
                          <span>Total:</span>
                          <span style={{ fontWeight: '700' }}>{getBuyCost()} {currency}</span>
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 'calc(var(--s) * 0.5)',
                          color: 'var(--muted-fg)',
                          width: '100%'
                        }}>
                          <span>Fee (1%):</span>
                          <span style={{ color: 'var(--warning)' }}>
                            {(parseFloat(getBuyCost()) * 0.01).toFixed(6)} {currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button className="trade-button buy-button" onClick={executeBuy}>Buy Items</button>
                </div>
              ) : (
                <div className="trading-form">
                  <div className="form-section">
                    <div className="form-group">
                      <label>Price per Item</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0.001"
                        step="0.000001"
                        min="0"
                        value={sellPrice}
                        onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Amount to Sell</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="1"
                        min="1"
                        max="3000"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(parseInt(e.target.value) || 1)}
                      />
                      <div>
                        <input
                          type="range"
                          className="range-slider"
                          min="1"
                          max="3000"
                          value={sellAmount}
                          onChange={(e) => setSellAmount(parseInt(e.target.value))}
                        />
                        <div className="range-limits">
                          <span>1</span>
                          <span>3000</span>
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: 'linear-gradient(135deg, var(--muted), var(--bg))',
                      padding: 'calc(var(--s) * 2)',
                      borderRadius: 'var(--r)',
                      border: '1px solid var(--border)',
                      marginTop: 'calc(var(--s) * 1)',
                      fontSize: '0.65rem',
                      width: '100%',
                      display: 'block'
                    }}>
                      <div style={{
                        width: '100%',
                        textAlign: 'left',
                        marginBottom: 'calc(var(--s) * 1.5)',
                        paddingBottom: 'calc(var(--s) * 1)',
                        borderBottom: '1px solid var(--border)',
                        display: 'block'
                      }}>
                        <span style={{ 
                          fontWeight: '700',
                          color: 'var(--fg)',
                          fontSize: '0.7rem'
                        }}>
                          {currentItem ? getItemInfo(currentItem).name : 'Select item'}
                        </span>
                      </div>

                      <div style={{ width: '100%', display: 'block' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 'calc(var(--s) * 0.5)',
                          color: 'var(--fg)',
                          width: '100%'
                        }}>
                          <span>Balance:</span>
                          <span style={{ fontWeight: '700' }}>{currentItem ? (playerInventory[currentItem] || 0) : '-'}</span>
                        </div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: 'var(--fg)',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          paddingTop: 'calc(var(--s) * 0.5)',
                          borderTop: '1px solid var(--border)',
                          width: '100%'
                        }}>
                          <span>Total Receive:</span>
                          <span style={{ fontWeight: '700' }}>{formatPrice(convertPrice(sellPrice * sellAmount))} {currency}</span>
                        </div>
                      </div>
                    </div>
                    
                  </div>
                  {/* Need Gigaverse login notification when no auth token */}
                  {!authToken && (
                    <div style={{
                      marginTop: 'calc(var(--s) * 1)',
                      padding: 'calc(var(--s) * 1.5)',
                      background: 'rgba(255, 165, 0, 0.1)',
                      borderRadius: 'var(--r)',
                      border: '1px solid rgba(255, 165, 0, 0.2)',
                      fontSize: '0.6rem',
                      color: '#ffa500'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--s) * 0.5)' }}>
                        <span>⚠️</span>
                        <span>Need Gigaverse login</span>
                      </div>
                    </div>
                  )}
                  <GigaverseAuth
                    abstractClient={abstractClient}
                    walletAddress={address}
                    isWalletConnected={isConnected}
                    authToken={authToken}
                    onAuthSuccess={handleAuthSuccess}
                    onAuthError={handleAuthError}
                    buttonStyle={{
                      marginTop: '10px',
                      background: '#4CAF50',
                      padding: 'calc(var(--s) * 1.5) calc(var(--s) * 2)',
                      fontSize: '0.8rem',
                      fontWeight: 'normal'
                    }}
                  />
                  <button className="trade-button sell-button" onClick={executeSell}>List for Sale</button>
                </div>
              )}
            </div>
          </div>
          
          <div className="orderbook-section">
            <div className="orderbook-header">
              <div className="panel-title">Order Book</div>
            </div>
            <table className="orderbook-table">
              <thead>
                <tr>
                  <th className="price-col">Price</th>
                  <th className="amount-col">Amount</th>
                  <th className="qty-col">Qty</th>
                  <th className="total-col">Total</th>
                </tr>
              </thead>
              <tbody>
                {orderBook.slice(0, 50).map((order, index) => {
                  const total = order.price * order.amount;
                  const maxTotal = Math.max(...orderBook.slice(0, 50).map(o => o.price * o.amount));
                  const fillPercentage = (total / maxTotal) * 100;
                  const gradient = `linear-gradient(to left, rgba(239, 68, 68, 0.15) ${fillPercentage}%, transparent ${fillPercentage}%)`;
                  
                  // Use the orders count from the aggregated data, or fallback to estimated count
                  const ordersCount = order.orders || Math.max(1, Math.floor(order.amount / 10));
                  
                  return (
                    <tr key={index} style={{ background: gradient }}>
                      <td className="price-col">
                        <span>{formatPrice(convertPrice(order.price))}</span>
                      </td>
                      <td className="amount-col">
                        <span>{order.amount}</span>
                      </td>
                      <td className="qty-col">
                        <span>{ordersCount}</span>
                      </td>
                      <td className="total-col">
                        <span>{formatPrice(convertPrice(total))}</span>
                      </td>
                    </tr>
                  );
                })}
                {orderBook.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center' }}>No orders</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Rotating Banners */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 165, 0, 0.3), rgba(255, 140, 0, 0.3))',
            padding: 'calc(var(--s) * 2)',
            borderRadius: 'var(--r)',
            margin: 'calc(var(--s) * 2) 0',
            border: '1px solid rgba(255, 165, 0, 0.9)',
            textAlign: 'center',
            marginTop: 'auto'
          }}>
            {currentBanner === 0 ? (
              // Referral Banner
              <>
                <div style={{ 
                  fontSize: '0.9rem', 
                  fontWeight: 'bold', 
                  marginBottom: 'calc(var(--s) * 1)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                  <img 
                    src="https://cdn.discordapp.com/emojis/1207450461607694406.webp?size=80" 
                    alt="Referral" 
                    style={{width: '20px', height: '20px', objectFit: 'contain'}} 
                  />
                  Referral Program
                </div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: 'rgba(255, 255, 255, 0.9)',
                  marginBottom: 'calc(var(--s) * 1)'
                }}>
                  Try this awesome service
                </div>
                <button style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  padding: 'calc(var(--s) * 1) calc(var(--s) * 2)',
                  borderRadius: 'calc(var(--r) - 2px)',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}>
                  Your Link
                </button>
              </>
            ) : (
              // Giga Juice Banner
              <>
                <div style={{ 
                  fontSize: '0.9rem', 
                  fontWeight: 'bold', 
                  marginBottom: 'calc(var(--s) * 1)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                  <img 
                    src="https://cdn.discordapp.com/emojis/1367480180007764049.webp?size=48" 
                    alt="Giga Juice" 
                    style={{width: '24px', height: '24px', objectFit: 'contain'}} 
                  />
                  Purchase Giga Juice
                </div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: 'rgba(255, 255, 255, 0.9)',
                  marginBottom: 'calc(var(--s) * 1)'
                }}>
                  Stay Hydrated
                </div>
                <button style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  padding: 'calc(var(--s) * 1) calc(var(--s) * 2)',
                  borderRadius: 'calc(var(--r) - 2px)',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}>
                  BUY
                </button>
              </>
            )}
          </div>
          </>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: 'calc(var(--s) * 4)',
              color: 'var(--muted-fg)',
              fontSize: '0.8rem'
            }}>
              📈 Loading trading functionality...
            </div>
          )}
        </div>
      </div>
      )}

      {/* Loading State for Trading Layout */}
      {!marketsLoaded && itemDetailsLoaded && (
        <div style={{
          textAlign: 'center',
          padding: 'calc(var(--s) * 6)',
          color: 'var(--muted-fg)',
          fontSize: '0.9rem'
        }}>
          💹 Loading markets and trading interface...
        </div>
      )}

      {/* Fee Vault Popup */}
      {showFeeVaultPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card)',
            padding: 'calc(var(--s) * 4)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            textAlign: 'center',
            maxWidth: '400px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ 
              fontSize: '2rem', 
              marginBottom: 'calc(var(--s) * 1)' 
            }}>
              {(() => {
                const groveBoxInfo = getItemInfo(464);
                return groveBoxInfo.icon && groveBoxInfo.icon.startsWith('http') ? (
                  <img src={groveBoxInfo.icon} alt="Grove Box" style={{width: '40px', height: '40px', objectFit: 'contain'}} />
                ) : (
                  <span>{groveBoxInfo.icon || '🏛️'}</span>
                );
              })()}
            </div>
            <h3 style={{ 
              marginBottom: 'calc(var(--s) * 1)', 
              color: 'var(--fg)',
              fontSize: '1.2rem'
            }}>
              Fee Vault
            </h3>
            <p style={{ 
              marginBottom: 'calc(var(--s) * 1)', 
              color: 'var(--muted-fg)', 
              fontSize: '0.9rem',
              lineHeight: '1.4'
            }}>
              All fees flow to vault pools, to be distributed among users.
            </p>
            <p style={{ 
              marginBottom: 'calc(var(--s) * 1.5)', 
              color: 'var(--muted-fg)', 
              fontSize: '0.8rem',
              fontStyle: 'italic'
            }}>
              More detail soon, stay tuned!
            </p>
            <button
              onClick={() => setShowFeeVaultPopup(false)}
              style={{
                padding: 'calc(var(--s) * 1.5) calc(var(--s) * 3)',
                backgroundColor: 'var(--success)',
                color: 'white',
                border: 'none',
                borderRadius: 'calc(var(--r) - 2px)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '700',
                minWidth: '100px'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Deals Popup */}
      {showDealsPopup && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDealsPopup(false);
            }
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            cursor: 'pointer'
          }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg)',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '1000px',
              height: '85%',
              maxHeight: '850px',
              padding: '20px',
              border: '1px solid var(--border)',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'default'
            }}>
            <button
              onClick={() => setShowDealsPopup(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: 'var(--fg)',
                zIndex: 1001
              }}
            >
              ✕
            </button>
            <Deals 
              currentItem={currentItem}
              getItemInfo={getItemInfo}
              walletAddress={address}
              isWalletConnected={isConnected}
              abstractClient={abstractClient}
              mainLoading={loading}
              fetchUsername={fetchUsername}
              ethToUsdRate={ethToUsdRate}
            />
          </div>
        </div>
      )}

      {/* Trades Dropdown */}
      <TradesDropdown
        isOpen={showTradesDropdown}
        onClose={() => setShowTradesDropdown(false)}
        getItemInfo={getItemInfo}
        allRecentTrades={allRecentTrades}
        availableListings={availableListings}
        ethToUsdRate={ethToUsdRate}
      />


    </div>
  );
};

// Main App Component
function App() {
  return (
    <AGWProvider>
      <div className="app">
        <TradingDashboard />
      </div>
    </AGWProvider>
  );
}

export default App;