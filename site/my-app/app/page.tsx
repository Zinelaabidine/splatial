"use client";
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <Authenticator>
        {({ signOut, user }) => (
          <div className="text-center bg-white p-8 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold mb-4 text-gray-800">
              Welcome to the Platform
            </h1>
            <p className="mb-6 text-gray-600">
              Authenticated as: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{user?.username}</span>
            </p>
            <button 
              onClick={signOut}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </Authenticator>
    </main>
  );
}
