import React, { useState, useEffect } from 'react';
import { 
  useLoginWithAbstract, 
  useAbstractClient, 
  useGlobalWalletSignerAccount
} from '@abstract-foundation/agw-react';
import { useAccount, useDisconnect } from 'wagmi';

const AGWConnection = ({ 
  onConnectionSuccess, 
  onConnectionError,
  onDisconnect,
  buttonStyle = {},
  connectedButtonStyle = {},
  showButton = true,
  connectedText = "AGW Connected",
  connectingText = "Connecting...",
  connectText = "🌟 Connect AGW"
}) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [wasConnected, setWasConnected] = useState(false);

  // AGW hooks
  const { login } = useLoginWithAbstract();
  const { data: abstractClient } = useAbstractClient(); // Use .data to get actual client
  const { address: agwAddress, status: agwStatus } = useGlobalWalletSignerAccount(); // Use address and status directly
  
  // Wagmi hooks
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  // Handle AGW connection
  const handleConnect = async () => {
    if (loading) return;
    
    setLoading(true);
    
    try {
      await login();
      // Don't call onConnectionSuccess here - let the useEffect handle it when actually connected
      
    } catch (error) {
      console.error('❌ AGW connection failed:', error);
      const errorMessage = `Connection failed: ${error.message}`;
      
      if (onConnectionError) {
        onConnectionError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle AGW disconnection with session clearing
  const handleDisconnect = async () => {
    if (loading) return;
    
    setLoading(true);
    
    try {
      // 1. Clear AGW/Privy localStorage immediately
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('privy') || key.includes('wagmi') || key.includes('agw'))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // 2. Clear server-side Gigaverse auth token
      try {
        await fetch('/api/auth/clear-token', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (authError) {
        // Expected if not authenticated
      }
      
      // 3. Clear client-side state
      if (onDisconnect) {
        onDisconnect();
      }
      
      // 4. Force AGW logout
      try {
        await disconnect();
      } catch (disconnectError) {
        // Handle disconnect error silently
      }
      
    } catch (error) {
      console.error('❌ Disconnect error:', error);
      if (onConnectionError) {
        onConnectionError(`Disconnect error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Setup tab close session clearing
  useEffect(() => {
    const clearSessionsOnTabClose = () => {
      // Clear data when tab/window is closing
      const handleBeforeUnload = async (event) => {
        console.log('🔄 Tab closing - clearing all sessions...');
        
        // 1. Clear AGW/Privy localStorage immediately
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('privy') || key.includes('wagmi') || key.includes('agw'))) {
            keysToRemove.push(key);
          }
        }
        
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
        });
        
        // 2. Clear server-side auth token  
        try {
          await fetch('/api/auth/clear-token', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (error) {
          // Handle auth clearing error silently
        }
        
        // 3. Force AGW logout
        try {
          await disconnect();
        } catch (error) {
          // Handle disconnect error silently
        }
      };
      
      // Also handle visibility change (when tab becomes hidden)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          handleBeforeUnload();
        }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    };
    
    clearSessionsOnTabClose();
  }, []); // Empty dependency array - only runs on mount

  // Notify parent of connection changes - only once when connected
  useEffect(() => {
    
    // Use agwAddress and check status
    const agwConnected = abstractClient && agwAddress && agwStatus === 'connected';
    
    if (agwConnected && onConnectionSuccess && !wasConnected) {
      // Only trigger if we weren't connected before (prevent spam)
      setWasConnected(true);
      onConnectionSuccess({ 
        abstractClient, 
        address: agwAddress, 
        isConnected: true 
      });
    } else if (!agwConnected && wasConnected) {
      // Reset when disconnected
      setWasConnected(false);
    }
  }, [abstractClient, agwAddress, agwStatus, onConnectionSuccess, wasConnected]);

  return (
    <>
      {/* Connection Button - no internal messages to prevent layout break */}
      {showButton && (
        <>
          {!isConnected ? (
            <button 
              onClick={handleConnect}
              disabled={loading}
              style={{
                padding: '8px 12px',
                backgroundColor: 'transparent',
                color: 'var(--fg)',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 'normal',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'background-color 0.2s ease',
                ...buttonStyle
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 255, 0, 0.5)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              {loading ? connectingText : connectText}
            </button>
          ) : (
            <button 
              onClick={handleDisconnect}
              disabled={loading}
              style={{
                padding: '8px 12px',
                backgroundColor: 'transparent',
                color: 'var(--fg)',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 'normal',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                ...connectedButtonStyle
              }}
            >
              {loading ? (
                'Disconnecting...'
              ) : (
                <>
                  <img 
                    src="https://abscan.org/assets/abstract/images/svg/logos/chain-dark.svg?v=25.8.1.2" 
                    alt="Abstract" 
                    style={{ width: '14px', height: '14px' }}
                  />
                  Connected {address && `${address.slice(0, 6)}...${address.slice(-4)}`}
                </>
              )}
            </button>
          )}
        </>
      )}
    </>
  );
};

export default AGWConnection;