// Prints fresh random secrets for a production deployment. Run:  node scripts/gen-secrets.mjs
// Paste the values into Vercel -> Project -> Settings -> Environment Variables. Never commit them.
import { randomBytes } from 'node:crypto';

const hex = (n) => randomBytes(n).toString('hex');
console.log(`SESSION_SECRET=${randomBytes(48).toString('base64url')}`);
console.log(`ID_HASH_SALT=${hex(24)}`);
console.log(`CRON_SECRET=${hex(24)}`);
