const getDefaultApiUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://autoquiz-pro.onrender.com/api/v1';
  }
  return 'http://localhost:5000/api/v1';
};

const API_BASE_URL = getDefaultApiUrl();

export const checkApiHealth = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    return {
      status: 'error',
      message: error.message || 'Failed to connect to backend server'
    };
  }
};

export const validateInvitationCode = async (code) => {
  const res = await fetch(`${API_BASE_URL}/auth/validate-invitation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  return await res.json();
};
