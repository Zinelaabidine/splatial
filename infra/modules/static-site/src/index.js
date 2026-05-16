'use strict';

// Lambda proxy integration (API Gateway HTTP API payload v2.0)
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: 'Hello from Lambda' }),
  };
};
