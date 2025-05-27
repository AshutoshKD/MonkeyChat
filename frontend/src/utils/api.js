import { BASE_URL } from '../config';

// Helper function to get the authentication token
const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Helper function to get the default headers with authentication
const getAuthHeaders = () => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// API request helper function
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  } catch (error) {
    throw error;
  }
};

// WebSocket URL helper
export const getWebSocketUrl = () => {
  const token = getAuthToken();
  return token 
    ? `${BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')}/ws?token=${token}` 
    : `${BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`;
}; 