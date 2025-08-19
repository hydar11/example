import React, { useState, useEffect } from 'react';

const TradesDropdown = ({ 
  isOpen, 
  onClose, 
  getItemInfo, 
  allRecentTrades = [], 
  availableListings = [],
  ethToUsdRate = 3500
}) => {
  const usernameCacheRef = React.useRef({});
  const [filteredData, setFilteredData] = useState([]);

  // Fetch username function - EXACT copy from App.js
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
      // Cache null result to avoid repeated failed requests
      usernameCacheRef.current[lowerAddress] = null;
      return null;
    }
  };
  const [filters, setFilters] = useState({
    item: 'all',
    type: 'all',
    limit: 25
  });

  // Combine trades and listings data using REAL data structure with username fetching
  useEffect(() => {
    const processData = async () => {
      const combinedData = [];



      // Add trades (bought type) - using real structure from updateLastTradesForItem
      // BUT fetch usernames if not already available (like recent trades does)
      const tradesWithUsernames = await Promise.all(
        allRecentTrades.map(async (trade) => {
          let buyerName = trade.buyerName;
          let sellerName = trade.sellerName;

          // If no username, fetch it (like recent trades does)
          if (!buyerName && trade.buyer) {
            buyerName = await fetchUsername(trade.buyer);
          }
          if (!sellerName && trade.seller) {
            sellerName = await fetchUsername(trade.seller);
          }

          return {
            type: 'bought',
            itemId: trade.itemId,
            itemName: trade.itemName || getItemInfo(trade.itemId)?.name || 'Unknown',
            itemIcon: trade.itemIcon || getItemInfo(trade.itemId)?.icon,
            amount: trade.amount || 1,
            price: (trade.ethSpent || trade.priceEth || 0) / (trade.amount || 1), // Price per unit
            total: trade.ethSpent || trade.priceEth || 0,
            buyer: buyerName || trade.buyer || '-',
            seller: sellerName || trade.seller || '-',
            tx: trade.tx || '-',
            date: trade.timestamp || trade.createdAt || Date.now(),
            timestamp: new Date(trade.timestamp || trade.createdAt || Date.now()).getTime()
          };
        })
      );

      combinedData.push(...tradesWithUsernames);

      // Add listings (listing type) - fetch seller usernames
      const listingsWithUsernames = await Promise.all(
        availableListings.map(async (listing) => {
          const itemId = listing.item_id || listing.itemId;
          const amount = listing.available_amount || listing.amount || 1;
          const price = parseFloat(listing.price_per_item || listing.pricePerItem || 0);
          const sellerAddress = listing.owner;
          
          let sellerName = sellerAddress;
          if (sellerAddress) {
            const username = await fetchUsername(sellerAddress);
            sellerName = username || sellerAddress;
          }
          
          const result = {
            type: 'listing',
            itemId: itemId,
            itemName: getItemInfo(itemId)?.name || 'Unknown',
            itemIcon: getItemInfo(itemId)?.icon,
            amount: amount,
            price: price,
            total: price * amount,
            buyer: '-',
            seller: sellerName || '-',
            tx: listing.tx || listing.listing_id || '-',
            date: listing.timestamp || listing.created_at || Date.now(),
            timestamp: new Date(listing.timestamp || listing.created_at || Date.now()).getTime()
          };

          
          return result;
        })
      );

      combinedData.push(...listingsWithUsernames);

      // Sort by timestamp (newest first)
      combinedData.sort((a, b) => b.timestamp - a.timestamp);

      // Apply filters
      let filtered = combinedData;

      // Filter by item
      if (filters.item !== 'all') {
        filtered = filtered.filter(item => String(item.itemId) === String(filters.item));
      }

      // Filter by type
      if (filters.type !== 'all') {
        filtered = filtered.filter(item => item.type === filters.type);
      }

      // Apply limit
      filtered = filtered.slice(0, filters.limit);


      setFilteredData(filtered);
    };

    if (isOpen) {
      processData();
    }
  }, [allRecentTrades, availableListings, filters, getItemInfo, isOpen]);

  // Get unique items for filter dropdown using real data structure
  const getUniqueItems = () => {
    const items = new Set();
    
    // Add items from trades
    allRecentTrades.forEach(trade => {
      if (trade.itemId) items.add(trade.itemId);
    });
    
    // Add items from listings
    availableListings.forEach(listing => {
      const itemId = listing.item_id || listing.itemId;
      if (itemId) items.add(itemId);
    });
    
    return Array.from(items);
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '0.0000';
    if (price >= 1) return parseFloat(price).toFixed(4);
    if (price >= 0.1) return parseFloat(price).toFixed(6);
    return parseFloat(price).toFixed(8).replace(/\.?0+$/, '');
  };

  const formatUsd = (ethPrice) => {
    const usdValue = ethPrice * ethToUsdRate;
    return `$${usdValue.toFixed(2)}`;
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC'
    }) + ' UTC';
  };

  const truncateAddress = (address) => {
    if (!address || address === '-') return '-';
    if (address.length > 10) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    return address;
  };

  const truncateTx = (tx) => {
    if (!tx || tx === '-') return '-';
    if (tx.length > 10) {
      return `${tx.slice(0, 8)}...`;
    }
    return tx;
  };

  if (!isOpen) return null;

  return (
    <div className="trades-dropdown-overlay" onClick={onClose}>
      <div className="trades-dropdown-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="trades-dropdown-header">
          <h3>Latest Trades & Listings</h3>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {/* Filters */}
        <div className="trades-dropdown-filters">
          {/* Item Filter */}
          <div className="filter-group">
            <label>Item:</label>
            <select
              value={filters.item} 
              onChange={(e) => setFilters({...filters, item: e.target.value})}
            >
              <option value="all">All Items</option>
              {getUniqueItems().map(itemId => {
                const itemInfo = getItemInfo(itemId);
                return (
                  <option key={itemId} value={itemId}>
                    {itemInfo?.name || `Item ${itemId}`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Type Filter */}
          <div className="filter-group">
            <label>Type:</label>
            <select
              value={filters.type} 
              onChange={(e) => setFilters({...filters, type: e.target.value})}
            >
              <option value="all">All Types</option>
              <option value="bought">Bought</option>
              <option value="listing">Listing</option>
            </select>
          </div>

          {/* Limit Filter */}
          <div className="filter-group">
            <label>Show:</label>
            <select
              value={filters.limit} 
              onChange={(e) => setFilters({...filters, limit: parseInt(e.target.value)})}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="trades-dropdown-table-container">
          <table className="trades-dropdown-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Item</th>
                <th>Amount</th>
                <th>Price</th>
                <th>Total</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th>Tx</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{textAlign: 'center', padding: '20px', color: 'var(--muted-fg)'}}>
                    No data available
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => (
                  <tr key={`${item.type}-${item.itemId}-${index}`}>
                    <td>
                      <span className={`type-badge ${item.type}`}>
                        {item.type}
                      </span>
                    </td>
                    <td>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        overflow: 'hidden',
                        width: '100%'
                      }}>
                        <div 
                          className="chart-item-icon"
                          style={{
                            width: '24px',
                            height: '24px',
                            flexShrink: 0,
                            backgroundImage: item.itemIcon && item.itemIcon.startsWith('http') ? `url('${item.itemIcon}')` : 'none',
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                            borderRadius: '3px',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px'
                          }}
                        >
                          {(!item.itemIcon || !item.itemIcon.startsWith('http')) && '📦'}
                        </div>
                        <span style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0
                        }}>
                          {item.itemName}
                        </span>
                      </div>
                    </td>
                    <td>{item.amount}</td>
                    <td>
                      {formatPrice(item.price)}<br/>
                      <span className="sub-value">{formatUsd(item.price)}</span>
                    </td>
                    <td>
                      {formatPrice(item.total)}<br/>
                      <span className="sub-value">{formatUsd(item.total)}</span>
                    </td>
                    <td className="address-cell">{truncateAddress(item.buyer)}</td>
                    <td className="address-cell">{truncateAddress(item.seller)}</td>
                    <td className="tx-cell">
                      {item.type === 'bought' && item.tx && item.tx !== '-' ? (
                        <a href={`https://abscan.org/tx/${item.tx}`} target="_blank" rel="noopener noreferrer" title={item.tx}>
                          {truncateTx(item.tx)}
                        </a>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>{formatDate(item.date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TradesDropdown;