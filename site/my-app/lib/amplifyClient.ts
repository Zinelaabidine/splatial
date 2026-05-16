'use client';

import { Amplify } from 'aws-amplify';

let configured = false;

export function configureAmplify() {
  if (configured || typeof window === 'undefined') {
    return;
  }

  const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_CLIENT_ID;
  const apiEndpoint = process.env.NEXT_PUBLIC_API_GATEWAY_URL;

  if (!userPoolId || !userPoolClientId) {
    console.error(
      'Missing Amplify Auth env vars: NEXT_PUBLIC_USER_POOL_ID and NEXT_PUBLIC_CLIENT_ID.',
    );
    return;
  }

  const amplifyConfig: {
    Auth: {
      Cognito: {
        userPoolId: string;
        userPoolClientId: string;
        loginWith: { email: true };
      };
    };
    API?: {
      REST: {
        MyAPIGatewayAPI: {
          endpoint: string;
        };
      };
    };
  } = {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          email: true,
        },
      },
    },
  };

  if (apiEndpoint) {
    amplifyConfig.API = {
      REST: {
        MyAPIGatewayAPI: {
          endpoint: apiEndpoint,
        },
      },
    };
  } else {
    console.error(
      'Missing Amplify API env var: NEXT_PUBLIC_API_GATEWAY_URL.',
    );
  }

  Amplify.configure(amplifyConfig);
  configured = true;
}
