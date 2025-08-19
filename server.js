const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001; // Changed to 3001 to avoid React dev server conflict

// GraphQL endpoint for the subgraph
const SUBGRAPH_URL = process.env.SUBGRAPH_URL;

// 🔒 SECURITY MIDDLEWARE
// Comprehensive security headers using Helmet
app.use(helmet({
  // Content Security Policy - Prevent XSS attacks
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // Required for React development
        "'unsafe-eval'",   // Required for React development
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://challenges.cloudflare.com" //privy doc
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // Required for styled-components
        "https://fonts.googleapis.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:", 
        "https://gigaverse.io"
      ],
      connectSrc: [
        "'self'",
       
        //"https://localhost:*",
        "https://gigaverse.io",
        "https://abstract.alt.technology",
        "https://api.mainnet.abs.xyz",

        "https://auth.privy.io",
        "https://api.privy.io",
        "https://api.binance.com",
        "https://api.coingecko.com",
        "https://api.giga-companion.online",
        //"wss://*",
        //"ws://localhost:*",
        //privy doc
        "https://auth.privy.io",
        "wss://relay.walletconnect.com",
        "wss://relay.walletconnect.org",
        "wss://www.walletlink.org",
        "https://*.rpc.privy.systems",
        "https://explorer-api.walletconnect.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      childSrc: [ //privy doc
        "https://auth.privy.io",
        "https://verify.walletconnect.com",
        "https://verify.walletconnect.org",
      ],

      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: [
        "https://auth.privy.io",
        "https://verify.walletconnect.com",
        "https://verify.walletconnect.org",
        "https://challenges.cloudflare.com",
        ],
        baseUri: ["'self'"],
        formAction: ["'self'"


        ],
       // frameAncestors: ["'self'", "https://*.abs.xyz", "https://*.privy.io", "https://giga-comp-1.onrender.com"],
      frameAncestors: ["'none'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"]
    },
  },
  // Strict Transport Security - Force HTTPS
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  // Prevent clickjacking - Allow same-origin for AGW
  frameguard: { action: 'sameorigin' },
  // Cross-Origin-Opener-Policy for wallet popups
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  // Prevent MIME sniffing
  noSniff: true,
  // XSS Protection
  xssFilter: true,
  // Don't leak referrer information
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// 🍪 Secure Cookie Parser
app.use(cookieParser(process.env.COOKIE_SECRET || 'gigaverse-secure-secret-2024'));

// 🔒 CSRF Token Storage (in production, use Redis or database)
const csrfTokens = new Map();
const tokenExpiry = new Map();

// 🔒 Generate CSRF Token
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 🔒 CSRF Protection Middleware
const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests and auth endpoints
  if (req.method === 'GET' || req.path === '/api/auth/csrf-token') {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body.csrfToken;
  const sessionId = req.signedCookies.gigaverse_session;

  if (!token || !sessionId) {
    return res.status(403).json({ 
      error: 'CSRF token required',
      code: 'CSRF_TOKEN_MISSING' 
    });
  }

  const validToken = csrfTokens.get(sessionId);
  const expiry = tokenExpiry.get(sessionId);

  if (!validToken || validToken !== token || Date.now() > expiry) {
    return res.status(403).json({ 
      error: 'Invalid CSRF token',
      code: 'CSRF_TOKEN_INVALID' 
    });
  }

  next();
};

// Additional security headers
app.use((req, res, next) => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Security headers for API responses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Custom security header for transaction validation
  res.setHeader('X-Transaction-Validation', 'enabled');
  
  next();
});

// CORS with security restrictions
app.use(cors({
  origin: [
    'http://localhost:3000',  // React development server
    'https://localhost:3000', // HTTPS development
    // Add your production domain here when deploying
    // 'https://yourdomain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
}));

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit payload size

// 🔒 ETH PRICE PROXY - CoinMarketCap -> Binance -> CoinGecko fallback chain
let ethPriceCache = { price: null, timestamp: 0, ttl: 5 * 60 * 1000 }; // 5 minute cache

app.get('/api/eth-price', async (req, res) => {
    try {
        // Check cache first
        const now = Date.now();
        if (ethPriceCache.price && (now - ethPriceCache.timestamp) < ethPriceCache.ttl) {
            console.log('📈 ETH price from cache:', ethPriceCache.price);
            return res.json({
                success: true,
                data: { ethereum: { usd: ethPriceCache.price } },
                source: 'cache'
            });
        }

        let price = null;
        let source = 'unknown';

        // Try CoinMarketCap first
        try {
            console.log('🔄 Trying CoinMarketCap API...');
            const cmcResponse = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=1027', {
                headers: { 
                    'User-Agent': 'Gigaverse-Trading-App/1.0',
                    'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY || 'demo'
                },
                timeout: 10000
            });
            
            if (cmcResponse.ok) {
                const cmcData = await cmcResponse.json();
                if (cmcData.data?.['1027']?.quote?.USD?.price) {
                    price = cmcData.data['1027'].quote.USD.price;
                    source = 'coinmarketcap';
                    console.log('📈 ETH price from CoinMarketCap:', price);
                }
            } else {
                console.log('⚠️ CoinMarketCap failed:', cmcResponse.status, cmcResponse.statusText);
            }
        } catch (cmcError) {
            console.log('⚠️ CoinMarketCap error:', cmcError.message);
        }

        // Try Binance as fallback (server-side, no CORS issues)
        if (!price) {
            try {
                console.log('🔄 Trying Binance API...');
                const binanceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', {
                    headers: { 'User-Agent': 'Gigaverse-Trading-App/1.0' },
                    timeout: 10000
                });
                
                if (binanceResponse.ok) {
                    const binanceData = await binanceResponse.json();
                    if (binanceData.price) {
                        price = parseFloat(binanceData.price);
                        source = 'binance';
                        console.log('📈 ETH price from Binance:', price);
                    }
                } else {
                    console.log('⚠️ Binance failed:', binanceResponse.status);
                }
            } catch (binanceError) {
                console.log('⚠️ Binance error:', binanceError.message);
            }
        }

        // Try CoinGecko as final fallback
        if (!price) {
            try {
                console.log('🔄 Trying CoinGecko API...');
                const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
                    headers: { 'User-Agent': 'Gigaverse-Trading-App/1.0' },
                    timeout: 10000
                });
                
                if (cgResponse.ok) {
                    const cgData = await cgResponse.json();
                    if (cgData.ethereum?.usd) {
                        price = cgData.ethereum.usd;
                        source = 'coingecko';
                        console.log('📈 ETH price from CoinGecko:', price);
                    }
                } else {
                    console.log('⚠️ CoinGecko failed:', cgResponse.status, cgResponse.statusText);
                }
            } catch (cgError) {
                console.log('⚠️ CoinGecko error:', cgError.message);
            }
        }

        if (price) {
            // Update cache
            ethPriceCache = { price, timestamp: now, ttl: ethPriceCache.ttl };
            
            res.json({
                success: true,
                data: { ethereum: { usd: price } },
                source: source
            });
        } else {
            console.error('❌ All ETH price APIs failed');
            res.status(503).json({
                success: false,
                error: 'All price APIs failed',
                message: 'ETH price unavailable - all services down'
            });
        }
        
    } catch (error) {
        console.error('❌ ETH price endpoint error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'ETH price unavailable - server error'
        });
    }
});

// 🔒 SECURE AUTHENTICATION ENDPOINTS

// Generate CSRF token and session
app.post('/api/auth/csrf-token', (req, res) => {
    try {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const csrfToken = generateCSRFToken();
        
        // Store CSRF token with 1 hour expiry
        csrfTokens.set(sessionId, csrfToken);
        tokenExpiry.set(sessionId, Date.now() + (60 * 60 * 1000));
        
        // Set secure HTTP-only session cookie (SESSION ONLY - no persistence)
        res.cookie('gigaverse_session', sessionId, {
            httpOnly: true,
            secure: false, // Allow HTTP for localhost
            sameSite: 'strict',
            // NO maxAge = session cookie (clears when browser closes)
            signed: true
        });
        
        res.json({
            success: true,
            csrfToken: csrfToken,
            message: 'CSRF token generated'
        });
        
    } catch (error) {
        console.error('🔒 CSRF token generation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate CSRF token'
        });
    }
});

// Store authentication token securely in HTTP-only cookie
app.post('/api/auth/store-token', csrfProtection, (req, res) => {
    try {
        const { jwt, address, expiresAt } = req.body;
        
        if (!jwt || !address) {
            return res.status(400).json({
                success: false,
                error: 'JWT and address are required'
            });
        }
        
        // Encrypt JWT before storing in cookie
        const key = crypto.scryptSync(process.env.JWT_ENCRYPTION_KEY || 'gigaverse-jwt-key-2024', 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encryptedJWT = cipher.update(jwt, 'utf8', 'hex');
        encryptedJWT += cipher.final('hex');
        encryptedJWT = iv.toString('hex') + ':' + encryptedJWT;
        
        // Store encrypted JWT in HTTP-only session cookie (NO PERSISTENCE)
        res.cookie('gigaverse_auth_token', encryptedJWT, {
            httpOnly: true,
            secure: false, // Allow HTTP for localhost
            sameSite: 'strict',
            // NO maxAge = session cookie (clears when browser closes)
            signed: true
        });
        
        // Store address in session cookie (NO PERSISTENCE)
        res.cookie('gigaverse_address', address, {
            secure: false, // Allow HTTP for localhost
            sameSite: 'strict',
            // NO maxAge = session cookie (clears when browser closes)
            signed: true
        });
        
        res.json({
            success: true,
            message: 'Token stored securely'
        });
        
    } catch (error) {
        console.error('🔒 Token storage failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to store authentication token',
            details: error.message
        });
    }
});

// Retrieve authentication token from HTTP-only cookie
app.get('/api/auth/get-token', (req, res) => {
    try {
        const encryptedJWT = req.signedCookies.gigaverse_auth_token;
        const address = req.signedCookies.gigaverse_address;
        
        if (!encryptedJWT) {
            return res.status(401).json({
                success: false,
                error: 'No authentication token found'
            });
        }
        
        // Decrypt JWT
        const key = crypto.scryptSync(process.env.JWT_ENCRYPTION_KEY || 'gigaverse-jwt-key-2024', 'salt', 32);
        const parts = encryptedJWT.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decryptedJWT = decipher.update(encrypted, 'hex', 'utf8');
        decryptedJWT += decipher.final('utf8');
        
        res.json({
            success: true,
            jwt: decryptedJWT,
            address: address,
            message: 'Token retrieved successfully'
        });
        
    } catch (error) {
        console.error('🔒 Token retrieval failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve authentication token'
        });
    }
});

// Clear ALL authentication cookies and session (for tab close/reopen)
app.post('/api/auth/clear-token', (req, res) => {
    try {
        // Clear ALL authentication cookies AND session cookies
        res.clearCookie('gigaverse_auth_token');
        res.clearCookie('gigaverse_address');
        res.clearCookie('gigaverse_session');
        
        // Clean up CSRF tokens from memory
        const sessionId = req.signedCookies.gigaverse_session;
        if (sessionId) {
            csrfTokens.delete(sessionId);
            tokenExpiry.delete(sessionId);
        }
        
        res.json({
            success: true,
            message: 'All auth cookies and session cleared'
        });
        
    } catch (error) {
        console.error('❌ Error clearing auth:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear auth'
        });
    }
});

// Secure logout - clear all authentication cookies
app.post('/api/auth/logout', (req, res) => {
    try {
        // Clear all authentication cookies
        res.clearCookie('gigaverse_auth_token');
        res.clearCookie('gigaverse_address');
        res.clearCookie('gigaverse_session');
        
        // Clean up CSRF tokens
        const sessionId = req.signedCookies.gigaverse_session;
        if (sessionId) {
            csrfTokens.delete(sessionId);
            tokenExpiry.delete(sessionId);
        }
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        console.error('🔒 Logout failed:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

// Token validation middleware for protected routes
const requireAuth = async (req, res, next) => {
    try {
        const encryptedJWT = req.signedCookies.gigaverse_auth_token;
        
        if (!encryptedJWT) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'NO_AUTH_TOKEN'
            });
        }
        
        // Decrypt JWT
        const key = crypto.scryptSync(process.env.JWT_ENCRYPTION_KEY || 'gigaverse-jwt-key-2024', 'salt', 32);
        const parts = encryptedJWT.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decryptedJWT = decipher.update(encrypted, 'hex', 'utf8');
        decryptedJWT += decipher.final('utf8');
        
        // TODO: Add JWT validation logic here
        // For now, just check if JWT exists and is non-empty
        if (!decryptedJWT || decryptedJWT.length < 10) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication token',
                code: 'INVALID_AUTH_TOKEN'
            });
        }
        
        // Add decrypted JWT to request for use in protected routes
        req.jwt = decryptedJWT;
        req.userAddress = req.signedCookies.gigaverse_address;
        
        next();
        
    } catch (error) {
        console.error('🔒 Auth validation failed:', error);
        res.status(401).json({
            success: false,
            error: 'Authentication validation failed',
            code: 'AUTH_VALIDATION_ERROR'
        });
    }
};

// Serve static files only in development
if (process.env.NODE_ENV !== 'production') {
    const publicPath = path.join(__dirname, 'public');
    app.use(express.static(publicPath));
}

// Helper: GraphQL query function
async function querySubgraph(query, variables = {}) {
    if (!SUBGRAPH_URL) {
        console.log('❌ SUBGRAPH_URL is not defined');
        return null;
    }
    
    try {
        console.log('🔍 Querying subgraph:', SUBGRAPH_URL);
        const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.errors) {
            console.error('GraphQL errors:', data.errors);
            throw new Error('GraphQL query failed');
        }
        
        return data.data;
    } catch (error) {
        console.error('Subgraph query error:', error);
        console.log('❌ Subgraph unavailable. NO MOCK DATA - returning empty results.');
        
        // Return empty data - NO FAKE DATA EVER
        if (query.includes('items(')) {
            return { items: [] };
        }
        
        if (query.includes('listings(')) {
            return { listings: [] };
        }
        
        // For other queries, return empty data
        return {};
    }
}

// Helper: Convert BigDecimal string to number
function toNumber(bigDecimalStr) {
    return parseFloat(bigDecimalStr || '0');
}

// Helper: Get current timestamp
function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
}

// === API ROUTES ===

// === CHART DATA ===
app.get('/api/chart-data/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { timeframe = '1d' } = req.query;
    
    try {
        
        // Query all transfers for this item with pagination
        let allTransfers = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const query = `
                query GetTransfers($itemId: ID!, $skip: Int!, $limit: Int!) {
                    transfers(
                        where: { item: $itemId, isPurchase: true }
                        orderBy: timestamp
                        orderDirection: asc
                        skip: $skip
                        first: $limit
                    ) {
                        id
                        timestamp
                        pricePerItemETH
                        amount
                        totalValueETH
                    }
                }
            `;
            
            const data = await querySubgraph(query, { itemId, skip, limit });
            const transfers = data.transfers || [];
            
            allTransfers = allTransfers.concat(transfers);
            hasMore = transfers.length === limit;
            skip += limit;
        }
        
        
        if (allTransfers.length === 0) {
            return res.json([]);
        }
        
        // Convert to chart data format
        const chartData = allTransfers.map(transfer => ({
            itemId: itemId,
            timestamp: new Date(parseInt(transfer.timestamp) * 1000).toISOString(),
            price: toNumber(transfer.pricePerItemETH),
            volume: parseInt(transfer.amount),
            ethVolume: toNumber(transfer.totalValueETH)
        }));
        
        res.json(chartData);
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

// === MARKET STATS ===
app.get('/api/stats', async (req, res) => {
    try {
        
        // Get all items with pagination
        let allItems = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const query = `
                query GetItems($skip: Int!, $limit: Int!) {
                    items(
                        orderBy: totalVolumeETH
                        orderDirection: desc
                        skip: $skip
                        first: $limit
                    ) {
                        id
                        totalVolumeETH
                        totalTrades
                        totalItemsSold
                        currentPriceETH
                        lastTradeTimestamp
                    }
                }
            `;
            
            const data = await querySubgraph(query, { skip, limit });
            const items = data.items || [];
            
            allItems = allItems.concat(items);
            hasMore = items.length === limit;
            skip += limit;
        }
        
        // Get 24h and 48h market volumes for comparison
        const oneDayAgo = getCurrentTimestamp() - 86400;
        const twoDaysAgo = getCurrentTimestamp() - 172800;
        
        // Get market-wide volume data with pagination
        let volume24hTransfers = [];
        let volume48hTransfers = [];
        let volumeSkip = 0;
        let volumeHasMore = true;
        const volumeLimit = 1000;
        
        // Fetch 24h volume data
        while (volumeHasMore) {
            const volume24hQuery = `
                query GetMarketVolume24h($oneDayAgo: BigInt!, $skip: Int!, $limit: Int!) {
                    transfers(
                        where: { 
                            isPurchase: true,
                            timestamp_gte: $oneDayAgo
                        }
                        skip: $skip
                        first: $limit
                    ) {
                        totalValueETH
                    }
                }
            `;
            
            const data24h = await querySubgraph(volume24hQuery, { 
                oneDayAgo: oneDayAgo.toString(),
                skip: volumeSkip,
                limit: volumeLimit
            });
            
            const transfers = data24h.transfers || [];
            volume24hTransfers = volume24hTransfers.concat(transfers);
            volumeHasMore = transfers.length === volumeLimit;
            volumeSkip += volumeLimit;
        }
        
        // Reset for 48h data
        volumeSkip = 0;
        volumeHasMore = true;
        
        // Fetch 48h (previous day) volume data  
        while (volumeHasMore) {
            const volume48hQuery = `
                query GetMarketVolume48h($twoDaysAgo: BigInt!, $oneDayAgo: BigInt!, $skip: Int!, $limit: Int!) {
                    transfers(
                        where: { 
                            isPurchase: true,
                            timestamp_gte: $twoDaysAgo,
                            timestamp_lt: $oneDayAgo
                        }
                        skip: $skip
                        first: $limit
                    ) {
                        totalValueETH
                    }
                }
            `;
            
            const data48h = await querySubgraph(volume48hQuery, { 
                twoDaysAgo: twoDaysAgo.toString(),
                oneDayAgo: oneDayAgo.toString(),
                skip: volumeSkip,
                limit: volumeLimit
            });
            
            const transfers = data48h.transfers || [];
            volume48hTransfers = volume48hTransfers.concat(transfers);
            volumeHasMore = transfers.length === volumeLimit;
            volumeSkip += volumeLimit;
        }
        
        const volume24h = volume24hTransfers.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
        const volume48h = volume48hTransfers.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
        
        // Calculate market volume change (24h vs previous 24h)
        const marketVolumeChange = volume48h > 0 ? ((volume24h - volume48h) / volume48h) * 100 : 0;
        
        
        // Get 24h stats for each item in parallel batches
        const batchSize = 10;
        const statsPromises = [];
        
        for (let i = 0; i < allItems.length; i += batchSize) {
            const batch = allItems.slice(i, i + batchSize);
            const batchPromise = Promise.all(batch.map(async (item) => {
                try {
                    // Calculate UTC day start for TODAY (not rolling 24h)  
                    const now = new Date();
                    const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
                    const oneDayAgo = Math.floor(todayUTCStart.getTime() / 1000);
                    
                    // Get ALL 24h transfers with pagination
                    let allTransfers24h = [];
                    let skip = 0;
                    const limit = 1000;
                    let hasMore = true;
                    
                    while (hasMore) {
                        const transfersQuery = `
                            query Get24hTransfers($itemId: ID!, $timestamp: BigInt!, $skip: Int!, $limit: Int!) {
                                transfers(
                                    where: { 
                                        item: $itemId, 
                                        isPurchase: true,
                                        timestamp_gte: $timestamp
                                    }
                                    orderBy: timestamp
                                    orderDirection: asc
                                    skip: $skip
                                    first: $limit
                                ) {
                                    pricePerItemETH
                                    totalValueETH
                                    amount
                                    timestamp
                                }
                            }
                        `;
                        
                        const transfersData = await querySubgraph(transfersQuery, { 
                            itemId: item.id, 
                            timestamp: oneDayAgo.toString(),
                            skip,
                            limit 
                        });
                        
                        const transfers = transfersData.transfers || [];
                        allTransfers24h = allTransfers24h.concat(transfers);
                        hasMore = transfers.length === limit;
                        skip += limit;
                    }
                    
                    const transfers24h = allTransfers24h;
                    
                    // Calculate 24h stats
                    const volume24h = transfers24h.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
                    const itemsSold24h = transfers24h.reduce((sum, t) => sum + parseInt(t.amount), 0);
                    
                    // Calculate price change (first vs last price in 24h)
                    let priceChange24h = 0;
                    if (transfers24h.length > 1) {
                        const firstPrice = toNumber(transfers24h[0].pricePerItemETH);
                        const lastPrice = toNumber(transfers24h[transfers24h.length - 1].pricePerItemETH);
                        if (firstPrice > 0) {
                            priceChange24h = ((lastPrice - firstPrice) / firstPrice) * 100;
                        }
                    }
                    
                    // Get 48h (previous day) volume for this item to calculate volume change
                    const twoDaysAgo = getCurrentTimestamp() - 172800;
                    
                    const volume48hQuery = `
                        query Get48hTransfers($itemId: ID!, $twoDaysAgo: BigInt!, $oneDayAgo: BigInt!) {
                            transfers(
                                where: { 
                                    item: $itemId, 
                                    isPurchase: true,
                                    timestamp_gte: $twoDaysAgo,
                                    timestamp_lt: $oneDayAgo
                                }
                                orderBy: timestamp
                                orderDirection: asc
                                first: 1000
                            ) {
                                totalValueETH
                                amount
                            }
                        }
                    `;
                    
                    const volume48hData = await querySubgraph(volume48hQuery, { 
                        itemId: item.id, 
                        twoDaysAgo: twoDaysAgo.toString(),
                        oneDayAgo: oneDayAgo.toString()
                    });
                    
                    const transfers48h = volume48hData.transfers || [];
                    const volume48h = transfers48h.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
                    
                    // Calculate volume change (current 24h vs previous 24h)
                    const volumeChange24h = volume48h > 0 ? ((volume24h - volume48h) / volume48h) * 100 : 0;
                    
                    // Get floor price from orderbook (lowest ask)
                    const floorPriceQuery = `
                        query GetFloorPrice($itemId: ID!) {
                            listings(
                                where: { 
                                    item: $itemId, 
                                    isActive: true,
                                    amountRemaining_gt: "0"
                                }
                                orderBy: pricePerItemETH
                                orderDirection: asc
                                first: 1
                            ) {
                                pricePerItemETH
                            }
                        }
                    `;
                    
                    const floorPriceData = await querySubgraph(floorPriceQuery, { itemId: item.id });
                    const floorPrice = floorPriceData.listings && floorPriceData.listings.length > 0 
                        ? toNumber(floorPriceData.listings[0].pricePerItemETH) 
                        : 0;
                    
                    return {
                        itemId: item.id,
                        tradeCount: parseInt(item.totalTrades),
                        totalItemsSold24h: itemsSold24h,
                        totalEthVolume24h: volume24h,
                        avgPrice: toNumber(item.currentPriceETH),
                        minPrice: toNumber(item.currentPriceETH), // Simplified for now
                        maxPrice: toNumber(item.currentPriceETH), // Simplified for now
                        currentPrice: toNumber(item.currentPriceETH),
                        floorPrice: floorPrice, // Floor price from orderbook
                        price24hAgo: transfers24h.length > 0 ? toNumber(transfers24h[0].pricePerItemETH) : 0,
                        priceChange24h: priceChange24h, // This is PRICE change % for market list
                        volumeChange24h: volumeChange24h, // This is VOLUME change % for info blocks
                        lastTrade: new Date(parseInt(item.lastTradeTimestamp) * 1000).toISOString(),
                        marketVolumeChange24h: marketVolumeChange, // Market-wide volume change
                        totalMarketVolume24h: volume24h // Total market volume for this calculation
                    };
                } catch (error) {
                    console.error(`Error fetching stats for item ${item.id}:`, error);
                    return {
                        itemId: item.id,
                        tradeCount: 0,
                        totalItemsSold24h: 0,
                        totalEthVolume24h: 0,
                        avgPrice: 0,
                        minPrice: 0,
                        maxPrice: 0,
                        currentPrice: 0,
                        floorPrice: 0,
                        price24hAgo: 0,
                        priceChange24h: 0,
                        lastTrade: null,
                        marketVolumeChange24h: 0
                    };
                }
            }));
            
            statsPromises.push(batchPromise);
        }
        
        const batchResults = await Promise.all(statsPromises);
        const stats = batchResults.flat();
        
        
        res.json(stats);
        
    } catch (error) {
        console.error('Market stats error:', error);
        res.status(500).json({ error: 'Failed to fetch market stats' });
    }
});

// === INDIVIDUAL ITEM STATS ===
app.get('/api/stats/:itemId', async (req, res) => {
    const { itemId } = req.params;
    
    try {
        
        // Calculate UTC day start for TODAY (not rolling 24h)
        const now = new Date();
        const todayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        const oneDayAgo = Math.floor(todayUTCStart.getTime() / 1000);
        
        // Get item basic info
        const itemQuery = `
            query GetItem($itemId: ID!) {
                items(where: {id: $itemId}) {
                    id
                    totalVolumeETH
                    totalTrades
                    totalItemsSold
                    currentPriceETH
                    lastTradeTimestamp
                }
            }
        `;
        
        // Get 24h transfers with pagination
        const transfersQuery = `
            query Get24hTransfers($itemId: ID!, $timestamp: BigInt!) {
                transfers(
                    where: { 
                        item: $itemId, 
                        isPurchase: true,
                        timestamp_gte: $timestamp
                    }
                    orderBy: timestamp
                    orderDirection: asc
                    first: 1000
                ) {
                    pricePerItemETH
                    totalValueETH
                    amount
                    timestamp
                }
            }
        `;
        
        const [itemData, transfersData] = await Promise.all([
            querySubgraph(itemQuery, { itemId }),
            querySubgraph(transfersQuery, { itemId, timestamp: oneDayAgo.toString() })
        ]);
        
        const items = itemData.items || [];
        const item = items.length > 0 ? items[0] : null;
        if (!item) {
            return res.json(null);
        }
        
        const transfers24h = transfersData.transfers || [];
        
        // Calculate 24h stats - SAME as page_2.html calculation
        const volume24h = transfers24h.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
        const itemsSold24h = transfers24h.reduce((sum, t) => sum + parseInt(t.amount || 0), 0); // Sum all transfer amounts
        
        // Calculate price change
        let priceChange24h = 0;
        if (transfers24h.length > 1) {
            const firstPrice = toNumber(transfers24h[0].pricePerItemETH);
            const lastPrice = toNumber(transfers24h[transfers24h.length - 1].pricePerItemETH);
            if (firstPrice > 0) {
                priceChange24h = ((lastPrice - firstPrice) / firstPrice) * 100;
            }
        }
        
        // Get previous day UTC start for volume change calculation  
        const yesterdayUTCStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
        const twoDaysAgo = Math.floor(yesterdayUTCStart.getTime() / 1000);
        
        const volume48hQuery = `
            query Get48hTransfers($itemId: ID!, $twoDaysAgo: BigInt!, $oneDayAgo: BigInt!) {
                transfers(
                    where: { 
                        item: $itemId, 
                        isPurchase: true,
                        timestamp_gte: $twoDaysAgo,
                        timestamp_lt: $oneDayAgo
                    }
                    orderBy: timestamp
                    orderDirection: asc
                    first: 1000
                ) {
                    totalValueETH
                    amount
                }
            }
        `;
        
        const volume48hData = await querySubgraph(volume48hQuery, { 
            itemId: itemId, 
            twoDaysAgo: twoDaysAgo.toString(),
            oneDayAgo: oneDayAgo.toString()
        });
        
        const transfers48h = volume48hData.transfers || [];
        const volume48h = transfers48h.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
        const itemsSold48h = transfers48h.reduce((sum, t) => sum + parseInt(t.amount), 0);
        
        // Calculate volume change (current 24h vs previous 24h)
        const volumeChange24h = volume48h > 0 ? ((volume24h - volume48h) / volume48h) * 100 : 0;
        
        // Calculate items sold change (current 24h vs previous 24h)
        const itemsSoldChange24h = itemsSold48h > 0 ? ((itemsSold24h - itemsSold48h) / itemsSold48h) * 100 : 0;
        
        // Get min/max prices from transfers
        const prices = transfers24h.map(t => toNumber(t.pricePerItemETH)).filter(p => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : toNumber(item.currentPriceETH);
        const maxPrice = prices.length > 0 ? Math.max(...prices) : toNumber(item.currentPriceETH);
        
        const result = {
            itemId: itemId,
            tradeCount: parseInt(item.totalTrades),
            totalItemsSold24h: itemsSold24h,
            totalEthVolume24h: volume24h,
            avgPrice: toNumber(item.currentPriceETH),
            minPrice: minPrice,
            maxPrice: maxPrice,
            currentPrice: toNumber(item.currentPriceETH),
            price24hAgo: transfers24h.length > 0 ? toNumber(transfers24h[0].pricePerItemETH) : 0,
            priceChange24h: priceChange24h, // PRICE change %
            volumeChange24h: volumeChange24h, // VOLUME change % (current 24h vs previous 24h)
            itemsSoldChange24h: itemsSoldChange24h, // ITEMS SOLD change % (current 24h vs previous 24h)
            lastTrade: new Date(parseInt(item.lastTradeTimestamp) * 1000).toISOString(),
            // ALL-TIME DATA FROM GRAPHQL SCHEMA
            totalVolumeETH: toNumber(item.totalVolumeETH), // All-time volume
            totalItemsSold: parseInt(item.totalItemsSold), // All-time items sold  
            totalTrades: parseInt(item.totalTrades) // Total trades
        };
        
        res.json(result);
        
    } catch (error) {
        console.error('Individual stats error:', error);
        res.status(500).json({ error: 'Failed to fetch item stats' });
    }
});

// === ORDER BOOK ===
app.get('/api/orderbook/:itemId', async (req, res) => {
    const { itemId } = req.params;
    
    try {
        
        // Get all active listings with pagination to handle 1000+ listings
        let allListings = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const query = `
                query GetOrderbook($itemId: ID!, $skip: Int!, $limit: Int!) {
                    listings(
                        where: { 
                            item: $itemId, 
                            isActive: true,
                            amountRemaining_gt: "0"
                        }
                        orderBy: pricePerItemETH
                        orderDirection: asc
                        skip: $skip
                        first: $limit
                    ) {
                        id
                        pricePerItemETH
                        amountRemaining
                        amount
                        owner {
                            id
                        }
                    }
                }
            `;
            
            const data = await querySubgraph(query, { itemId, skip, limit });
            const listings = data.listings || [];
            
            allListings = allListings.concat(listings);
            hasMore = listings.length === limit;
            skip += limit;
            
        }
        
        
        if (allListings.length === 0) {
            return res.json({
                itemId,
                asks: [],
                lastUpdate: new Date().toISOString()
            });
        }
        
        // Aggregate by price level
        const priceMap = new Map();
        allListings.forEach(listing => {
            const price = toNumber(listing.pricePerItemETH);
            const amount = parseInt(listing.amountRemaining);
            
            if (priceMap.has(price)) {
                const existing = priceMap.get(price);
                existing.amount += amount;
                existing.orders += 1;
            } else {
                priceMap.set(price, {
                    price: price,
                    amount: amount,
                    orders: 1
                });
            }
        });
        
        // Convert to array and sort by price (lowest first)
        const asks = Array.from(priceMap.values())
            .sort((a, b) => a.price - b.price)
            .slice(0, 100); // Show top 100 price levels
        
        console.log(`📋 Aggregated into ${asks.length} price levels for item ${itemId}`);
        
        res.json({
            itemId,
            asks,
            lastUpdate: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Orderbook error:', error);
        res.status(500).json({ error: 'Failed to fetch orderbook' });
    }
});

// === AVAILABLE ITEMS ===
app.get('/api/items', async (req, res) => {
    try {
        console.log('📦 Fetching all available items');
        
        let allItems = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const query = `
                query GetAllItems($skip: Int!, $limit: Int!) {
                    items(
                        skip: $skip
                        first: $limit
                        orderBy: id
                    ) {
                        id
                    }
                }
            `;
            
            const data = await querySubgraph(query, { skip, limit });
            const items = data.items || [];
            
            allItems = allItems.concat(items.map(item => item.id));
            hasMore = items.length === limit;
            skip += limit;
        }
        
        res.json(allItems);
        
    } catch (error) {
        console.error('Items error:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// === ITEM DETAILS (unchanged - still from external API) ===
app.get('/api/item-details', async (req, res) => {
    try {
        const response = await fetch('https://gigaverse.io/api/offchain/gameitems');
        const data = await response.json();
        
        const itemLookup = {};
        data.entities.forEach(item => {
            itemLookup[item.ID_CID] = {
                id: item.ID_CID,
                name: item.NAME_CID,
                description: item.DESCRIPTION_CID,
                rarity: item.RARITY_NAME,
                type: item.TYPE_CID,
                image: item.IMG_URL_CID || item.ICON_URL_CID,
                icon: item.ICON_URL_CID
            };
        });
        
        res.json(itemLookup);
    } catch (error) {
        console.error('Error fetching item details:', error);
        res.status(500).json({ error: 'Failed to fetch item details' });
    }
});

// === LAST TRADES (GROUPED BY TRANSACTION) ===
app.get('/api/trades/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { limit = 30 } = req.query;
    const tradeLimit = parseInt(limit);
    
    try {
        console.log(`📊 Fetching last trades for item ${itemId} (will group by tx)`);
        
        // Get more transfers to ensure we have enough after grouping
        const query = `
            query GetTrades($itemId: ID!, $limit: Int!) {
                transfers(
                    where: { item: $itemId, isPurchase: true }
                    orderBy: timestamp
                    orderDirection: desc
                    first: $limit
                ) {
                    id
                    txHash
                    timestamp
                    pricePerItemETH
                    amount
                    totalValueETH
                    transferredTo {
                        id
                    }
                    listing {
                        owner {
                            id
                        }
                    }
                }
            }
        `;
        
        const data = await querySubgraph(query, { itemId, limit: tradeLimit * 3 }); // Get 3x to account for grouping
        const transfers = data.transfers || [];
        
        // Group by transaction hash
        const groupedTrades = new Map();
        transfers.forEach(transfer => {
            const txHash = transfer.txHash;
            const key = `${txHash}-${transfer.pricePerItemETH}-${transfer.transferredTo.id}`;
            
            if (groupedTrades.has(key)) {
                const existing = groupedTrades.get(key);
                existing.amount += parseInt(transfer.amount);
                existing.ethSpent += toNumber(transfer.totalValueETH);
                existing.tradeCount += 1;
            } else {
                groupedTrades.set(key, {
                    tx: txHash,
                    timestamp: new Date(parseInt(transfer.timestamp) * 1000).toISOString(),
                    price: toNumber(transfer.pricePerItemETH),
                    amount: parseInt(transfer.amount),
                    ethSpent: toNumber(transfer.totalValueETH),
                    buyer: transfer.transferredTo.id,
                    seller: transfer.listing.owner.id,
                    tradeCount: 1
                });
            }
        });
        
        // Convert to array, sort by timestamp, and limit
        const trades = Array.from(groupedTrades.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, tradeLimit);
        
        console.log(`📊 Grouped ${transfers.length} transfers into ${trades.length} trades`);
        res.json(trades);
        
    } catch (error) {
        console.error('Trades error:', error);
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
});

// === USER TRANSACTIONS (BUY AND SELL) ===
app.get('/api/user-transactions/:userAddress', async (req, res) => {
    const { userAddress } = req.params;
    const { limit = 50, itemId } = req.query;
    
    try {
        console.log(`🔍 Fetching transactions for user ${userAddress}, itemId: ${itemId || 'all'}`);
        
        const lowerUserAddress = userAddress.toLowerCase();
        
        // Query for user's purchases (as buyer)
        let purchasesQuery = `
            query GetUserPurchases($userAddress: String!, $limit: Int!) {
                transfers(
                    where: { 
                        transferredTo: $userAddress, 
                        isPurchase: true 
                        ${itemId ? `, item: "${itemId}"` : ''}
                    }
                    orderBy: timestamp
                    orderDirection: desc
                    first: $limit
                ) {
                    id
                    amount
                    pricePerItemETH
                    totalValueETH
                    timestamp
                    txHash
                    item {
                        id
                    }
                    listing {
                        owner {
                            id
                        }
                    }
                }
            }
        `;
        
        // Query for user's sales (as seller)
        let salesQuery = `
            query GetUserSales($userAddress: String!, $limit: Int!) {
                transfers(
                    where: { 
                        listing_: { owner: $userAddress }, 
                        isPurchase: true 
                        ${itemId ? `, item: "${itemId}"` : ''}
                    }
                    orderBy: timestamp
                    orderDirection: desc
                    first: $limit
                ) {
                    id
                    amount
                    pricePerItemETH
                    totalValueETH
                    timestamp
                    txHash
                    item {
                        id
                    }
                    transferredTo {
                        id
                    }
                    listing {
                        owner {
                            id
                        }
                    }
                }
            }
        `;
        
        // Execute both queries in parallel
        const [purchasesData, salesData] = await Promise.all([
            querySubgraph(purchasesQuery, { userAddress: lowerUserAddress, limit: parseInt(limit) }),
            querySubgraph(salesQuery, { userAddress: lowerUserAddress, limit: parseInt(limit) })
        ]);
        
        const purchases = (purchasesData.transfers || []).map(transfer => ({
            tx: transfer.txHash.slice(2), // Remove 0x prefix
            timestamp: new Date(parseInt(transfer.timestamp) * 1000).toISOString(),
            price: toNumber(transfer.pricePerItemETH),
            amount: parseInt(transfer.amount),
            ethSpent: toNumber(transfer.totalValueETH),
            type: 'BUY',
            itemId: transfer.item.id,
            counterparty: transfer.listing.owner.id, // seller
            user: transfer.transferredTo ? transfer.transferredTo.id : lowerUserAddress
        }));
        
        const sales = (salesData.transfers || []).map(transfer => ({
            tx: transfer.txHash.slice(2), // Remove 0x prefix
            timestamp: new Date(parseInt(transfer.timestamp) * 1000).toISOString(),
            price: toNumber(transfer.pricePerItemETH),
            amount: parseInt(transfer.amount),
            ethSpent: toNumber(transfer.totalValueETH),
            type: 'SELL',
            itemId: transfer.item.id,
            counterparty: transfer.transferredTo.id, // buyer
            user: transfer.listing.owner.id
        }));
        
        // Combine and sort by timestamp
        const allTransactions = [...purchases, ...sales]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, parseInt(limit));
        
        console.log(`📊 Found ${purchases.length} purchases and ${sales.length} sales for user ${userAddress}`);
        res.json(allTransactions);
        
    } catch (error) {
        console.error('User transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch user transactions' });
    }
});

// === USER LISTINGS ===
app.get('/api/user-listings/:userAddress', async (req, res) => {
    const { userAddress } = req.params;
    const { limit = 50, itemId } = req.query;
    
    try {
        console.log(`🏷️ Fetching listings for user ${userAddress}, itemId: ${itemId || 'all'}`);
        
        const lowerUserAddress = userAddress.toLowerCase();
        
        const query = `
            query GetUserListings($userAddress: String!, $limit: Int!) {
                listings(
                    where: { 
                        owner: $userAddress
                        ${itemId ? `, item: "${itemId}"` : ''}
                    }
                    orderBy: timestamp
                    orderDirection: desc
                    first: $limit
                ) {
                    id
                    amount
                    amountRemaining
                    pricePerItemETH
                    status
                    isActive
                    timestamp
                    item {
                        id
                    }
                    transfers(where: { isPurchase: true }) {
                        id
                        amount
                        totalValueETH
                        timestamp
                        txHash
                        transferredTo {
                            id
                        }
                    }
                }
            }
        `;
        
        const data = await querySubgraph(query, { userAddress: lowerUserAddress, limit: parseInt(limit) });
        const listings = data.listings || [];
        
        // Process listings to calculate earnings and sort by status (active first)
        const processedListings = listings.map(listing => {
            const totalEarned = listing.transfers.reduce((sum, transfer) => 
                sum + toNumber(transfer.totalValueETH), 0
            );
            
            const itemsSold = parseInt(listing.amount) - parseInt(listing.amountRemaining);
            
            return {
                id: listing.id,
                itemId: listing.item.id,
                amount: parseInt(listing.amount),
                amountRemaining: parseInt(listing.amountRemaining),
                itemsSold,
                pricePerItem: toNumber(listing.pricePerItemETH),
                status: listing.status,
                isActive: listing.isActive,
                timestamp: new Date(parseInt(listing.timestamp) * 1000).toISOString(),
                totalEarned,
                transfers: listing.transfers.map(transfer => ({
                    id: transfer.id,
                    buyer: transfer.transferredTo.id,
                    amount: parseInt(transfer.amount),
                    totalPaid: toNumber(transfer.totalValueETH),
                    timestamp: new Date(parseInt(transfer.timestamp) * 1000).toISOString(),
                    txHash: transfer.txHash
                }))
            };
        });
        
        // Sort: active listings first, then by timestamp
        processedListings.sort((a, b) => {
            if (a.isActive !== b.isActive) {
                return b.isActive ? 1 : -1; // Active listings first
            }
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        console.log(`🏷️ Found ${processedListings.length} listings for user ${userAddress}`);
        res.json(processedListings);
        
    } catch (error) {
        console.error('User listings error:', error);
        res.status(500).json({ error: 'Failed to fetch user listings' });
    }
});

// === TIMEFRAME-SPECIFIC DATA FOR CHART HOVER ===
app.get('/api/timeframe-data/:itemId', async (req, res) => {
    const { itemId } = req.params;
    const { timeframe = '1d', timestamp } = req.query;
    
    if (!timestamp) {
        return res.status(400).json({ error: 'Timestamp required' });
    }
    
    try {
        const intervals = { '1h': 3600, '4h': 14400, '1d': 86400 };
        const intervalSeconds = intervals[timeframe];
        
        const startTime = Math.floor(timestamp / intervalSeconds) * intervalSeconds;
        const endTime = startTime + intervalSeconds;
        
        const query = `
            query GetTimeframeData($itemId: ID!, $startTime: BigInt!, $endTime: BigInt!) {
                transfers(
                    where: { 
                        item: $itemId, 
                        isPurchase: true,
                        timestamp_gte: $startTime,
                        timestamp_lt: $endTime
                    }
                    first: 1000
                ) {
                    amount
                    totalValueETH
                }
            }
        `;
        
        const data = await querySubgraph(query, { 
            itemId, 
            startTime: startTime.toString(), 
            endTime: endTime.toString() 
        });
        
        const transfers = data.transfers || [];
        
        const totalItemsSold = transfers.reduce((sum, t) => sum + parseInt(t.amount), 0);
        const totalEthVolume = transfers.reduce((sum, t) => sum + toNumber(t.totalValueETH), 0);
        
        res.json({
            itemId,
            timeframe,
            startTime,
            endTime,
            totalItemsSold,
            totalEthVolume
        });
        
    } catch (error) {
        console.error('Timeframe data error:', error);
        res.status(500).json({ error: 'Failed to fetch timeframe data' });
    }
});

// === USER BALANCE ===
app.get('/api/balance/:userAddress/:itemId', async (req, res) => {
    const { userAddress, itemId } = req.params;
    
    try {
        console.log(`💰 Fetching balance for user ${userAddress} and item ${itemId}`);
        
        const query = `
            query GetUserBalance($userId: ID!, $itemId: ID!) {
                userItemPosition(id: "${userAddress.toLowerCase()}-${itemId}") {
                    currentBalance
                    totalPurchased
                    totalSold
                    avgPurchasePriceETH
                    totalSpentETH
                    totalEarnedETH
                }
            }
        `;
        
        const data = await querySubgraph(query, { userId: userAddress.toLowerCase(), itemId });
        const position = data.userItemPosition;
        
        if (!position) {
            return res.json({
                balance: 0,
                totalPurchased: 0,
                totalSold: 0,
                avgPurchasePrice: 0,
                totalSpent: 0,
                totalEarned: 0
            });
        }
        
        res.json({
            balance: parseInt(position.currentBalance),
            totalPurchased: parseInt(position.totalPurchased),
            totalSold: parseInt(position.totalSold),
            avgPurchasePrice: toNumber(position.avgPurchasePriceETH),
            totalSpent: toNumber(position.totalSpentETH),
            totalEarned: toNumber(position.totalEarnedETH)
        });
        
    } catch (error) {
        console.error('Balance error:', error);
        res.status(500).json({ error: 'Failed to fetch user balance' });
    }
});

// === ENHANCED DEALS API WITH PLAYER EXECUTION TRACKING ===
app.get('/api/deals', async (req, res) => {
    const { playerAddress } = req.query;
    
    try {
        const response = await fetch('https://gigaverse.io/api/offchain/recipes');
        const recipesData = await response.json();
        
        // The API returns data in an "entities" array
        const recipes = recipesData.entities || [];
        
        // Debug: Check structure and find deals
        console.log(`📊 Deals API: Found ${recipes.length} recipes`);
        const weeklyCount = recipes.filter(r => r && r.IS_WEEKLY_CID === true).length;
        const dailyCount = recipes.filter(r => r && r.IS_DAILY_CID === true).length;
        console.log(`📊 Weekly deals found: ${weeklyCount}, Daily deals found: ${dailyCount}`);
        
        // Filter all weekly and daily deals (6 weekly, 5 daily)
        const weeklyDeals = recipes
            .filter(recipe => recipe && recipe.IS_WEEKLY_CID === true);
            
        const dailyDeals = recipes
            .filter(recipe => recipe && recipe.IS_DAILY_CID === true);
            
        // Debug: Show first deal if found
        if (weeklyDeals.length > 0) {
            console.log('📊 First weekly deal:', {
                id: weeklyDeals[0].ID_CID,
                name: weeklyDeals[0].NAME_CID,
                inputs: weeklyDeals[0].INPUT_ID_CID_array,
                amounts: weeklyDeals[0].INPUT_AMOUNT_CID_array,
                loot: weeklyDeals[0].LOOT_AMOUNT_CID_array
            });
        }
        if (dailyDeals.length > 0) {
            console.log('📊 First daily deal:', {
                id: dailyDeals[0].ID_CID,
                name: dailyDeals[0].NAME_CID,
                inputs: dailyDeals[0].INPUT_ID_CID_array,
                amounts: dailyDeals[0].INPUT_AMOUNT_CID_array,
                loot: dailyDeals[0].LOOT_AMOUNT_CID_array
            });
        }
        
        
        // Enhanced processDeals function with execution tracking
        const processDeals = async (deals, dealType, currentTime, playerExecutions) => {
            return await Promise.all(deals.map(async (deal) => {
                const inputId = deal.INPUT_ID_CID_array[0];
                const inputAmount = deal.INPUT_AMOUNT_CID_array[0];
                const stubsReceived = deal.LOOT_AMOUNT_CID_array[0];
                const maxCompletions = deal.MAX_COMPLETIONS_CID || 1;
                
                // Calculate execution status
                let remainingExecutions = maxCompletions;
                let currentExecutions = 0;
                
                if (currentTime && playerExecutions.length > 0) {
                    // Find player execution record for this recipe
                    const recipeId = `Recipe#${deal.ID_CID}`;
                    const execution = playerExecutions.find(ex => ex.ID_CID === recipeId);
                    
                    if (execution) {
                        const isCurrentPeriod = dealType === 'weekly' 
                            ? (execution.WEEK_CID === currentTime.currentWeek)
                            : (execution.DAY_CID === currentTime.currentDay);
                        
                        if (isCurrentPeriod) {
                            currentExecutions = dealType === 'weekly' 
                                ? (execution.WEEK_COUNT_CID || 0)
                                : (execution.DAY_COUNT_CID || 0);
                            remainingExecutions = Math.max(0, maxCompletions - currentExecutions);
                        }
                        
                        console.log(`📊 Player execution for ${deal.NAME_CID}: ${currentExecutions}/${maxCompletions} (${remainingExecutions} remaining)`);
                    }
                }
                
                console.log(`📊 Processing deal: ${deal.NAME_CID} - need ${inputAmount} of item ${inputId} (Max: ${maxCompletions}x)`);
                
                // Calculate REAL price from orderbook data (not floor price!)
                let totalCost = 0;
                let purchaseBreakdown = [];
                
                try {
                    const orderBookQuery = `
                        query GetOrderBook($itemId: String!) {
                            listings(
                                where: { 
                                    item: $itemId, 
                                    amountRemaining_gt: 0
                                }
                                orderBy: pricePerItemETH
                                orderDirection: asc
                                first: 100
                            ) {
                                id
                                amount
                                amountRemaining
                                pricePerItemETH
                            }
                        }
                    `;
                    
                    const orderBookData = await querySubgraph(orderBookQuery, { itemId: inputId.toString() });
                    const listings = orderBookData?.listings || [];
                    
                    console.log(`🔍 Found ${listings.length} active listings for Item ${inputId}`);
                    
                    if (listings.length > 0) {
                        let remainingAmount = inputAmount;
                        let listingIndex = 0;
                        
                        // Simulate REAL buying from multiple listings at different prices
                        for (const listing of listings) {
                            if (remainingAmount <= 0) break;
                            
                            const availableAmount = parseInt(listing.amountRemaining);
                            const price = parseFloat(listing.pricePerItemETH);
                            
                            const takeAmount = Math.min(remainingAmount, availableAmount);
                            const cost = takeAmount * price;
                            totalCost += cost;
                            remainingAmount -= takeAmount;
                            
                            purchaseBreakdown.push({
                                listingId: listing.id.substring(0, 8) + "...",
                                amount: takeAmount,
                                price: price,
                                cost: cost
                            });
                            
                            console.log(`💰 Listing ${++listingIndex}: Buy ${takeAmount} at ${price.toFixed(6)} ETH each = ${cost.toFixed(6)} ETH (${availableAmount} available)`);
                        }
                        
                        // If not enough liquidity available in all listings, use last price for remaining
                        if (remainingAmount > 0) {
                            const lastPrice = parseFloat(listings[listings.length - 1].pricePerItemETH);
                            const extraCost = remainingAmount * lastPrice;
                            totalCost += extraCost;
                            
                            purchaseBreakdown.push({
                                listingId: "EXTRAPOLATED",
                                amount: remainingAmount,
                                price: lastPrice,
                                cost: extraCost
                            });
                            
                            console.log(`⚠️ Insufficient liquidity! Need ${remainingAmount} more at extrapolated price ${lastPrice.toFixed(6)} ETH = ${extraCost.toFixed(6)} ETH`);
                        }
                        
                        console.log(`📊 Total real purchase cost: ${totalCost.toFixed(6)} ETH across ${purchaseBreakdown.length} transactions`);
                        
                    } else {
                        // No active listings found - this item is not tradeable on market
                        totalCost = 0;
                        purchaseBreakdown = [];
                        console.log(`❌ No active listings found for Item ${inputId} - NOT TRADEABLE ON MARKET`);
                    }
                } catch (error) {
                    console.error(`💥 Error calculating real orderbook price for Item ${inputId}:`, error);
                    totalCost = 0; // No price if can't access market data
                    purchaseBreakdown = [];
                    console.log(`❌ Cannot access market data for Item ${inputId} - marked as not tradeable`);
                }
                
                const costPerStub = stubsReceived > 0 ? totalCost / stubsReceived : 0;
                const isTradeable = totalCost > 0; // Only tradeable if it has a real market price
                
                if (isTradeable) {
                    console.log(`📊 Deal result: Item ${inputId} - Cost: ${totalCost.toFixed(6)} ETH, Cost/Stub: ${costPerStub.toFixed(8)} ETH`);
                } else {
                    console.log(`📊 Deal result: Item ${inputId} - NOT TRADEABLE ON MARKET (excluded from totals)`);
                }
                
                // Apply execution multipliers for calculations
                const totalInputAmount = inputAmount * maxCompletions;
                const totalStubsReceived = stubsReceived * maxCompletions;
                const totalCostWithMultiplier = totalCost * maxCompletions;
                const costPerStubWithMultiplier = totalStubsReceived > 0 ? totalCostWithMultiplier / totalStubsReceived : 0;
                
                return {
                    ...deal,
                    inputId,
                    inputAmount,
                    stubsReceived,
                    totalCost,
                    costPerStub,
                    isTradeable,
                    priceBreakdown: purchaseBreakdown, // Show how the real price was calculated
                    maxCompletions,
                    currentExecutions,
                    remainingExecutions,
                    // Multiplied values for totals calculation
                    totalInputAmount,
                    totalStubsReceived,
                    totalCostWithMultiplier,
                    costPerStubWithMultiplier
                };
            }));
        };
        
        // Fetch current time and player executions if player address provided
        let currentTime = null;
        let playerExecutions = [];
        
        if (playerAddress && playerAddress.startsWith('0x')) {
            try {
                // Get current day/week
                const timeResponse = await fetch('https://gigaverse.io/api/offchain/static');
                const timeText = await timeResponse.text();
                const start = timeText.indexOf('{"currentDay"');
                const end = timeText.indexOf(',"currentDayOf');
                
                if (start !== -1 && end !== -1) {
                    const timeDataText = timeText.substring(start, end) + '}';
                    const timeData = JSON.parse(timeDataText);
                    currentTime = {
                        currentDay: timeData.currentDay,
                        currentWeek: timeData.currentWeek
                    };
                }
                
                // Get player executions
                const executionResponse = await fetch(`https://gigaverse.io/api/offchain/recipes/player/${playerAddress}`);
                const executionData = await executionResponse.json();
                playerExecutions = executionData.entities || [];
                
                console.log(`📊 Player ${playerAddress}: Found ${playerExecutions.length} execution records, Current: Day ${currentTime?.currentDay}, Week ${currentTime?.currentWeek}`);
                
            } catch (error) {
                console.warn('Failed to fetch player execution data:', error.message);
            }
        }
        
        console.log(`📊 About to process ${weeklyDeals.length} weekly deals and ${dailyDeals.length} daily deals...`);
        
        const processedWeeklyDeals = await processDeals(weeklyDeals, 'weekly', currentTime, playerExecutions);
        console.log(`📊 Successfully processed ${processedWeeklyDeals.length} weekly deals`);
        
        const processedDailyDeals = await processDeals(dailyDeals, 'daily', currentTime, playerExecutions);
        console.log(`📊 Successfully processed ${processedDailyDeals.length} daily deals`);
        
        // Calculate totals with execution multipliers - ONLY include tradeable deals
        const calculateTotals = (deals) => {
            const tradeableDeals = deals.filter(deal => deal.isTradeable);
            const nonTradeableDeals = deals.filter(deal => !deal.isTradeable);
            
            // Use multiplied values for totals calculation
            const totalCost = tradeableDeals.reduce((sum, deal) => sum + deal.totalCostWithMultiplier, 0);
            const totalStubs = tradeableDeals.reduce((sum, deal) => sum + deal.totalStubsReceived, 0);
            const avgCostPerStub = totalStubs > 0 ? totalCost / totalStubs : 0;
            
            const excludedStubs = nonTradeableDeals.reduce((sum, deal) => sum + deal.totalStubsReceived, 0);
            
            console.log(`📊 Tradeable deals: ${tradeableDeals.length} (${totalStubs} stubs with multipliers, ${totalCost.toFixed(6)} ETH)`);
            console.log(`📊 Non-tradeable deals: ${nonTradeableDeals.length} (${excludedStubs} stubs EXCLUDED from totals)`);
            console.log(`📊 Final averages with multipliers: ${totalStubs} stubs = ${avgCostPerStub.toFixed(8)} ETH per stub`);
            
            return { 
                totalCost, 
                totalStubs, 
                avgCostPerStub,
                tradeableDealsCount: tradeableDeals.length,
                totalDealsCount: deals.length
            };
        };
        
        const weeklyTotals = calculateTotals(processedWeeklyDeals);
        const dailyTotals = calculateTotals(processedDailyDeals);
        
        res.json({
            weekly: processedWeeklyDeals,
            daily: processedDailyDeals,
            totals: {
                weekly: weeklyTotals,
                daily: dailyTotals
            }
        });
        
    } catch (error) {
        console.error('Deals API error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch deals data',
            weekly: [],
            daily: [],
            totals: {
                weekly: { totalCost: 0, totalStubs: 0, avgCostPerStub: 0 },
                daily: { totalCost: 0, totalStubs: 0, avgCostPerStub: 0 }
            }
        });
    }
});

// === CURRENT DAY/WEEK API ===
app.get('/api/current-time', async (req, res) => {
    try {
        const response = await fetch('https://gigaverse.io/api/offchain/static');
        const text = await response.text();
        
        // Extract just the beginning of the response to get currentDay, currentWeek
        const start = text.indexOf('{"currentDay"');
        const end = text.indexOf(',"currentDayOf');
        
        if (start === -1 || end === -1) {
            throw new Error('Current time data not found in expected format');
        }
        
        const timeDataText = text.substring(start, end) + '}';
        const timeData = JSON.parse(timeDataText);
        
        res.json({
            currentDay: timeData.currentDay,
            currentWeek: timeData.currentWeek
        });
        
    } catch (error) {
        console.error('Current time API error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch current time data',
            currentDay: null,
            currentWeek: null
        });
    }
});

// === PLAYER EXECUTIONS API ===
app.get('/api/player-executions/:address', async (req, res) => {
    try {
        const { address } = req.params;
        
        if (!address || !address.startsWith('0x')) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }
        
        const response = await fetch(`https://gigaverse.io/api/offchain/recipes/player/${address}`);
        const playerData = await response.json();
        
        // Extract executions from entities array
        const executions = playerData.entities || [];
        
        res.json({
            executions,
            playerAddress: address
        });
        
    } catch (error) {
        console.error('Player executions API error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch player execution data',
            executions: [],
            playerAddress: req.params.address
        });
    }
});

// === STUB ICON API ===
app.get('/api/stub-icon', async (req, res) => {
    try {
        const response = await fetch('https://gigaverse.io/api/offchain/gameitems');
        const gameItems = await response.json();
        
        // Find stub item (ID_CID: 373)
        const entities = gameItems.entities || [];
        const stubItem = entities.find(item => item && item.ID_CID === 373);
        
        if (stubItem) {
            res.json({
                id: stubItem.ID_CID,
                name: stubItem.NAME_CID || 'Stub',
                image: stubItem.IMG_URL_CID,
                icon: stubItem.ICON_URL_CID
            });
        } else {
            throw new Error('Stub item (ID 373) not found');
        }
        
    } catch (error) {
        console.error('Stub icon API error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch stub icon data',
            id: 373,
            name: 'Stub',
            image: null,
            icon: null
        });
    }
});

// === SERVE REACT BUILD FILES (PRODUCTION) ===
// === AVAILABLE LISTINGS ===
app.get('/api/listings', async (req, res) => {
    try {
        console.log('📋 Fetching all available listings');
        
        let allListings = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const query = `
                query GetAllListings($skip: Int!, $limit: Int!) {
                    listings(
                        where: { 
                            isActive: true,
                            amountRemaining_gt: 0
                        }
                        skip: $skip
                        first: $limit
                        orderBy: pricePerItemETH
                        orderDirection: asc
                    ) {
                        id
                        item {
                            id
                        }
                        pricePerItemETH
                        amountRemaining
                        timestamp
                        owner {
                            id
                        }
                    }
                }
            `;
            
            const data = await querySubgraph(query, { skip, limit });
            const listings = data.listings || [];
            
            const formattedListings = listings.map(listing => ({
                listing_id: listing.id,
                item_id: listing.item.id,
                price_per_item: listing.pricePerItemETH,
                available_amount: parseInt(listing.amountRemaining),
                amount: parseInt(listing.amountRemaining),
                owner: listing.owner.id,
                timestamp: parseInt(listing.timestamp) * 1000 // Convert to milliseconds
            }));
            
            allListings = allListings.concat(formattedListings);
            hasMore = listings.length === limit;
            skip += limit;
            
        }
        
        console.log(`📋 Total active listings found: ${allListings.length}`);
        res.json(allListings);
        
    } catch (error) {
        console.error('Listings error:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// === GIGAVERSE BULK BUY ===
app.post('/api/gigaverse/bulk-buy', async (req, res) => {
    try {
        const { userAddress, listings } = req.body;
        
        if (!userAddress || !listings || !Array.isArray(listings)) {
            return res.status(400).json({ error: 'Invalid request. userAddress and listings array required.' });
        }
        
        console.log('🛒 Processing bulk buy request:', { userAddress, listingsCount: listings.length });
        console.log('🛒 Listings:', listings);
        
        // Validate listings format
        for (const listing of listings) {
            if (!listing.listingId || !listing.amount || !listing.ethCost) {
                return res.status(400).json({ error: 'Invalid listing format. Each listing needs listingId, amount, and ethCost.' });
            }
        }
        
        // Calculate totals
        const totalEthCost = listings.reduce((sum, listing) => sum + listing.ethCost, 0);
        const feeAmount = totalEthCost * 0.01; // 1% fee
        const totalWithFee = totalEthCost + feeAmount;
        const listingIds = listings.map(l => l.listingId);
        const amounts = listings.map(l => l.amount);
        
        console.log('🛒 Bulk buy details:', {
            totalEthCost: totalEthCost.toFixed(6) + ' ETH',
            feeAmount: feeAmount.toFixed(6) + ' ETH (1%)',
            totalWithFee: totalWithFee.toFixed(6) + ' ETH',
            listingIds,
            amounts
        });
        
        // Since this is a server-side endpoint, we cannot execute AGW transactions here
        // The frontend should handle the actual blockchain transaction
        // Return a response indicating the frontend needs to execute the transaction
        
        console.log('🔄 Backend validated request. Frontend should execute transaction.');
        
        res.json({
            success: false,
            requiresFrontendExecution: true,
            message: 'Please execute transaction through AGW on frontend (two-transaction approach)',
            transactionData: {
                contract: '0x807BE43Cd840144819EA8D05C19F4E5530D38bf1',
                method: 'bulkBuy',
                listingIds,
                amounts,
                totalEthCost,
                feeAmount,
                totalWithFee,
                feeWallet: '0x010Cf19b9c0E75FC9EBFbae3302E3710be4ba911', // Side wallet for 1% fee
                valueInWei: '0x' + Math.floor(totalEthCost * 1e18).toString(16), // Only marketplace cost
                twoTransaction: true, // Indicates this uses two separate transactions
                note: 'Frontend executes marketplace purchase + separate fee transfer'
            },
            userAddress,
            listings,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Bulk buy error:', error);
        res.status(500).json({ error: 'Bulk buy failed: ' + error.message });
    }
});

// === GIGAVERSE API PROXY FOR CREATE LISTING ===
app.post('/api/gigaverse-create-listing', async (req, res) => {
    const { itemId, amount, costPerItem, jwt } = req.body;
    
    try {
        console.log('🏷️ Proxying Gigaverse create listing request:', { itemId, amount, costPerItem });
        
        // Validate input
        if (!itemId || !amount || !costPerItem || !jwt) {
            console.error('❌ Missing required fields');
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: itemId, amount, costPerItem, jwt' 
            });
        }
        
        // Make the exact same API call as the native app but from server-side (bypasses CORS)
        const gigaverseResponse = await fetch('https://gigaverse.io/api/marketplace/item/listing/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`,
                'DNT': '1',
                'Referer': 'https://gigaverse.io/play',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 OPR/121.0.0.0 (Edition developer)'
            },
            body: JSON.stringify({
                itemId: itemId.toString(),
                amount: parseInt(amount),
                costPerItem: costPerItem.toString()
            })
        });
        
        console.log('🔍 Gigaverse API response status:', gigaverseResponse.status);
        
        if (gigaverseResponse.ok) {
            const gigaverseData = await gigaverseResponse.json();
            console.log('✅ Gigaverse API response:', gigaverseData);
            
            // Forward the successful response
            res.json({
                success: true,
                message: 'Listing created successfully via Gigaverse API',
                data: gigaverseData
            });
        } else {
            const errorText = await gigaverseResponse.text();
            console.log('❌ Gigaverse API error:', errorText);
            
            res.status(gigaverseResponse.status).json({
                success: false,
                error: 'Gigaverse API failed',
                details: errorText,
                status: gigaverseResponse.status
            });
        }
        
    } catch (error) {
        console.error('❌ Gigaverse proxy error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to proxy Gigaverse API request',
            details: error.message 
        });
    }
});

// === DEAL EXECUTION ENDPOINTS ===

// Get noobId for a player address
app.get('/api/noob-id/:address', async (req, res) => {
    try {
        const { address } = req.params;
        console.log(`🎲 Fetching noobId for address: ${address}`);
        
        const response = await fetch(`https://gigaverse.io/api/account/${address}`);
        
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        const noobId = data.accountEntity?.NOOB_TOKEN_CID;
        
        if (!noobId) {
            return res.status(404).json({
                success: false,
                error: 'NoobId not found for this address'
            });
        }
        
        res.json({
            success: true,
            noobId: noobId,
            address: address
        });
        
    } catch (error) {
        console.error('❌ Error fetching noobId:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch noobId',
            details: error.message
        });
    }
});

// Execute deal
app.post('/api/execute-deal', async (req, res) => {
    try {
        const { recipeId, noobId, authToken, gearInstanceId = "", nodeIndex = 0 } = req.body;
        
        if (!recipeId || !noobId || !authToken) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: recipeId, noobId, authToken'
            });
        }
        
        console.log(`🎯 Executing deal: ${recipeId} with noobId: ${noobId}`);
        console.log(`🔍 Auth token: ${authToken.slice(0, 20)}...${authToken.slice(-10)} (${authToken.length} chars)`);
        console.log(`🔍 Request body:`, { recipeId, noobId, gearInstanceId, nodeIndex });
        
        const response = await fetch('https://gigaverse.io/api/offchain/recipes/start', {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,ru;q=0.8,nl;q=0.7,es;q=0.6,it;q=0.5',
                'authorization': `Bearer ${authToken}`,
                'content-type': 'application/json',
                'dnt': '1',
                'origin': 'https://gigaverse.io',
                'priority': 'u=1, i',
                'referer': 'https://gigaverse.io/play',
                'sec-ch-ua': '"Opera";v="122", "Chromium";v="137", "Not/A)Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 OPR/122.0.0.0 (Edition developer)'
            },
            body: JSON.stringify({
                recipeId: recipeId,
                noobId: parseInt(noobId),
                gearInstanceId: gearInstanceId || "",
                nodeIndex: nodeIndex || 0
            })
        });
        
        console.log(`🔍 Gigaverse API response status: ${response.status} ${response.statusText}`);
        console.log(`🔍 Response headers:`, Object.fromEntries(response.headers.entries()));
        
        const responseData = await response.json();
        console.log(`🔍 Gigaverse API response data:`, responseData);
        
        if (!response.ok) {
            console.error('❌ Deal execution failed:', responseData);
            return res.status(response.status).json({
                success: false,
                error: 'Deal execution failed',
                details: responseData
            });
        }
        
        console.log('✅ Deal executed successfully:', responseData);
        res.json({
            success: true,
            data: responseData
        });
        
    } catch (error) {
        console.error('❌ Error executing deal:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute deal',
            details: error.message
        });
    }
});

// Fetch player inventory
app.get('/api/player-inventory', async (req, res) => {
    try {
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        
        if (!authToken) {
            return res.status(400).json({
                success: false,
                error: 'Missing authorization header'
            });
        }
        
        console.log('🎒 Fetching player inventory...');
        console.log('🎒 Auth token preview:', `${authToken.slice(0, 20)}...${authToken.slice(-10)}`);
        
        const response = await fetch('https://gigaverse.io/api/items/balances', {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'authorization': `Bearer ${authToken}`,
                'content-type': 'application/json'
            }
        });
        
        console.log('🎒 Gigaverse API response status:', response.status);
        
        const data = await response.json();
        console.log('🎒 Inventory data received:', data.entities?.length || 0, 'items');
        
        if (!response.ok) {
            console.error('❌ Inventory fetch failed:', data);
            return res.status(response.status).json({
                success: false,
                error: 'Failed to fetch inventory',
                details: data
            });
        }
        
        res.json({
            success: true,
            data: data
        });
        
    } catch (error) {
        console.error('❌ Error fetching inventory:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch inventory',
            details: error.message
        });
    }
});

// === CONFIG ENDPOINT ===
app.get('/api/config', (req, res) => {
    res.json({
        subgraphUrl: process.env.SUBGRAPH_URL
    });
});

// === USER PnL ANALYSIS ===
app.get('/api/user-pnl/:userAddress', async (req, res) => {
    const { userAddress } = req.params;
    
    try {
        console.log(`💰 Fetching PnL data for user ${userAddress}`);
        
        // Get ONLY reliable data: user purchases from transfers and user sales from listings
        const query = `
            query GetUserPnL($userAddress: ID!) {
                # Get all purchases made by this user
                purchases: transfers(
                    where: { transferredTo: $userAddress, isPurchase: true }
                    orderBy: timestamp
                    orderDirection: asc
                ) {
                    id
                    item {
                        id
                        currentPriceETH
                    }
                    amount
                    pricePerItemETH
                    totalValueETH
                    timestamp
                }
                
                # Get all sales made by this user (their listings that had purchases)
                userListings: listings(where: { owner: $userAddress }) {
                    id
                    item {
                        id
                    }
                    pricePerItemETH
                    transfers(where: { isPurchase: true }) {
                        id
                        amount
                        pricePerItemETH
                        totalValueETH
                        timestamp
                    }
                }
            }
        `;
        
        const data = await querySubgraph(query, { userAddress: userAddress.toLowerCase() });
        const purchases = data.purchases || [];
        const userListings = data.userListings || [];
        
        console.log(`📊 Raw data: ${purchases.length} purchases, ${userListings.length} listings`);
        
        if (purchases.length === 0 && userListings.length === 0) {
            return res.json({
                userAddress,
                summary: {
                    totalPurchases: 0,
                    totalSales: 0,
                    totalSpentETH: 0,
                    totalEarnedETH: 0,
                    totalPnL: 0
                },
                positions: [],
                timeline: [],
                lastUpdate: new Date().toISOString()
            });
        }
        
        // 1. Process all purchases by item
        const purchasesByItem = {};
        purchases.forEach(purchase => {
            const itemId = purchase.item.id;
            if (!purchasesByItem[itemId]) {
                purchasesByItem[itemId] = {
                    totalBought: 0,
                    totalSpent: 0,
                    purchases: [],
                    currentPrice: toNumber(purchase.item.currentPriceETH)
                };
            }
            purchasesByItem[itemId].totalBought += parseInt(purchase.amount);
            purchasesByItem[itemId].totalSpent += toNumber(purchase.totalValueETH);
            purchasesByItem[itemId].purchases.push({
                amount: parseInt(purchase.amount),
                price: toNumber(purchase.pricePerItemETH),
                value: toNumber(purchase.totalValueETH),
                timestamp: parseInt(purchase.timestamp)
            });
        });

        // 2. Process all sales by item  
        const salesByItem = {};
        userListings.forEach(listing => {
            const itemId = listing.item.id;
            if (listing.transfers && listing.transfers.length > 0) {
                listing.transfers.forEach(transfer => {
                    if (!salesByItem[itemId]) {
                        salesByItem[itemId] = {
                            totalSold: 0,
                            totalEarned: 0,
                            sales: []
                        };
                    }
                    salesByItem[itemId].totalSold += parseInt(transfer.amount);
                    salesByItem[itemId].totalEarned += toNumber(transfer.totalValueETH);
                    salesByItem[itemId].sales.push({
                        amount: parseInt(transfer.amount),
                        price: toNumber(transfer.pricePerItemETH),
                        value: toNumber(transfer.totalValueETH),
                        timestamp: parseInt(transfer.timestamp)
                    });
                });
            }
        });

        // 3. Get all items that user has activity with
        const allItemIds = new Set([
            ...Object.keys(purchasesByItem),
            ...Object.keys(salesByItem)
        ]);

        console.log(`📊 Items with activity: ${allItemIds.size}`);

        // 4. Calculate PnL per item
        const positions = [];
        let totalSpentETH = 0;
        let totalEarnedETH = 0;
        let totalPurchases = 0;
        let totalSales = 0;

        allItemIds.forEach(itemId => {
            const purchases = purchasesByItem[itemId] || { totalBought: 0, totalSpent: 0, purchases: [], currentPrice: 0 };
            const sales = salesByItem[itemId] || { totalSold: 0, totalEarned: 0, sales: [] };

            const totalBought = purchases.totalBought;
            const totalSold = sales.totalSold;
            const totalSpent = purchases.totalSpent;
            const totalEarned = sales.totalEarned;
            const currentBalance = totalBought - totalSold;

            // Calculate average prices
            const avgBuyPrice = totalBought > 0 ? totalSpent / totalBought : 0;
            const avgSellPrice = totalSold > 0 ? totalEarned / totalSold : 0;

            // Calculate PnL (simple: earned - spent)
            const totalPnL = totalEarned - totalSpent;

            // Track totals
            totalSpentETH += totalSpent;
            totalEarnedETH += totalEarned;
            totalPurchases += totalBought;  // Total items bought, not transaction count
            totalSales += totalSold;        // Total items sold, not transaction count

            // Only include items with activity
            if (totalBought > 0 || totalSold > 0) {
                positions.push({
                    itemId: itemId,
                    totalPurchased: totalBought,
                    totalSold: totalSold,
                    currentBalance: currentBalance,
                    totalSpentETH: totalSpent,
                    totalEarnedETH: totalEarned,
                    avgPurchasePriceETH: avgBuyPrice,
                    avgSalePriceETH: avgSellPrice,
                    currentPriceETH: purchases.currentPrice,
                    totalPnL: totalPnL
                });
            }
        });
        
        // Sort by total PnL (most profitable first)
        positions.sort((a, b) => b.totalPnL - a.totalPnL);
        
        // Create timeline for chart using all actual transactions
        const timeline = [];
        const allTransactions = [];
        
        // Add all purchase transactions
        purchases.forEach(purchase => {
            allTransactions.push({
                timestamp: parseInt(purchase.timestamp),
                type: 'BUY',
                pnlChange: -toNumber(purchase.totalValueETH),
                itemId: purchase.item.id
            });
        });
        
        // Add all sale transactions
        userListings.forEach(listing => {
            if (listing.transfers && listing.transfers.length > 0) {
                listing.transfers.forEach(transfer => {
                    allTransactions.push({
                        timestamp: parseInt(transfer.timestamp),
                        type: 'SELL',
                        pnlChange: toNumber(transfer.totalValueETH),
                        itemId: listing.item.id
                    });
                });
            }
        });
        
        // Sort by timestamp
        allTransactions.sort((a, b) => a.timestamp - b.timestamp);
        
        // Create cumulative timeline
        let cumulativePnL = 0;
        allTransactions.forEach(tx => {
            cumulativePnL += tx.pnlChange;
            timeline.push({
                timestamp: tx.timestamp,
                pnlChange: tx.pnlChange,
                cumulativePnL: cumulativePnL,
                type: tx.type,
                itemId: tx.itemId
            });
        });
        
        console.log('📊 PnL Debug:', {
            calculatedSpent: totalSpentETH,
            calculatedEarned: totalEarnedETH,
            positionsCount: positions.length,
            totalPnL: totalEarnedETH - totalSpentETH
        });
        
        // Calculate total unrealized PnL for positions still held
        let totalUnrealizedPnL = 0;
        positions.forEach(position => {
            if (position.currentBalance > 0) {
                const currentValue = position.currentPriceETH * position.currentBalance;
                const avgCost = position.avgPurchasePriceETH * position.currentBalance;
                totalUnrealizedPnL += (currentValue - avgCost);
            }
        });
        
        const totalPnL = totalEarnedETH - totalSpentETH;
        
        const summary = {
            totalPurchases: totalPurchases,
            totalSales: totalSales,
            totalSpentETH: totalSpentETH,
            totalEarnedETH: totalEarnedETH,
            realizedPnL: totalPnL, // Total earned - total spent
            unrealizedPnL: totalUnrealizedPnL,
            totalPnL: totalPnL + totalUnrealizedPnL,
            totalVolumeETH: totalSpentETH + totalEarnedETH,
            profitLossETH: totalPnL
        };
        
        res.json({
            userAddress,
            summary,
            positions,
            timeline,
            itemsWithPositions: positions.length,
            lastUpdate: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('User PnL error:', error);
        res.status(500).json({ error: 'Failed to fetch user PnL data' });
    }
});

if (process.env.NODE_ENV === 'production') {
    // Serve static files from React build
    app.use(express.static(path.join(__dirname, 'build')));
    
    // Serve React app for all non-API routes
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'build', 'index.html'));
    });
} else {
    // Development mode - just serve a simple message for API-only access
    app.get('/', (req, res) => {
        res.json({ 
            message: 'Gigaverse Trading API Server', 
            status: 'running',
            endpoints: {
                items: '/api/items',
                listings: '/api/listings',
                stats: '/api/stats',
                chart: '/api/chart-data/:itemId',
                orderbook: '/api/orderbook/:itemId',
                trades: '/api/trades/:itemId',
                bulkBuy: 'POST /api/gigaverse/bulk-buy',
                createListing: 'POST /api/create-listing'
            },
            note: 'React app should be running on port 3000 in development'
        });
    });
}

// === ALL ITEM DAY DATA FOR TOOLTIP ===
app.get('/api/item-day-data-all/:itemId', async (req, res) => {
    const { itemId } = req.params;
    
    try {
        console.log(`📊 Fetching ALL ItemDayData for item ${itemId}`);
        
        // Get all ItemDayData with pagination
        let allDayData = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const query = `
                query GetAllItemDayData($itemId: ID!, $skip: Int!, $limit: Int!) {
                    itemDayDatas(
                        where: {item: $itemId}
                        orderBy: dayStartTimestamp
                        orderDirection: desc
                        skip: $skip
                        first: $limit
                    ) {
                        volumeItems
                        volumeETH
                        id
                        dayStartTimestamp
                    }
                }
            `;
            
            const data = await querySubgraph(query, { itemId, skip, limit });
            const dayDatas = data.itemDayDatas || [];
            
            allDayData = allDayData.concat(dayDatas);
            hasMore = dayDatas.length === limit;
            skip += limit;
        }
        
        console.log(`📊 Found ${allDayData.length} day data entries for item ${itemId}`);
        
        // Convert to lookup object by dayStartTimestamp for fast access
        const dayDataLookup = {};
        allDayData.forEach(day => {
            dayDataLookup[day.dayStartTimestamp] = {
                volumeItems: parseInt(day.volumeItems),
                volumeETH: parseFloat(day.volumeETH),
                id: day.id
            };
        });
        
        res.json(dayDataLookup);
        
    } catch (error) {
        console.error('ItemDayData error:', error);
        res.status(500).json({ error: 'Failed to fetch ItemDayData' });
    }
});

// === START SERVER ===
const server = app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`📊 Using subgraph at: ${SUBGRAPH_URL}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔍 All env vars:`, Object.keys(process.env).filter(key => key.startsWith('REACT_APP_') || key.includes('SUBGRAPH')));
    if (process.env.NODE_ENV !== 'production') {
        console.log(`⚡ React app should be running on http://localhost:3000`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated');
    });
});