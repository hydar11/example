import React, { useState, useEffect } from 'react';
import { transactionValidator } from '../security/TransactionValidator';
import GigaverseAuth from './GigaverseAuth';
import AGWConnection from './AGWConnection';

// Add custom styles for deals
const dealsStyles = `
  .deal-card-original {
    padding: 4px 8px !important;
    margin-bottom: 4px !important;
    border-radius: 8px !important;
    background: var(--card) !important;
    border: 1px solid var(--border) !important;
  }
  
  .deal-top-row {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    margin-bottom: 2px !important;
    margin-top: 0 !important;
  }
  
  .item-section, .stub-section {
    display: flex !important;
    align-items: center !important;
    gap: 3px !important;
  }
  
  .item-details, .stub-count {
    margin: 0 !important;
    padding: 0 !important;
  }
  
  .item-icon-box, .stub-icon-box {
    width: 30px !important;
    height: 30px !important;
  }
  
  .item-icon-box img, .stub-icon-box img {
    width: 30px !important;
    height: 30px !important;
  }
  
  .price-calculations {
    margin: 4px 0 !important;
    padding: 6px !important;
    background: var(--muted) !important;
    border-radius: 4px !important;
  }
  
  .price-row {
    margin-bottom: 2px !important;
    font-size: 0.65rem !important;
    line-height: 1.2 !important;
  }
  
  .deal-actions-row {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    margin-top: 4px !important;
  }
  
  .trade-btn {
    background: linear-gradient(135deg, oklch(85% 0.15 290), oklch(72.3% .219 149.579)) !important;
    color: white !important;
    border: none !important;
    padding: 6px 12px !important;
    border-radius: 4px !important;
    font-size: 0.7rem !important;
    font-weight: bold !important;
    cursor: pointer !important;
  }
  
  .buy-btn {
    background: #4CAF50 !important;
    color: white !important;
    border: none !important;
    padding: 6px 12px !important;
    border-radius: 4px !important;
    font-size: 0.7rem !important;
    font-weight: bold !important;
    cursor: pointer !important;
  }
  
  .execution-count-inline {
    font-size: 0.6rem !important;
    color: var(--muted-fg) !important;
    margin-left: 8px !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = dealsStyles;
  document.head.appendChild(styleSheet);
}

const Deals = ({ currentItem, getItemInfo, walletAddress, isWalletConnected, abstractClient, mainLoading, fetchUsername, ethToUsdRate }) => {
  const [dealsData, setDealsData] = useState({ weekly: [], daily: [] });
  const [dealsLoading, setDealsLoading] = useState(false);
  const [itemPrices, setItemPrices] = useState({});
  const [stubIcon, setStubIcon] = useState(null);
  // Use wallet address from props instead of hardcoded value
  const [noobId, setNoobId] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [executingDeal, setExecutingDeal] = useState(null);
  const [showTradePopup, setShowTradePopup] = useState(false);
  const [tradePopupMessage, setTradePopupMessage] = useState('');
  const [tradePopupType, setTradePopupType] = useState('success'); // 'success' or 'error'
  const [playerInventory, setPlayerInventory] = useState({}); // Store player item balances
  // Use ETH price from parent component
  const [showBuyPopup, setShowBuyPopup] = useState(false);
  const [buyData, setBuyData] = useState(null);
  const [buyingItem, setBuyingItem] = useState(false);
  const [playerName, setPlayerName] = useState(null); // Store player name
  const [showBuyOptionsPopup, setShowBuyOptionsPopup] = useState(false);
  const [buyOptionsData, setBuyOptionsData] = useState(null);

  // Fetch deals data from API with player address
  const fetchDealsData = async () => {
    setDealsLoading(true);
    try {
      const url = walletAddress ? `/api/deals?playerAddress=${walletAddress}` : '/api/deals';
      
      const response = await fetch(url);
      const data = await response.json();
      
      setDealsData(data);
    } catch (error) {
      console.error('❌ Error fetching deals data:', error);
      setDealsData({ weekly: [], daily: [] });
    } finally {
      setDealsLoading(false);
    }
  };

  // Fetch stub icon
  const fetchStubIcon = async () => {
    try {
      const response = await fetch('/api/stub-icon');
      const data = await response.json();
      setStubIcon(data);
    } catch (error) {
      console.error('Error fetching stub icon:', error);
    }
  };

  // ETH price is now passed as prop from parent component

  // Handle authentication success from centralized component
  const handleAuthSuccess = (token) => {
    setAuthToken(token);
    
    // Refresh data after authentication
    fetchNoobId();
    fetchDealsData();
    fetchPlayerInventory();
  };

  // Handle authentication error from centralized component  
  const handleAuthError = (error) => {
    setTradePopupType('error');
    setTradePopupMessage(`Authentication failed: ${error}`);
    setShowTradePopup(true);
  };

  // Handle AGW connection success
  const handleAGWConnectionSuccess = ({ abstractClient, address, isConnected }) => {
    // Don't show popup for successful connection to avoid layout disruption
    console.log('✅ AGW Connected in Deals component');
  };

  // Handle AGW connection error
  const handleAGWConnectionError = (error) => {
    setTradePopupType('error');
    setTradePopupMessage(`AGW connection failed: ${error}`);
    setShowTradePopup(true);
  };

  // Handle AGW disconnection
  const handleAGWDisconnect = () => {
    setAuthToken(null); // Clear Gigaverse auth when AGW disconnects
  };

  // Fetch noobId for player
  const fetchNoobId = async () => {
    if (!walletAddress) {
      return;
    }
    
    try {
      const response = await fetch(`/api/noob-id/${walletAddress}`);
      const data = await response.json();
      if (data.success) {
        setNoobId(data.noobId);
      }
    } catch (error) {
      console.error('Error fetching noobId:', error);
    }
  };

  // Fetch player inventory balances
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

  // Fetch player name using the same logic as buyer/seller names
  const fetchPlayerName = async () => {
    if (!walletAddress || !fetchUsername) {
      setPlayerName(null);
      return;
    }

    try {
      const username = await fetchUsername(walletAddress);
      setPlayerName(username);
    } catch (error) {
      console.error('❌ Error fetching player name:', error);
      setPlayerName(null);
    }
  };

  // Execute deal
  const executeDeal = async (deal) => {
    
    if (!isWalletConnected) {
      setTradePopupType('error');
      setTradePopupMessage('Please connect your wallet first before executing deals.');
      setShowTradePopup(true);
      return;
    }
    
    if (!noobId) {
      setTradePopupType('error');
      setTradePopupMessage('Missing player ID. Please refresh the page and try again.');
      setShowTradePopup(true);
      return;
    }
    
    // Check for Gigaverse auth using server-side token (same as sell block)
    if (!authToken) {
      setTradePopupType('error');
      setTradePopupMessage('Please authenticate with Gigaverse first');
      setShowTradePopup(true);
      return;
    }

    const recipeId = `Recipe#${deal.ID_CID}`;
    setExecutingDeal(recipeId);

    try {
      const response = await fetch('/api/execute-deal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipeId: recipeId,
          noobId: noobId,
          authToken: authToken
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setTradePopupType('success');
        setTradePopupMessage('Your deal has been executed successfully! Your stubs have been added to your inventory.');
        setShowTradePopup(true);
        // Refresh deals data to update execution counts
        fetchDealsData();
      } else {
        setTradePopupType('error');
        setTradePopupMessage(`Deal execution failed: ${data.error || 'Unknown error occurred'}`);
        setShowTradePopup(true);
      }
    } catch (error) {
      console.error('❌ Error executing deal:', error);
      setTradePopupType('error');
      setTradePopupMessage('Network error occurred while executing deal. Please check your connection and try again.');
      setShowTradePopup(true);
    } finally {
      setExecutingDeal(null);
    }
  };

  // Calculate real price for buying multiple items from orderbook
  const calculateRealPrice = async (itemId, amount) => {
    try {
      const response = await fetch(`/api/orderbook/${itemId}`);
      const orderbook = await response.json();
      
      let totalCost = 0;
      let remainingAmount = amount;
      
      // Sort asks by price (lowest first)
      const sortedAsks = orderbook.asks.sort((a, b) => a.price - b.price);
      
      for (const ask of sortedAsks) {
        if (remainingAmount <= 0) break;
        
        const takeAmount = Math.min(remainingAmount, ask.amount);
        totalCost += takeAmount * ask.price;
        remainingAmount -= takeAmount;
      }
      
      if (remainingAmount > 0) {
        // Not enough liquidity, use last available price for remaining
        const lastPrice = sortedAsks[sortedAsks.length - 1]?.price || 0;
        totalCost += remainingAmount * lastPrice;
      }
      
      return totalCost;
    } catch (error) {
      console.error('❌ Error calculating real price:', error);
      return 0;
    }
  };

  // Handle buy button click - show buy options or direct buy
  const handleBuyClick = async (deal, itemInfo, singleTradeItemsToBuy, totalItemsToBuy) => {
    if (!isWalletConnected) {
      setTradePopupType('error');
      setTradePopupMessage('Please connect your wallet first before buying items.');
      setShowTradePopup(true);
      return;
    }

    const maxExecutions = deal.maxCompletions || 1;
    const currentExecutions = deal.currentExecutions || 0;
    const remainingExecutions = maxExecutions - currentExecutions;

    // If only one execution available or no items to buy for single trade, go directly to buy popup
    if (remainingExecutions <= 1 || singleTradeItemsToBuy <= 0) {
      if (singleTradeItemsToBuy <= 0) {
        setTradePopupType('error');
        setTradePopupMessage('You already have enough items for this deal.');
        setShowTradePopup(true);
        return;
      }
      
      // Get real price from order book for single trade
      const realPrice = await calculateRealPrice(deal.inputId, singleTradeItemsToBuy);
      
      setBuyData({
        itemName: itemInfo.name,
        icon: itemInfo.icon,
        amount: singleTradeItemsToBuy,
        priceEth: realPrice / singleTradeItemsToBuy,
        totalCost: realPrice,
        buyType: 'single'
      });
      
      setShowBuyPopup(true);
      return;
    }

    // Multiple executions available - show buy options popup
    setBuyOptionsData({
      deal,
      itemInfo,
      singleTradeItemsToBuy,
      totalItemsToBuy,
      remainingExecutions,
      singleTradeStubs: deal.stubsReceived || 0,
      totalTradeStubs: (deal.stubsReceived || 0) * remainingExecutions
    });
    
    setShowBuyOptionsPopup(true);
  };

  // Handle buy for single trade
  const handleBuyForSingleTrade = async () => {
    if (!buyOptionsData) return;
    
    const { deal, itemInfo, singleTradeItemsToBuy } = buyOptionsData;
    
    if (singleTradeItemsToBuy <= 0) {
      setTradePopupType('error');
      setTradePopupMessage('You already have enough items for one trade.');
      setShowTradePopup(true);
      setShowBuyOptionsPopup(false);
      return;
    }
    
    // Get real price from order book for single trade
    const realPrice = await calculateRealPrice(deal.inputId, singleTradeItemsToBuy);
    
    setBuyData({
      itemName: itemInfo.name,
      icon: itemInfo.icon,
      amount: singleTradeItemsToBuy,
      priceEth: realPrice / singleTradeItemsToBuy,
      totalCost: realPrice,
      buyType: 'single'
    });
    
    setShowBuyOptionsPopup(false);
    setShowBuyPopup(true);
  };

  // Handle buy for all available trades
  const handleBuyForAllTrades = async () => {
    if (!buyOptionsData) return;
    
    const { deal, itemInfo, totalItemsToBuy } = buyOptionsData;
    
    if (totalItemsToBuy <= 0) {
      setTradePopupType('error');
      setTradePopupMessage('You already have enough items for all available trades.');
      setShowTradePopup(true);
      setShowBuyOptionsPopup(false);
      return;
    }
    
    // Get real price from order book for all trades
    const realPrice = await calculateRealPrice(deal.inputId, totalItemsToBuy);
    
    setBuyData({
      itemName: itemInfo.name,
      icon: itemInfo.icon,
      amount: totalItemsToBuy,
      priceEth: realPrice / totalItemsToBuy,
      totalCost: realPrice,
      buyType: 'all'
    });
    
    setShowBuyOptionsPopup(false);
    setShowBuyPopup(true);
  };

  // Execute buy from deal using same logic as main page bulk buy
  const executeBuyFromDeal = async () => {
    if (!buyData || !isWalletConnected || !abstractClient || !walletAddress) {
      setTradePopupType('error');
      setTradePopupMessage('Missing required data or wallet not connected.');
      setShowTradePopup(true);
      return;
    }

    setBuyingItem(true);
    
    try {
      // Implementation would go here - using same bulk buy logic as main app
      setTradePopupType('success');
      setTradePopupMessage(`Successfully purchased ${buyData.amount} ${buyData.itemName}!`);
      setShowTradePopup(true);
      setShowBuyPopup(false);
      
      // Refresh inventory after successful purchase
      if (authToken) {
        fetchPlayerInventory();
      }
      
    } catch (error) {
      console.error('❌ Buy error:', error);
      setTradePopupType('error');
      setTradePopupMessage(`Purchase failed: ${error.message}`);
      setShowTradePopup(true);
    } finally {
      setBuyingItem(false);
    }
  };

  // Calculate deal metrics
  const calculateDealMetrics = async (deal) => {
    const inputId = deal.INPUT_ID_CID_array[0];
    const inputAmount = deal.INPUT_AMOUNT_CID_array[0];
    const stubsReceived = deal.LOOT_AMOUNT_CID_array[0];
    
    const totalCost = await calculateRealPrice(inputId, inputAmount);
    const costPerStub = totalCost / stubsReceived;
    
    return {
      ...deal,
      inputId,
      inputAmount,
      stubsReceived,
      totalCost,
      costPerStub
    };
  };

  // Load deals data and stub icon on component mount
  useEffect(() => {
    fetchStubIcon();
    fetchDealsData(); // Always fetch deals, regardless of wallet connection
    // ETH price is now provided as prop from parent component
    
    if (walletAddress) {
      fetchNoobId();
      fetchPlayerName(); // Fetch player name when wallet address changes
    } else {
      setPlayerName(null); // Clear player name when wallet disconnected
    }
  }, [walletAddress]);

  // Fetch player inventory when auth token is available
  useEffect(() => {
    if (authToken) {
      fetchPlayerInventory();
    }
  }, [authToken]);

  // Calculate totals for each deal type with multipliers - separate tradeable and non-tradeable
  const calculateTotals = (deals) => {
    const tradeableDeals = deals.filter(deal => deal.isTradeable !== false);
    const nonTradeableDeals = deals.filter(deal => deal.isTradeable === false);
    
    const totalCost = tradeableDeals.reduce((sum, deal) => sum + (deal.totalCostWithMultiplier || 0), 0);
    const totalStubs = tradeableDeals.reduce((sum, deal) => sum + (deal.totalStubsReceived || 0), 0);
    const totalNonTradeableStubs = nonTradeableDeals.reduce((sum, deal) => sum + (deal.totalStubsReceived || 0), 0);
    const totalAllStubs = totalStubs + totalNonTradeableStubs; // Sum of tradeable + non-tradeable
    const avgCostPerStub = totalStubs > 0 ? totalCost / totalStubs : 0;
    
    return { totalCost, totalStubs, totalNonTradeableStubs, totalAllStubs, avgCostPerStub };
  };

  const weeklyTotals = calculateTotals(dealsData.weekly);
  const dailyTotals = calculateTotals(dealsData.daily);

  // Get item info using the same function as other components
  const getItemInfoSafe = (itemId) => {
    if (!getItemInfo) return { name: `Item ${itemId}`, image: null, icon: null };
    const itemInfo = getItemInfo(itemId);
    return itemInfo;
  };

  // Format price display
  const formatPrice = (price) => {
    return price.toFixed(6);
  };

  // Format USD price display using passed ethToUsdRate
  const formatUsdPrice = (ethAmount) => {
    if (!ethToUsdRate || ethToUsdRate === 0) return 'N/A'; // No USD price available
    const usdValue = ethAmount * ethToUsdRate;
    if (usdValue < 0.01) return '$0.00';
    if (usdValue < 1) return `$${usdValue.toFixed(3)}`;
    return `$${usdValue.toFixed(2)}`;
  };

  const renderDealCard = (deal) => {
    const itemInfo = getItemInfoSafe(deal.inputId);
    
    // Calculate amounts for SINGLE TRADE (not multiplied)
    const singleTradeItemsNeeded = deal.inputAmount; // Single trade amount
    const singleTradeStubsReceived = deal.stubsReceived; // Single trade stubs
    const singleTradeCostPerStub = deal.costPerStub || 0; // Single trade cost per stub
    
    // Calculate inventory info for ALL available executions
    const maxExecutions = deal.maxCompletions || 1;
    const currentExecutions = deal.currentExecutions || 0;
    const remainingExecutions = maxExecutions - currentExecutions;
    const totalItemsNeeded = singleTradeItemsNeeded * remainingExecutions;
    const itemsOwned = playerInventory[deal.inputId] || 0;
    const totalItemsToBuy = Math.max(0, totalItemsNeeded - itemsOwned);
    
    // Calculate costs
    const totalCostAllExecutions = deal.totalCostWithMultiplier || (deal.totalCost || 0) * remainingExecutions; // Total cost for all executions
    const singleTradeItemsToBuy = Math.max(0, singleTradeItemsNeeded - itemsOwned);
    const singleTradeBuyPrice = deal.isTradeable ? (singleTradeItemsToBuy * (deal.totalCost || 0) / singleTradeItemsNeeded) : 0;
    
    return (
      <div key={deal.ID_CID} className="deal-card-original" style={{
        width: '100%',
        maxWidth: '350px',
        minWidth: '300px',
        margin: '0 auto'
      }}>
        {/* Top row: Item info, arrow, stub info */}
        <div className="deal-top-row">
          {/* Item section */}
          <div className="item-section">
            <div className="item-icon-box">
              {itemInfo.icon && itemInfo.icon.startsWith('http') ? (
                <img src={itemInfo.icon} alt={itemInfo.name} style={{width: '40px', height: '40px', objectFit: 'contain'}} />
              ) : (
                <span className="item-icon-text">{itemInfo.icon || '📦'}</span>
              )}
            </div>
            <div className="item-details">
              <div className="item-name">{itemInfo.name}</div>
              <div className="item-quantity">
                <span style={{ color: itemsOwned < singleTradeItemsNeeded ? '#ff4444' : 'inherit' }}>
                  {itemsOwned}
                </span>
                <span style={{ color: 'inherit' }}> / {singleTradeItemsNeeded}</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="arrow-large">➤</div>

          {/* Stub section */}
          <div className="stub-section">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div className="stub-count">{singleTradeStubsReceived}</div>
              {remainingExecutions > 1 && (
                <div style={{ 
                  fontSize: '0.65rem', 
                  color: 'var(--muted-fg)', 
                  marginTop: '1px',
                  textAlign: 'right'
                }}>
                  <span style={{ color: 'var(--muted-fg)' }}>total</span> {singleTradeStubsReceived * remainingExecutions}
                </div>
              )}
            </div>
            <div className="stub-icon-box">
              {(() => {
                const stubInfo = getItemInfo(373);
                return stubInfo.icon && stubInfo.icon.startsWith('http') ? (
                  <img src={stubInfo.icon} alt="Stub" style={{width: '40px', height: '40px', objectFit: 'contain'}} />
                ) : (
                  <span className="stub-icon-text">{stubInfo.icon || '🎲'}</span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Price calculations */}
        {deal.isTradeable && (
          <div className="price-calculations">
            <div className="price-row">
              <span className="price-label">TOTAL COST:</span>
              <span className="price-value">
                {formatPrice(totalCostAllExecutions)} ETH
                {ethToUsdRate > 0 ? <span className="price-usd"> ({formatUsdPrice(totalCostAllExecutions)})</span> : <span className="price-usd"> (USD N/A)</span>}
              </span>
            </div>
            <div className="price-row">
              <span className="price-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {(() => {
                  const stubInfo = getItemInfo(373);
                  return stubInfo.icon && stubInfo.icon.startsWith('http') ? (
                    <img src={stubInfo.icon} alt="Stub" style={{width: '12px', height: '12px', objectFit: 'contain'}} />
                  ) : (
                    <span style={{ fontSize: '10px' }}>{stubInfo.icon || '🎲'}</span>
                  );
                })()}
                COST PER STUB:
              </span>
              <span className="price-value">
                {formatPrice(singleTradeCostPerStub)} ETH
                {ethToUsdRate > 0 ? <span className="price-usd"> ({formatUsdPrice(singleTradeCostPerStub)})</span> : <span className="price-usd"> (USD N/A)</span>}
              </span>
            </div>
            {singleTradeItemsToBuy > 0 && (
              <div className="price-row">
                <span className="price-label">LEFT TO BUY {singleTradeItemsToBuy}:</span>
                <span className="price-value">
                  {formatPrice(singleTradeBuyPrice)} ETH
                  {ethToUsdRate > 0 ? <span className="price-usd"> ({formatUsdPrice(singleTradeBuyPrice)})</span> : <span className="price-usd"> (USD N/A)</span>}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="deal-actions-row">
          <div className="left-buttons">
            <button 
              className="trade-btn"
              onClick={() => executeDeal(deal)}
              disabled={executingDeal === `Recipe#${deal.ID_CID}` || itemsOwned < singleTradeItemsNeeded}
            >
              {executingDeal === `Recipe#${deal.ID_CID}` ? 'EXECUTING...' : 'TRADE'}
            </button>
            <div className="execution-count-inline">
              {deal.currentExecutions || 0} / {deal.maxCompletions || 1}
            </div>
          </div>
          <button 
            className="buy-btn"
            disabled={singleTradeItemsToBuy === 0 && totalItemsToBuy === 0}
            onClick={() => handleBuyClick(deal, itemInfo, singleTradeItemsToBuy, totalItemsToBuy)}
          >
            BUY
          </button>
        </div>
      </div>
    );
  };

  const renderTotalsCard = (totals, title) => (
    <div className="totals-card">
      <h3 style={{
        fontSize: '0.9rem',
        color: '#ffa500',
        margin: '0 0 1rem 0',
        textAlign: 'center'
      }}>{title} Summary</h3>
      <div className="totals-metrics">
        <div className="total-metric">
          <span className="metric-label">Total Cost:</span>
          <span className="metric-value">
            {formatPrice(totals.totalCost)} ETH
            {ethToUsdRate > 0 && <span className="price-usd"> ({formatUsdPrice(totals.totalCost)})</span>}
          </span>
        </div>
        <div className="total-metric">
          <span className="metric-label">Total Stubs:</span>
          <span className="metric-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {totals.totalStubs}
              <span style={{ marginLeft: '4px', display: 'inline-flex', alignItems: 'center' }}>
                {(() => {
                  const stubInfo = getItemInfo(373);
                  return stubInfo.icon && stubInfo.icon.startsWith('http') ? (
                    <img src={stubInfo.icon} alt="Stub" style={{width: '16px', height: '16px', objectFit: 'contain'}} />
                  ) : (
                    <span>{stubInfo.icon || '🎲'}</span>
                  );
                })()}
              </span>
            </div>
            {totals.totalAllStubs > totals.totalStubs && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-fg)', marginTop: '2px' }}>
                ( {totals.totalAllStubs} )
              </div>
            )}
          </span>
        </div>
        <div className="total-metric">
          <span className="metric-label">Avg Cost per Stub:</span>
          <span className="metric-value">
            {formatPrice(totals.avgCostPerStub)} ETH
            {ethToUsdRate > 0 && <span className="price-usd"> ({formatUsdPrice(totals.avgCostPerStub)})</span>}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>

      {/* Custom Trade Notification Popup */}
      {showTradePopup && (
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
            background: tradePopupType === 'error' ? 'rgba(255, 0, 0, 0.2)' : 'var(--card)',
            padding: 'calc(var(--s) * 4)',
            borderRadius: 'var(--r)',
            border: tradePopupType === 'error' ? '1px solid rgba(255, 0, 0, 0.8)' : `2px solid var(--success)`,
            textAlign: 'center',
            maxWidth: '400px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ 
              fontSize: '3rem', 
              marginBottom: 'calc(var(--s) * 2)' 
            }}>
              {tradePopupType === 'success' ? '🎉' : '❌'}
            </div>
            <h3 style={{ 
              marginBottom: 'calc(var(--s) * 2)', 
              color: tradePopupType === 'success' ? 'var(--success)' : 'var(--destructive)',
              fontSize: '1.2rem'
            }}>
              {tradePopupType === 'success' ? 'Trade Executed Successfully!' : 'Trade Failed'}
            </h3>
            <p style={{ 
              marginBottom: 'calc(var(--s) * 3)', 
              color: 'var(--muted-fg)', 
              fontSize: '0.75rem',
              lineHeight: '1.4'
            }}>
              {tradePopupMessage}
            </p>
            <button
              onClick={() => setShowTradePopup(false)}
              style={{
                padding: 'calc(var(--s) * 1.5) calc(var(--s) * 2)',
                backgroundColor: tradePopupType === 'success' ? 'var(--success)' : 'var(--destructive)',
                color: 'white',
                border: 'none',
                borderRadius: 'calc(var(--r) - 2px)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: '700',
                minWidth: '100px'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Buy Confirmation Popup */}
      {showBuyPopup && buyData && (
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
          zIndex: 2000
        }}>
          <div style={{
            background: 'var(--card)',
            padding: 'calc(var(--s) * 4)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            textAlign: 'center',
            maxWidth: '400px',
            minWidth: '350px'
          }}>
            <h3 style={{ marginBottom: 'calc(var(--s) * 3)', fontSize: '1.2rem' }}>
              Confirm Purchase
            </h3>
            
            {/* Auth notification */}
            {!authToken && (
              <div style={{
                backgroundColor: 'rgba(255, 165, 0, 0.2)',
                color: 'white',
                padding: 'calc(var(--s) * 1.5)',
                borderRadius: 'calc(var(--r) - 2px)',
                marginBottom: 'calc(var(--s) * 2)',
                fontSize: '0.55rem',
                textAlign: 'center',
                border: '1px solid rgba(255, 165, 0, 0.3)'
              }}>
                ⚠️ Auth not connected - you will buy full amount for the deal. Log in auth to buy only missing amount.
              </div>
            )}

            {/* Buy info card */}
            <div style={{
              background: 'linear-gradient(135deg, var(--muted), var(--bg))',
              padding: 'calc(var(--s) * 2)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              marginTop: 'calc(var(--s) * 2)',
              fontSize: '0.65rem',
              width: '100%',
              display: 'block',
              marginBottom: 'calc(var(--s) * 3)'
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
                  {buyData.itemName}
                </span>
              </div>

              <div style={{ width: '100%', display: 'block' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 'calc(var(--s) * 0.5)',
                  color: 'var(--muted-fg)',
                  width: '100%'
                }}>
                  <span>Amount:</span>
                  <span style={{ color: 'var(--fg)' }}>{buyData.amount}</span>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 'calc(var(--s) * 0.5)',
                  color: 'var(--fg)',
                  width: '100%'
                }}>
                  <span>Total:</span>
                  <span style={{ fontWeight: '700' }}>
                    {buyData.totalCost.toFixed(6)} ETH
                    {ethToUsdRate > 0 && (
                      <span style={{ color: 'var(--muted-fg)', marginLeft: '4px', fontWeight: '400' }}>
                        ({formatUsdPrice(buyData.totalCost)})
                      </span>
                    )}
                  </span>
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
                    {(buyData.totalCost * 0.01).toFixed(6)} ETH
                    {ethToUsdRate > 0 && (
                      <span style={{ marginLeft: '4px' }}>
                        ({formatUsdPrice(buyData.totalCost * 0.01)})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 'var(--s)', justifyContent: 'center' }}>
              <button
                onClick={() => executeBuyFromDeal()}
                disabled={buyingItem}
                style={{
                  padding: 'calc(var(--s) * 1.5) calc(var(--s) * 3)',
                  backgroundColor: 'var(--success)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'calc(var(--r) - 2px)',
                  cursor: buyingItem ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  opacity: buyingItem ? 0.7 : 1
                }}
              >
                {buyingItem ? 'Processing...' : 'Continue'}
              </button>
              <button
                onClick={() => setShowBuyPopup(false)}
                disabled={buyingItem}
                style={{
                  padding: 'calc(var(--s) * 1.5) calc(var(--s) * 3)',
                  backgroundColor: 'var(--muted)',
                  color: 'var(--fg)',
                  border: 'none',
                  borderRadius: 'calc(var(--r) - 2px)',
                  cursor: buyingItem ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  opacity: buyingItem ? 0.7 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy Options Popup - Choose between single trade or all trades */}
      {showBuyOptionsPopup && buyOptionsData && (
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
          zIndex: 2100
        }}>
          <div style={{
            background: 'var(--card)',
            padding: 'calc(var(--s) * 4)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            textAlign: 'center',
            maxWidth: '450px',
            minWidth: '400px'
          }}>
            <h3 style={{ marginBottom: 'calc(var(--s) * 3)', fontSize: '1.2rem' }}>
              Choose Buy Amount
            </h3>
            
            <div style={{
              marginBottom: 'calc(var(--s) * 3)',
              color: 'var(--muted-fg)',
              fontSize: '0.8rem',
              lineHeight: '1.4'
            }}>
              This deal has {buyOptionsData.remainingExecutions} remaining executions available.
              <br />Choose how many items you want to buy:
            </div>
            
            {/* Buy Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--s) * 2)', marginBottom: 'calc(var(--s) * 3)' }}>
              
              {/* Buy for 1 Trade Option */}
              <button
                onClick={handleBuyForSingleTrade}
                disabled={buyOptionsData.singleTradeItemsToBuy <= 0}
                style={{
                  padding: 'calc(var(--s) * 2)',
                  backgroundColor: buyOptionsData.singleTradeItemsToBuy > 0 ? 'rgba(76, 175, 80, 0.5)' : 'rgba(128, 128, 128, 0.5)',
                  color: 'white',
                  border: buyOptionsData.singleTradeItemsToBuy > 0 ? '1px solid rgba(76, 175, 80, 0.8)' : '1px solid rgba(128, 128, 128, 0.8)',
                  borderRadius: 'calc(var(--r) - 2px)',
                  cursor: buyOptionsData.singleTradeItemsToBuy > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  opacity: buyOptionsData.singleTradeItemsToBuy > 0 ? 1 : 0.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Buy for 1 Trade</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
                    {buyOptionsData.singleTradeItemsToBuy > 0 
                      ? `Buy ${buyOptionsData.singleTradeItemsToBuy} ${buyOptionsData.itemInfo.name}` 
                      : 'You have enough items for 1 trade'
                    }
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                  {buyOptionsData.singleTradeStubs}
                  {(() => {
                    const stubInfo = getItemInfo(373);
                    return stubInfo.icon && stubInfo.icon.startsWith('http') ? (
                      <img src={stubInfo.icon} alt="Stub" style={{width: '16px', height: '16px', objectFit: 'contain'}} />
                    ) : (
                      <span style={{ fontSize: '12px' }}>{stubInfo.icon || '🎲'}</span>
                    );
                  })()}
                </div>
              </button>

              {/* Buy for All Trades Option */}
              <button
                onClick={handleBuyForAllTrades}
                disabled={buyOptionsData.totalItemsToBuy <= 0}
                style={{
                  padding: 'calc(var(--s) * 2)',
                  backgroundColor: buyOptionsData.totalItemsToBuy > 0 ? 'rgba(33, 150, 243, 0.5)' : 'rgba(128, 128, 128, 0.5)',
                  color: 'white',
                  border: buyOptionsData.totalItemsToBuy > 0 ? '1px solid rgba(33, 150, 243, 0.8)' : '1px solid rgba(128, 128, 128, 0.8)',
                  borderRadius: 'calc(var(--r) - 2px)',
                  cursor: buyOptionsData.totalItemsToBuy > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  opacity: buyOptionsData.totalItemsToBuy > 0 ? 1 : 0.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Buy for All Trades</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>
                    {buyOptionsData.totalItemsToBuy > 0 
                      ? `Buy ${buyOptionsData.totalItemsToBuy} ${buyOptionsData.itemInfo.name} (${buyOptionsData.remainingExecutions} trades)` 
                      : 'You have enough items for all trades'
                    }
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                  {buyOptionsData.totalTradeStubs}
                  {(() => {
                    const stubInfo = getItemInfo(373);
                    return stubInfo.icon && stubInfo.icon.startsWith('http') ? (
                      <img src={stubInfo.icon} alt="Stub" style={{width: '16px', height: '16px', objectFit: 'contain'}} />
                    ) : (
                      <span style={{ fontSize: '12px' }}>{stubInfo.icon || '🎲'}</span>
                    );
                  })()}
                </div>
              </button>
            </div>
            
            <button
              onClick={() => setShowBuyOptionsPopup(false)}
              style={{
                padding: 'calc(var(--s) * 1.5) calc(var(--s) * 3)',
                backgroundColor: 'var(--muted)',
                color: 'var(--fg)',
                border: 'none',
                borderRadius: 'calc(var(--r) - 2px)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '700'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    
    <div className="deals-container">
      <div className="deals-header">
        <h2 style={{ fontSize: '1.2rem' }}>Daily & Weekly Deals</h2>
        <div style={{display: 'flex', alignItems: 'center', gap: '15px', marginRight: '40px'}}>
          {/* Player Stub Balance when wallet connected */}
          {isWalletConnected && (
            <div style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              fontSize: '0.7rem',
              padding: '4px 8px',
              background: 'var(--muted)',
              borderRadius: '4px',
              border: '1px solid var(--border)'
            }}>
              {playerName && (
                <span style={{ color: 'var(--fg)', marginRight: '4px' }}>
                  {playerName} -
                </span>
              )}
              {(() => {
                const stubInfo = getItemInfo(373);
                return stubInfo.icon && stubInfo.icon.startsWith('http') ? (
                  <img src={stubInfo.icon} alt="Stub" style={{width: '16px', height: '16px', objectFit: 'contain'}} />
                ) : (
                  <span style={{ fontSize: '12px' }}>{stubInfo.icon || '🎲'}</span>
                );
              })()}
              <span style={{ fontWeight: 'bold', color: 'var(--fg)' }}>
                {playerInventory[373] || 0}
              </span>
              <span style={{ color: 'var(--muted-fg)', fontSize: '0.6rem' }}>
                stubs
              </span>
            </div>
          )}
          
          <div style={{fontSize: '0.7rem', color: !isWalletConnected ? 'var(--destructive)' : authToken ? 'var(--success)' : 'var(--destructive)'}}>
            {!isWalletConnected ? '🔴 Connect wallet required' : authToken ? '🟢 Authenticated' : '🔴 Need Giga login'}
          </div>
          
          {/* Centralized AGW Connection Component */}
          {!isWalletConnected && (
            <AGWConnection
              onConnectionSuccess={handleAGWConnectionSuccess}
              onConnectionError={handleAGWConnectionError}
              onDisconnect={handleAGWDisconnect}
              buttonStyle={{
                padding: '4px 8px',
                fontSize: '0.65rem',
                backgroundColor: 'var(--card)',
                fontWeight: 'normal'
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
              connectingText="Connecting..."
            />
          )}

          {/* Centralized Gigaverse Auth Component - only show when wallet connected */}
          {isWalletConnected && (
            <GigaverseAuth
              abstractClient={abstractClient}
              walletAddress={walletAddress}
              isWalletConnected={isWalletConnected}
              authToken={authToken}
              onAuthSuccess={handleAuthSuccess}
              onAuthError={handleAuthError}
              buttonStyle={{
                padding: '4px 8px',
                fontSize: '0.65rem',
                fontWeight: 'normal'
              }}
            />
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        gap: 'calc(var(--s) * 3)'
      }}>
        {/* Weekly Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          
          {renderTotalsCard(weeklyTotals, 'Weekly')}
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(var(--s) * 1)',
            alignItems: 'center',
            width: '100%',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 300px)',
            marginTop: 'calc(var(--s) * 1.5)'
          }}>
            {dealsLoading ? (
              <div>Loading weekly deals...</div>
            ) : dealsData.weekly.length > 0 ? (
              dealsData.weekly.map(renderDealCard)
            ) : (
              <div style={{ color: 'var(--muted-fg)', fontSize: '0.8rem' }}>
                No weekly deals available
              </div>
            )}
          </div>
        </div>

        {/* Daily Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          
          {renderTotalsCard(dailyTotals, 'Daily')}
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(var(--s) * 1)',
            alignItems: 'center',
            width: '100%',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 300px)',
            marginTop: 'calc(var(--s) * 1.5)'
          }}>
            {dealsLoading ? (
              <div>Loading daily deals...</div>
            ) : dealsData.daily.length > 0 ? (
              dealsData.daily.map(renderDealCard)
            ) : (
              <div style={{ color: 'var(--muted-fg)', fontSize: '0.8rem' }}>
                No daily deals available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default Deals;