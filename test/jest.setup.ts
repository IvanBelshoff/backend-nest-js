import 'dotenv/config';

process.env.NODE_ENV ??= 'test';
process.env.REFRESH_TOKEN_PEPPER ??=
  'test-refresh-token-pepper-with-32-chars-min';
process.env.CORS_ORIGIN ??= 'http://localhost:3000';
