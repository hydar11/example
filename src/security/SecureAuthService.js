/**
 * 🔐 Secure Authentication Service
 * Handles secure authentication with Gigaverse API using enterprise security practices
 * 
 * Features:
 * - Automatic token refresh before expiration
 * - Rate limiting for auth requests
 * - Secure token lifecycle management
 * - CSRF protection for sensitive operations
 * - Comprehensive security logging
 */

import { secureTokenManager } from './SecureTokenManager.js';

class SecureAuthService {
    constructor() {
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.rateLimiter = new Map(); // Track auth attempts per address
        this.MAX_AUTH_ATTEMPTS = 5; // Max attempts per 15 minutes
        this.RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * 🔐 Authenticate user with Gigaverse using secure practices
     */
    async authenticateUser(abstractClient, walletAddress) {
        try {
            // Check rate limiting
            if (!this.checkRateLimit(walletAddress)) {
                throw new Error('Too many authentication attempts. Please wait 15 minutes.');
            }

            // Record auth attempt
            this.recordAuthAttempt(walletAddress);

            // Create secure auth message with nonce
            const timestamp = Date.now();
            const nonce = this.generateSecureNonce();
            const authMessage = `Login to Gigaverse at ${timestamp} with nonce ${nonce}`;

            // Sign the auth message with AGW
            const authSignature = await abstractClient.signMessage({
                message: authMessage
            });

            // Authenticate with Gigaverse backend
            const authResponse = await fetch('https://gigaverse.io/api/user/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'X-Client-Version': '2.0',
                    'X-Request-ID': this.generateRequestId()
                },
                body: JSON.stringify({
                    address: walletAddress,
                    message: authMessage,
                    signature: authSignature,
                    timestamp: timestamp,
                    nonce: nonce
                })
            });

            if (!authResponse.ok) {
                throw new Error(`Authentication failed: ${authResponse.status} ${authResponse.statusText}`);
            }

            const authData = await authResponse.json();

            // Validate response structure
            if (!authData.jwt && !authData.token && !authData.authToken) {
                throw new Error('Invalid authentication response: missing token');
            }

            // Store token securely
            const tokenData = {
                jwt: authData.jwt || authData.token || authData.authToken,
                address: walletAddress,
                timestamp: timestamp,
                ...authData
            };

            const storeResult = await secureTokenManager.storeToken(tokenData);

            if (!storeResult.success) {
                throw new Error('Failed to securely store authentication token');
            }

            // Clear rate limiting on successful auth
            this.clearRateLimit(walletAddress);

            return {
                success: true,
                token: tokenData.jwt,
                address: walletAddress,
                expiresAt: storeResult.expiresAt,
                csrfToken: storeResult.csrfToken,
                message: 'Authentication successful'
            };

        } catch (error) {
            console.error('🔒 Secure authentication failed:', error);
            throw error;
        }
    }

    /**
     * 🔄 Refresh authentication token before expiration
     */
    async refreshAuthToken(abstractClient, forceRefresh = false) {
        try {
            // Prevent multiple concurrent refresh attempts
            if (this.isRefreshing && !forceRefresh) {
                return await this.refreshPromise;
            }

            // Check if refresh is needed
            const currentToken = await secureTokenManager.retrieveToken();
            if (!currentToken) {
                throw new Error('No valid token to refresh');
            }

            if (!currentToken.needsRefresh && !forceRefresh) {
                return {
                    success: true,
                    message: 'Token is still valid, no refresh needed',
                    token: currentToken.jwt
                };
            }

            this.isRefreshing = true;
            this.refreshPromise = this.performTokenRefresh(abstractClient, currentToken);

            const result = await this.refreshPromise;
            
            this.isRefreshing = false;
            this.refreshPromise = null;

            return result;

        } catch (error) {
            this.isRefreshing = false;
            this.refreshPromise = null;
            console.error('🔒 Token refresh failed:', error);
            throw error;
        }
    }

    /**
     * 🔄 Perform the actual token refresh
     */
    async performTokenRefresh(abstractClient, currentToken) {
        // Re-authenticate with existing credentials
        return await this.authenticateUser(abstractClient, currentToken.address);
    }

    /**
     * ✅ Validate current authentication status
     */
    async validateAuthStatus() {
        try {
            const tokenData = await secureTokenManager.retrieveToken();
            
            if (!tokenData) {
                return {
                    isValid: false,
                    status: 'No authentication token found',
                    needsAuth: true
                };
            }

            // Additional JWT validation could go here
            // For now, trust the SecureTokenManager's validation

            return {
                isValid: true,
                address: tokenData.address,
                expiresAt: tokenData.expiresAt,
                needsRefresh: tokenData.needsRefresh,
                csrfToken: tokenData.csrfToken,
                status: 'Authentication valid'
            };

        } catch (error) {
            console.error('🔒 Auth validation failed:', error);
            return {
                isValid: false,
                status: 'Authentication validation failed',
                needsAuth: true
            };
        }
    }

    /**
     * 🛡️ Get secure headers for API requests
     */
    async getSecureHeaders(includeBearerToken = true) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'X-Client-Version': '2.0',
            'X-Request-ID': this.generateRequestId()
        };

        if (includeBearerToken) {
            const tokenData = await secureTokenManager.retrieveToken();
            if (tokenData?.jwt) {
                headers['Authorization'] = `Bearer ${tokenData.jwt}`;
                headers['X-CSRF-Token'] = tokenData.csrfToken;
            }
        }

        return headers;
    }

    /**
     * 🔒 Secure logout with complete token cleanup
     */
    async secureLogout() {
        try {
            // Clear all tokens and sensitive data
            secureTokenManager.clearToken();

            // Clear any cached API data
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
            }

            // Clear any session storage
            sessionStorage.clear();

            return {
                success: true,
                message: 'Secure logout completed'
            };

        } catch (error) {
            console.error('🔒 Secure logout failed:', error);
            // Still attempt cleanup even on error
            secureTokenManager.clearToken();
            return {
                success: false,
                message: 'Logout completed with errors',
                error: error.message
            };
        }
    }

    /**
     * 🕐 Check and handle rate limiting
     */
    checkRateLimit(address) {
        const now = Date.now();
        const attempts = this.rateLimiter.get(address) || [];
        
        // Remove attempts older than rate limit window
        const recentAttempts = attempts.filter(timestamp => 
            (now - timestamp) < this.RATE_LIMIT_WINDOW
        );
        
        this.rateLimiter.set(address, recentAttempts);
        
        return recentAttempts.length < this.MAX_AUTH_ATTEMPTS;
    }

    /**
     * 📝 Record authentication attempt
     */
    recordAuthAttempt(address) {
        const attempts = this.rateLimiter.get(address) || [];
        attempts.push(Date.now());
        this.rateLimiter.set(address, attempts);
    }

    /**
     * 🧹 Clear rate limiting for address
     */
    clearRateLimit(address) {
        this.rateLimiter.delete(address);
    }

    /**
     * 🎲 Generate cryptographically secure nonce
     */
    generateSecureNonce() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 📋 Generate unique request ID for tracing
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 📊 Get authentication status summary
     */
    async getAuthStatusSummary() {
        const tokenStatus = await secureTokenManager.getTokenStatus();
        const rateLimitStatus = Object.fromEntries(
            Array.from(this.rateLimiter.entries()).map(([address, attempts]) => [
                address,
                {
                    attempts: attempts.length,
                    nextAttemptAllowed: attempts.length >= this.MAX_AUTH_ATTEMPTS
                        ? new Date(Math.max(...attempts) + this.RATE_LIMIT_WINDOW).toISOString()
                        : 'Now'
                }
            ])
        );

        return {
            token: tokenStatus,
            rateLimits: rateLimitStatus,
            isRefreshing: this.isRefreshing,
            securityFeatures: {
                encryption: 'AES-256-GCM',
                csrfProtection: true,
                rateLimiting: true,
                automaticRefresh: true,
                secureStorage: true
            }
        };
    }
}

// Export singleton instance
export const secureAuthService = new SecureAuthService();