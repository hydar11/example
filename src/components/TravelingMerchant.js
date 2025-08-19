import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

const TravelingMerchant = ({ currentItem, getItemInfo, walletAddress, isConnected, abstractClient, setShowDealsPopup, handleConnect, mainLoading, availableListings, loadAvailableListings, setMessage }) => {
  const { address } = useAccount(); // Add useAccount hook to get address
  const [dealsData, setDealsData] = useState({ weekly: [], daily: [] });
  const [loading, setLoading] = useState(false);
  const [stubIcon, setStubIcon] = useState(null);
  const [ethPrice, setEthPrice] = useState(0);
  const [playerInventory, setPlayerInventory] = useState({});
  const [executingDeal, setExecutingDeal] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const [showTradePopup, setShowTradePopup] = useState(false);
  const [tradePopupMessage, setTradePopupMessage] = useState('');
  const [tradePopupType, setTradePopupType] = useState('success');
  const [noobId, setNoobId] = useState(null);
  const [showBuyPopup, setShowBuyPopup] = useState(false);
  const [buyData, setBuyData] = useState(null);
  const [buyingItem, setBuyingItem] = useState(false);

  // Fetch deals data
  const fetchDealsData = async () => {
    setLoading(true);
    try {
      const url = walletAddress ? `/api/deals?playerAddress=${walletAddress}` : '/api/deals';
      const response = await fetch(url);
      const data = await response.json();
      setDealsData(data);
    } catch (error) {
      console.error('❌ Error fetching deals data:', error);
      setDealsData({ weekly: [], daily: [] });
    } finally {
      setLoading(false);
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

  // Fetch current ETH price in USD via server proxy
  const fetchEthPrice = async () => {
    try {
      const response = await fetch('/api/eth-price');
      const result = await response.json();
      
      if (result.success && result.data?.ethereum?.usd) {
        const price = result.data.ethereum.usd;
        setEthPrice(price);
      } else {
        console.error('❌ ETH price API failed:', result.message || 'Unknown error');
        setEthPrice(0);
      }
    } catch (error) {
      console.error('❌ Error fetching ETH price:', error.message);
      setEthPrice(0);
    }
  };

  // Get auth token from SECURE SERVER-ONLY storage (HTTP-only cookies)
  const getGigaverseAuthToken = async () => {
    try {
      const tokenResponse = await fetch('/api/auth/get-token', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        if (tokenData.success && tokenData.jwt) {
          setAuthToken(tokenData.jwt);
          return tokenData.jwt;
        }
      }
      
      const authData = localStorage.getItem('gigaverse_auth');
      if (authData) {
        localStorage.removeItem('gigaverse_auth');
        console.log('🔒 Security cleanup: removed legacy client-side token');
      }
      
      sessionStorage.clear();
      
      return null;
      
    } catch (error) {
      console.error('🔒 Error retrieving server auth token:', error);
      return null;
    }
  };

  // Authenticate with Gigaverse using same logic as sell block
  const authenticateWithGigaverse = async () => {
    if (!abstractClient || !walletAddress) {
      alert('Please connect AGW wallet first');
      return;
    }
    
    try {
      const timestamp = Date.now();
      const authMessage = `Login to Gigaverse at ${timestamp}`;
      
      const authSignature = await abstractClient.signMessage({
        message: authMessage
      });
      
      const authResponse = await fetch('https://gigaverse.io/api/user/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*'
        },
        body: JSON.stringify({
          address: walletAddress,
          message: authMessage,
          signature: authSignature,
          timestamp: timestamp
        })
      });
      
      if (!authResponse.ok) {
        throw new Error(`Authentication failed: ${authResponse.status}`);
      }
      
      const authData = await authResponse.json();
      
      const storedAuthData = {
        ...authData,
        address: walletAddress,
        timestamp: timestamp,
        jwt: authData.jwt || authData.token || authData.authToken || authData.accessToken
      };
      
      await fetch('/api/auth/store-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jwt: storedAuthData.jwt,
          address: walletAddress,
          expiresAt: Date.now() + (4 * 60 * 60 * 1000)
        })
      });
      
      const token = storedAuthData.jwt;
      setAuthToken(token);
      setShowAuthPopup(false);
      
      fetchNoobId();
      fetchDealsData();
      fetchPlayerInventory();
      
      return authData;
      
    } catch (error) {
      console.error('❌ Gigaverse auth error:', error);
      alert(`Authentication failed: ${error.message}`);
      return null;
    }
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

  // Execute deal
  const executeDeal = (deal) => {
    console.log('Deal execution not available in popup');
  };

  // Handle buy button click - prepare buy data and show confirmation popup
  const handleBuyClick = async (deal, itemInfo, itemsToBuy) => {
    if (!isConnected) {
      setTradePopupType('error');
      setTradePopupMessage('Please connect your wallet first before buying items.');
      setShowTradePopup(true);
      return;
    }

    // Get real cost from market listings
    await loadAvailableListings();
    
    console.log('🔍 Debug buy click:', {
      dealInputId: deal.inputId,
      itemInfo: itemInfo,
      itemsToBuy: itemsToBuy,
      totalListings: availableListings.length,
      availableListingsForItem: availableListings.filter(l => String(l.item_id) === String(deal.inputId))
    });
    
    const itemListings = availableListings
      .filter(listing => 
        String(listing.item_id) === String(deal.inputId) && 
        (listing.available_amount || listing.amount) > 0
      )
      .sort((a, b) => parseFloat(a.price_per_item) - parseFloat(b.price_per_item));

    if (itemListings.length === 0) {
      setTradePopupType('error');
      setTradePopupMessage(`No listings available for ${itemInfo.name}`);
      setShowTradePopup(true);
      return;
    }

    // Calculate actual cost from cheapest listings
    let totalCost = 0;
    let remainingAmount = itemsToBuy;
    
    for (const listing of itemListings) {
      if (remainingAmount <= 0) break;
      const availableAmount = listing.available_amount || listing.amount;
      const takeAmount = Math.min(remainingAmount, availableAmount);
      totalCost += parseFloat(listing.price_per_item) * takeAmount;
      remainingAmount -= takeAmount;
    }

    if (remainingAmount > 0) {
      setTradePopupType('error');
      setTradePopupMessage(`Not enough ${itemInfo.name} available on market. Need ${itemsToBuy}, found ${itemsToBuy - remainingAmount}`);
      setShowTradePopup(true);
      return;
    }

    setBuyData({
      itemId: deal.inputId,
      itemName: itemInfo.name,
      amount: itemsToBuy,
      totalCost: totalCost,
      listings: itemListings
    });
    setShowBuyPopup(true);
  };

  // Helper function to encode bulk buy transaction data  
  const encodeBulkBuyTransaction = (listingIds, amounts) => {
    let data = '0x807ef825';
    data += '0000000000000000000000000000000000000000000000000000000000000040';
    data += '0000000000000000000000000000000000000000000000000000000000000080';
    data += amounts.length.toString(16).padStart(64, '0');
    
    amounts.forEach(amount => {
      data += amount.toString(16).padStart(64, '0');
    });
    
    data += listingIds.length.toString(16).padStart(64, '0');
    listingIds.forEach(id => {
      data += id.toString(16).padStart(64, '0');
    });
    
    return data;
  };

  // Execute buy from deal using same logic as main page bulk buy
  const executeBuyFromDeal = async () => {
    if (!buyData || !isConnected || !abstractClient || !address) {
      setTradePopupType('error');
      setTradePopupMessage('Missing required data or wallet not connected.');
      setShowTradePopup(true);
      return;
    }

    setBuyingItem(true);
    try {
      // Use the listings data that was already fetched and stored in buyData
      if (!buyData.listings || buyData.listings.length === 0) {
        throw new Error('No listings available for this item');
      }

      // Prepare items for bulk buy using same logic as main executeBuy
      const validItems = [];
      let remainingAmount = buyData.amount;
      
      for (const listing of buyData.listings) {
        if (remainingAmount <= 0) break;
        const availableAmount = listing.available_amount || listing.amount;
        const takeAmount = Math.min(remainingAmount, availableAmount);
        
        validItems.push({
          listingId: parseInt(listing.listing_id.replace(/[^0-9]/g, '')),
          amount: takeAmount,
          ethCost: parseFloat(listing.price_per_item) * takeAmount
        });
        
        remainingAmount -= takeAmount;
      }

      if (validItems.length === 0) {
        throw new Error('No valid listings found for purchase');
      }

      const response = await fetch('/api/gigaverse/bulk-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          listings: validItems.map(item => ({
            listingId: item.listingId,
            amount: item.amount,
            ethCost: item.ethCost
          }))
        })
      });

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
        let feeValueInWei = BigInt(0);
        
        // Check if we need to include fee transfer
        if (txData.feeAmount && txData.feeAmount > 0 && txData.feeWallet) {
          const bulkBuyData = encodeBulkBuyTransaction(txData.listingIds, txData.amounts);
          const buyValueInWei = BigInt(Math.round(txData.totalEthCost * 1e18));
          feeValueInWei = BigInt(Math.round(txData.feeAmount * 1e18));
          
          const totalValueInWei = buyValueInWei + feeValueInWei;

          txHash = await abstractClient.sendTransaction({
            to: txData.contract,
            value: totalValueInWei,
            data: bulkBuyData
          });
        } else {
          // No fee - just bulk buy
          const bulkBuyData = encodeBulkBuyTransaction(txData.listingIds, txData.amounts);
          const buyValueInWei = BigInt(Math.round(txData.totalEthCost * 1e18));

          txHash = await abstractClient.sendTransaction({
            to: txData.contract,
            value: buyValueInWei,
            data: bulkBuyData
          });
        }
      } else {
        throw new Error('Backend execution not supported for deals');
      }

      setShowBuyPopup(false);
      setTradePopupType('success');
      setTradePopupMessage(`Successfully bought ${buyData.amount} ${buyData.itemName}! Transaction: ${txHash}`);
      setShowTradePopup(true);

    } catch (error) {
      console.error('❌ Error buying item:', error);
      setShowBuyPopup(false);
      setTradePopupType('error');
      setTradePopupMessage(`Buy failed: ${error.message}`);
      setShowTradePopup(true);
    } finally {
      setBuyingItem(false);
      setBuyData(null);
    }
  };

  const renderDealCard = (deal) => {
    const itemInfo = getItemInfoSafe(deal.inputId);
    
    // Calculate inventory info
    const itemsNeeded = deal.totalInputAmount || deal.inputAmount;
    const itemsOwned = playerInventory[deal.inputId] || 0;
    const itemsToBuy = Math.max(0, itemsNeeded - itemsOwned);
    // ONLY use real data from API - no fake/mock values
    const totalCost = deal.totalCostWithMultiplier || deal.totalCost || 0;
    const costPerStub = deal.costPerStubWithMultiplier || deal.costPerStub || 0;
    const buyPrice = deal.isTradeable ? (itemsToBuy * totalCost / itemsNeeded) : 0;
    
    return (
      <div key={deal.ID_CID} style={{
        background: 'linear-gradient(135deg, var(--muted), var(--bg))',
        padding: 'calc(var(--s) * 2)',
        borderRadius: 'var(--r)',
        border: '1px solid var(--border)',
        marginBottom: 'calc(var(--s) * 2)',
        width: '100%',
        maxWidth: '400px'
      }}>
        {/* Top row: Item info, arrow, stub info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'calc(var(--s) * 2)',
          width: '100%'
        }}>
          {/* Item section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s)' }}>
            <div style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'calc(var(--r) - 2px)',
              border: '1px solid var(--border)',
              fontSize: '1.2rem'
            }}>
              {itemInfo.icon && itemInfo.icon.startsWith('http') ? (
                <img src={itemInfo.icon} alt={itemInfo.name} style={{width: '40px', height: '40px', objectFit: 'contain'}} />
              ) : (
                <span>{itemInfo.icon || '📦'}</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--fg)' }}>
                {itemInfo.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted-fg)' }}>
                {itemsOwned} / {itemsNeeded}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div style={{ fontSize: '1.5rem', color: 'var(--muted-fg)' }}>➤</div>

          {/* Stub section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--fg)' }}>
                {deal.totalStubsReceived || deal.stubsReceived}
              </div>
            </div>
            <div style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'calc(var(--r) - 2px)',
              border: '1px solid var(--border)',
              fontSize: '1.2rem'
            }}>
              {stubIcon && stubIcon.icon && stubIcon.icon.startsWith('http') ? (
                <img src={stubIcon.icon} alt="Stub" style={{width: '40px', height: '40px', objectFit: 'contain'}} />
              ) : (
                <span>{stubIcon && stubIcon.icon ? stubIcon.icon : '🎲'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Price calculations */}
        {deal.isTradeable && (
          <div style={{ marginBottom: 'calc(var(--s) * 2)' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'calc(var(--s) * 0.5)',
              fontSize: '0.65rem',
              color: 'var(--muted-fg)'
            }}>
              <span>TOTAL COST:</span>
              <span style={{ color: 'var(--fg)' }}>
                {formatPrice(totalCost)} ETH
                {ethPrice > 0 ? <span style={{ color: 'var(--muted-fg)' }}> ({formatUsdPrice(totalCost)})</span> : <span style={{ color: 'var(--muted-fg)' }}> (USD N/A)</span>}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'calc(var(--s) * 0.5)',
              fontSize: '0.65rem',
              color: 'var(--muted-fg)'
            }}>
              <span>COST PER STUB:</span>
              <span style={{ color: 'var(--fg)' }}>
                {formatPrice(costPerStub)} ETH
                {ethPrice > 0 ? <span style={{ color: 'var(--muted-fg)' }}> ({formatUsdPrice(costPerStub)})</span> : <span style={{ color: 'var(--muted-fg)' }}> (USD N/A)</span>}
              </span>
            </div>
            {itemsToBuy > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.65rem',
                color: 'var(--muted-fg)'
              }}>
                <span>LEFT TO BUY {itemsToBuy}:</span>
                <span style={{ color: 'var(--fg)' }}>
                  {formatPrice(buyPrice)} ETH
                  {ethPrice > 0 ? <span style={{ color: 'var(--muted-fg)' }}> ({formatUsdPrice(buyPrice)})</span> : <span style={{ color: 'var(--muted-fg)' }}> (USD N/A)</span>}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--s)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s)' }}>
            <button 
              style={{
                padding: 'calc(var(--s) * 1) calc(var(--s) * 1.5)',
                backgroundColor: 'var(--muted)',
                color: 'var(--fg)',
                border: 'none',
                borderRadius: 'calc(var(--r) - 2px)',
                cursor: 'not-allowed',
                fontSize: '0.7rem',
                fontWeight: '600',
                opacity: 0.6
              }}
              disabled={true}
            >
              TRADE
            </button>
            <div style={{ fontSize: '0.6rem', color: 'var(--muted-fg)' }}>
              {deal.currentExecutions || 0} / {deal.maxCompletions || 1}
            </div>
          </div>
          {deal.isTradeable && (
            <button 
              style={{
                padding: 'calc(var(--s) * 1) calc(var(--s) * 1.5)',
                backgroundColor: itemsToBuy === 0 ? 'var(--muted)' : 'var(--success)',
                color: itemsToBuy === 0 ? 'var(--muted-fg)' : 'white',
                border: 'none',
                borderRadius: 'calc(var(--r) - 2px)',
                cursor: itemsToBuy === 0 ? 'not-allowed' : 'pointer',
                fontSize: '0.7rem',
                fontWeight: '600'
              }}
              disabled={itemsToBuy === 0}
              onClick={() => handleBuyClick(deal, itemInfo, itemsToBuy)}
            >
              BUY
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTotalsCard = (totals, title) => (
    <div style={{
      background: 'linear-gradient(135deg, var(--card), var(--muted))',
      padding: 'calc(var(--s) * 2)',
      borderRadius: 'var(--r)',
      border: '1px solid var(--border)',
      marginBottom: 'calc(var(--s) * 2)',
      width: '100%',
      maxWidth: '400px'
    }}>
      <h3 style={{
        margin: '0 0 calc(var(--s) * 1.5) 0',
        fontSize: '0.9rem',
        color: 'var(--fg)',
        textAlign: 'center'
      }}>{title}</h3>
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'calc(var(--s) * 0.5)',
          fontSize: '0.65rem',
          color: 'var(--muted-fg)'
        }}>
          <span>Total Cost:</span>
          <span style={{ color: 'var(--fg)' }}>
            {formatPrice(totals.totalCost)} ETH
            {ethPrice > 0 && <span style={{ color: 'var(--muted-fg)' }}> ({formatUsdPrice(totals.totalCost)})</span>}
          </span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'calc(var(--s) * 0.5)',
          fontSize: '0.65rem',
          color: 'var(--muted-fg)'
        }}>
          <span>Total Stubs:</span>
          <span style={{ color: 'var(--fg)' }}>{totals.totalStubs}</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.65rem',
          color: 'var(--muted-fg)'
        }}>
          <span>Avg Cost per Stub:</span>
          <span style={{ color: 'var(--fg)' }}>
            {formatPrice(totals.avgCostPerStub)} ETH
            {ethPrice > 0 && <span style={{ color: 'var(--muted-fg)' }}> ({formatUsdPrice(totals.avgCostPerStub)})</span>}
          </span>
        </div>
      </div>
    </div>
  );

  // Load data on mount
  useEffect(() => {
    const loadAuthToken = async () => {
      const token = await getGigaverseAuthToken();
      
      fetchStubIcon();
      fetchDealsData();
      fetchEthPrice();
      
      if (walletAddress) {
        fetchNoobId();
      }
    };
    
    loadAuthToken();
  }, [walletAddress]);

  // Fetch player inventory when auth token is available
  useEffect(() => {
    if (authToken) {
      fetchPlayerInventory();
    }
  }, [authToken]);

  // Calculate totals for each deal type with multipliers - ONLY include tradeable deals
  const calculateTotals = (deals) => {
    const tradeableDeals = deals.filter(deal => deal.isTradeable !== false);
    const totalCost = tradeableDeals.reduce((sum, deal) => sum + (deal.totalCostWithMultiplier || 0), 0);
    const totalStubs = tradeableDeals.reduce((sum, deal) => sum + (deal.totalStubsReceived || 0), 0);
    const avgCostPerStub = totalStubs > 0 ? totalCost / totalStubs : 0;
    
    return { totalCost, totalStubs, avgCostPerStub };
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

  // Format USD price display
  const formatUsdPrice = (ethAmount) => {
    if (ethPrice === 0) return 'N/A';
    const usdValue = ethAmount * ethPrice;
    if (usdValue < 0.01) return '$0.00';
    if (usdValue < 1) return `$${usdValue.toFixed(3)}`;
    return `$${usdValue.toFixed(2)}`;
  };

  return (
    <>
      {/* Gigaverse Auth Popup */}
      {showAuthPopup && (
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
            maxWidth: '400px'
          }}>
            {/* Security Features */}
            <div style={{ 
              marginBottom: 'calc(var(--s) * 2)', 
              padding: 'calc(var(--s) * 2)',
              backgroundColor: 'var(--muted)',
              borderRadius: 'calc(var(--r) - 2px)',
              fontSize: '0.7rem',
              lineHeight: '1.4'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 'var(--s)', color: 'var(--success)' }}>
                Security Features:
              </div>
            
              <div>🔒 Encrypted HTTP-Only Cookies</div>
              <div>🛡️ CSRF Protection</div>
              <div>🌐 HTTPS Required</div>
              
              <div style={{ 
                marginTop: 'calc(var(--s) * 1.5)', 
                padding: 'var(--s)',
                backgroundColor: 'var(--bg)',
                borderRadius: '3px',
                fontSize: '0.65rem',
                color: 'var(--muted-fg)',
                fontStyle: 'italic'
              }}>
                🗑️ Token stored in encrypted HTTP-only cookie, deleted when browser closes
              </div>
            </div>
            
            <p style={{ 
              marginBottom: 'calc(var(--s) * 3)', 
              color: 'var(--muted-fg)', 
              fontSize: '0.75rem',
              textAlign: 'center'
            }}>
             
            </p>
            <div style={{ display: 'flex', gap: 'var(--s)', justifyContent: 'center' }}>
              <button
                onClick={authenticateWithGigaverse}
                style={{
                  padding: 'calc(var(--s) * 1.5) calc(var(--s) * 2)',
                  backgroundColor: 'var(--success)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'calc(var(--r) - 2px)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: '700'
                }}
              >
                🔒 Login to Gigaverse
              </button>
              <button
                onClick={() => setShowAuthPopup(false)}
                style={{
                  padding: 'calc(var(--s) * 1.5) calc(var(--s) * 2)',
                  backgroundColor: 'var(--muted)',
                  color: 'var(--fg)',
                  border: 'none',
                  borderRadius: 'calc(var(--r) - 2px)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: '700'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            background: 'var(--card)',
            padding: 'calc(var(--s) * 4)',
            borderRadius: 'var(--r)',
            border: `2px solid ${tradePopupType === 'success' ? 'var(--success)' : 'var(--destructive)'}`,
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
              fontSize: '0.9rem',
              lineHeight: '1.4'
            }}>
              {tradePopupMessage}
            </p>
            <button
              onClick={() => setShowTradePopup(false)}
              style={{
                padding: 'calc(var(--s) * 1.5) calc(var(--s) * 3)',
                backgroundColor: tradePopupType === 'success' ? 'var(--success)' : 'var(--destructive)',
                color: 'white',
                border: 'none',
                borderRadius: 'calc(var(--r) - 2px)',
                cursor: 'pointer',
                fontSize: '0.8rem',
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
          zIndex: 1001
        }}>
          <div style={{
            background: 'var(--card)',
            padding: 'calc(var(--s) * 3)',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border)',
            maxWidth: '500px',
            width: '90%'
          }}>
            <h3 style={{
              margin: '0 0 calc(var(--s) * 2) 0',
              fontSize: '1rem',
              color: 'var(--fg)',
              textAlign: 'center'
            }}>
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

            {/* Buy info card - EXACT same styling as original buy section */}
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
                  <span>{formatPrice(buyData.totalCost)} ETH</span>
                </div>

                {ethPrice > 0 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 'calc(var(--s) * 0.5)',
                    color: 'var(--muted-fg)',
                    width: '100%'
                  }}>
                    <span>USD Value:</span>
                    <span>{formatUsdPrice(buyData.totalCost)}</span>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--muted-fg)',
                  paddingTop: 'calc(var(--s) * 1)',
                  borderTop: '1px solid var(--border)',
                  fontSize: '0.6rem',
                  width: '100%'
                }}>
                  <span>* 1% fee will be added</span>
                  <span>Gas fees apply</span>
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

      <div style={{
        display: 'flex',
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
          <h2 style={{
            margin: '0 0 calc(var(--s) * 2) 0',
            fontSize: '1.1rem',
            color: 'var(--fg)',
            textAlign: 'center'
          }}>Weekly</h2>
          
          {renderTotalsCard(weeklyTotals, 'Weekly Summary')}
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(var(--s) * 2)',
            alignItems: 'center',
            width: '100%',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 300px)'
          }}>
            {loading ? (
              <div>Loading deals...</div>
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
          <h2 style={{
            margin: '0 0 calc(var(--s) * 2) 0',
            fontSize: '1.1rem',
            color: 'var(--fg)',
            textAlign: 'center'
          }}>Daily</h2>
          
          {renderTotalsCard(dailyTotals, 'Daily Summary')}
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(var(--s) * 2)',
            alignItems: 'center',
            width: '100%',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 300px)'
          }}>
            {loading ? (
              <div>Loading deals...</div>
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
    </>
  );
};

export default TravelingMerchant;