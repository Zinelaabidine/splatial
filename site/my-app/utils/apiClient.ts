import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * A secure fetch wrapper that automatically injects the Cognito JWT token 
 * and handles silent token refreshing seamlessly.
 */
export async function authenticatedFetch(endpoint: string, options: RequestInit = {}) {
  try {
    // 1. Retrieve the current auth session.
    // CRITICAL DEVOPS NOTE: fetchAuthSession() automatically evaluates token expiration.
    // If the token is expired, it silently uses the Refresh Token to negotiate a new 
    // JWT with Cognito before continuing. This satisfies your 'silent refresh' requirement.
    const session = await fetchAuthSession();
    const jwtToken = session.tokens?.idToken?.toString();

    if (!jwtToken) {
      throw new Error("No active session or valid JWT token found.");
    }

    // 2. Build the target URL using your API Gateway environment variable
    const baseUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL?.replace(/\/$/, '');
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    // 3. Merge headers, injecting the JWT token into the Authorization header
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
      ...options.headers,
    };

    // 4. Execute the network request to your API Gateway
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Authenticated API call failed:", error);
    throw error;
  }
}