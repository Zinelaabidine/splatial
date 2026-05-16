"use client";
import { useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { authenticatedFetch } from '@/utils/apiClient';

export default function Home() {
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Trigger function to test secure API communication
  const handleCallApi = async () => {
    setLoading(true);
    setApiResponse(null);
    try {
      // NOTE: Replace '/' with your specific API Gateway resource path if applicable (e.g., '/hello')
      const data = await authenticatedFetch('/helloFromLambda'); 
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (error: any) {
      setApiResponse(`API Request Failed: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <Authenticator>
        {({ signOut, user }) => (
          <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <h1 className="text-2xl font-bold mb-4 text-gray-800">
              Welcome to the Platform
            </h1>
            <p className="mb-6 text-gray-600">
              Authenticated as: <span className="font-mono bg-gray-100 px-2 py-1 rounded block truncate mt-1">{user?.username}</span>
            </p>

            {/* Section to verify JWT attachment and execution */}
            <div className="mb-6 border-t pt-4 text-left">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                DevOps Integration Pipeline
              </h2>
              <button
                onClick={handleCallApi}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:bg-blue-300"
              >
                {loading ? "Fetching Token & Executing..." : "Execute Secure Lambda API Request"}
              </button>

              {apiResponse && (
                <div className="mt-4 p-3 bg-gray-900 text-green-400 font-mono text-xs rounded overflow-x-auto max-h-48 text-left whitespace-pre-wrap border border-gray-800">
                  {apiResponse}
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <button 
                onClick={signOut}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </Authenticator>
    </main>
  );
}