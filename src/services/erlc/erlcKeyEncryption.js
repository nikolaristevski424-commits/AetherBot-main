import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ENCRYPTED_KEY_PREFIX = 'aether-enc:v1:';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(secret, salt) {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('ERLC_KEY_ENCRYPTION_SECRET must be set to a random value at least 32 characters long.');
    }
    return scryptSync(secret, salt, KEY_LENGTH);
}

export function isEncryptedErlcKey(value) {
    return typeof value === 'string' && value.startsWith(ENCRYPTED_KEY_PREFIX);
}

export function encryptErlcKey(value, secret = process.env.ERLC_KEY_ENCRYPTION_SECRET) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError('ER:LC server key must be a non-empty string.');
    }

    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${ENCRYPTED_KEY_PREFIX}${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptErlcKey(value, secret = process.env.ERLC_KEY_ENCRYPTION_SECRET) {
    if (!isEncryptedErlcKey(value)) return value;

    const parts = value.slice(ENCRYPTED_KEY_PREFIX.length).split(':');
    if (parts.length !== 4) throw new Error('Stored ER:LC key has an invalid encrypted format.');

    const [saltHex, ivHex, tagHex, ciphertextHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || ciphertext.length === 0) {
        throw new Error('Stored ER:LC key has an invalid encrypted format.');
    }

    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}