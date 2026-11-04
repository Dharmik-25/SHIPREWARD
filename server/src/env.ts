import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Robust environment loader for SHIPREWARD.
 * Reliably loads .env regardless of working directory or launch method.
 */
function loadEnvironment() {
  const candidatePaths = [
    path.resolve(process.cwd(), 'server/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../server/.env'),
    path.resolve(__dirname, '../../../server/.env')
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      break;
    }
  }

  // Sanitize and trim environment variables if present
  if (process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN.trim();
  }
  if (process.env.GITHUB_WEBHOOK_SECRET) {
    process.env.GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET.trim();
  }
}

loadEnvironment();

