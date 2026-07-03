const crypto = require('node:crypto');

console.log(`JWT_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`APP_ENCRYPTION_KEY=${crypto.randomBytes(48).toString('base64url')}`);
