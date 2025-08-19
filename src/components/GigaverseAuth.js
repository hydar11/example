import React, { useState, useEffect } from 'react';

const GigaverseAuth = ({ 
  abstractClient, 
  walletAddress, 
  isWalletConnected, 
  authToken,
  onAuthSuccess, 
  onAuthError,
  buttonStyle = {},
  showButton = true 
}) => {
  const [localAuthToken, setLocalAuthToken] = useState(authToken);
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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
          setLocalAuthToken(tokenData.jwt);
          if (onAuthSuccess) {
            onAuthSuccess(tokenData.jwt);
          }
          return tokenData.jwt;
        }
      }
      
      // Clean up any legacy client-side tokens (security cleanup)
      const authData = localStorage.getItem('gigaverse_auth');
      if (authData) {
        localStorage.removeItem('gigaverse_auth');
        console.log('🔒 Security cleanup: removed legacy client-side token');
      }
      
      return null;
    } catch (error) {
      console.error('🔒 Error retrieving server auth token:', error);
      return null;
    }
  };

  // Clear auth tokens on mount to prevent stale sessions
  useEffect(() => {
    const clearAuthTokens = async () => {
      try {
        await fetch('/api/auth/clear-token', {
          method: 'POST',
          credentials: 'include'
        });
        console.log('🔥 Gigaverse auth tokens cleared on component mount');
      } catch (error) {
        console.log('Auth clearing error (expected on fresh load):', error.message);
      }
    };
    
    clearAuthTokens();
  }, []); // Only run once on mount

  // Load auth token when wallet changes
  useEffect(() => {
    if (walletAddress) {
      getGigaverseAuthToken();
    }
  }, [walletAddress]);

  // Sync with parent auth token
  useEffect(() => {
    setLocalAuthToken(authToken);
  }, [authToken]);


  // Authenticate with Gigaverse using centralized logic
  const authenticateWithGigaverse = async () => {
    if (!abstractClient || !walletAddress) {
      if (onAuthError) {
        onAuthError('Please connect AGW wallet first');
      }
      return;
    }
    
    setIsAuthenticating(true);
    
    try {
      // Step 1: Create auth message like native app
      const timestamp = Date.now();
      const authMessage = `Login to Gigaverse at ${timestamp}`;
      
      // Step 2: Sign the auth message with AGW
      const authSignature = await abstractClient.signMessage({
        message: authMessage
      });
      
      // Step 3: Authenticate with Gigaverse backend
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
      
      // Store auth token securely on SERVER-ONLY (HTTP-only cookies)
      const storedAuthData = {
        ...authData,
        address: walletAddress,
        timestamp: timestamp,
        jwt: authData.jwt || authData.token || authData.authToken || authData.accessToken
      };
      
      // Get CSRF token first (same as sell block)
      const csrfResponse = await fetch('/api/auth/csrf-token', {
        method: 'POST',
        credentials: 'include'
      });
      const csrfData = await csrfResponse.json();
      
      // Store token securely on server-side in HTTP-only cookie (same as sell block)
      const storeResponse = await fetch('/api/auth/store-token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': csrfData.csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          jwt: storedAuthData.jwt,
          address: walletAddress,
          timestamp: timestamp
        })
      });
      
      if (!storeResponse.ok) {
        const errorText = await storeResponse.text();
        console.error('Store token error:', errorText);
        throw new Error('Failed to store authentication token');
      }
      
      const token = storedAuthData.jwt;
      setLocalAuthToken(token);
      setShowAuthPopup(false);
      
      // Notify parent components of successful auth
      if (onAuthSuccess) {
        onAuthSuccess(token);
      }
      
      return authData;
      
    } catch (error) {
      console.error('❌ Gigaverse auth error:', error);
      if (onAuthError) {
        onAuthError(error.message);
      }
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  };


  // Auth info popup component
  const AuthPopup = () => (
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
            disabled={isAuthenticating}
            style={{
              padding: 'calc(var(--s) * 1.5) calc(var(--s) * 2)',
              backgroundColor: 'var(--success)',
              color: 'white',
              border: 'none',
              borderRadius: 'calc(var(--r) - 2px)',
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              fontSize: '0.7rem',
              fontWeight: '700',
              opacity: isAuthenticating ? 0.7 : 1
            }}
          >
            {isAuthenticating ? '🔄 Authenticating...' : '🔒 Login to Gigaverse'}
          </button>
          <button
            onClick={() => setShowAuthPopup(false)}
            disabled={isAuthenticating}
            style={{
              padding: 'calc(var(--s) * 1.5) calc(var(--s) * 2)',
              backgroundColor: 'var(--muted)',
              color: 'var(--fg)',
              border: 'none',
              borderRadius: 'calc(var(--r) - 2px)',
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              fontSize: '0.7rem',
              fontWeight: '700',
              opacity: isAuthenticating ? 0.7 : 1
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Auth button - only show if needed */}
      {showButton && !localAuthToken && (
        <button 
          onClick={() => setShowAuthPopup(true)}
          disabled={isAuthenticating}
          style={{
            padding: '4px 8px',
            backgroundColor: 'var(--success)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '0.65rem',
            fontWeight: 'bold',
            cursor: isAuthenticating ? 'not-allowed' : 'pointer',
            opacity: isAuthenticating ? 0.7 : 1,
            ...buttonStyle
          }}
        >
          {isAuthenticating ? '🔄 Auth...' : '🔑 Gigaverse Login'}
        </button>
      )}

      {/* Auth popup */}
      {showAuthPopup && <AuthPopup />}
    </>
  );
};

export default GigaverseAuth;