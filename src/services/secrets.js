const crypto = require('node:crypto');

const SOURCE_KEY = process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'troque-esta-chave-no-arquivo-env';
const KEY = crypto.createHash('sha256').update(String(SOURCE_KEY)).digest();
const PREFIX = 'enc:v1:';

function encryptValue(value) {
  const plain = String(value || '');
  if (!plain || plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptValue(value) {
  const encoded = String(value || '');
  if (!encoded.startsWith(PREFIX)) return encoded;
  try {
    const [ivPart, tagPart, dataPart] = encoded.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function encryptConfig(config = {}) {
  const next = { ...config };
  for (const key of ['apiKey', 'instanceToken', 'webhookSecret', 'cloudToken', 'appSecret']) {
    if (next[key]) next[key] = encryptValue(next[key]);
  }
  return next;
}

function decryptConfig(config = {}) {
  const next = { ...config };
  for (const key of ['apiKey', 'instanceToken', 'webhookSecret', 'cloudToken', 'appSecret']) {
    if (next[key]) next[key] = decryptValue(next[key]);
  }
  return next;
}

module.exports = { encryptValue, decryptValue, encryptConfig, decryptConfig };
