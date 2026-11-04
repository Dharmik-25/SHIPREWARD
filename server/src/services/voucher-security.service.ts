import crypto from 'node:crypto';

export interface VoucherSecretPayload {
  code: string;
  pin?: string;
  link?: string;
  instructions?: string;
}

export interface EncryptedVoucherEnvelope {
  encryptedPayload: string;
  iv: string;
  authTag: string;
}

export class VoucherSecurityService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly SALT = 'shipreward-voucher-salt-2026';

  /**
   * Derives a cryptographic 256-bit key from the separate VOUCHER_ENCRYPTION_KEY environment variable.
   * Strictly avoids deriving from BITREFILL_API_KEY.
   */
  public static getEncryptionKey(): Buffer {
    const key = (process.env.VOUCHER_ENCRYPTION_KEY || '').trim();
    if (!key || key.length < 32) {
      throw new Error('VOUCHER_ENCRYPTION_KEY is missing or invalid. A dedicated 256-bit encryption key is required in server/.env.');
    }
    // If 64 hex chars, parse directly as 32-byte key; otherwise derive via scrypt
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      return Buffer.from(key, 'hex');
    }
    return crypto.scryptSync(key, this.SALT, 32);
  }

  /**
   * Verifies that the encryption subsystem is healthy and operable before purchasing.
   */
  public static verifyEncryptionHealth(): boolean {
    const testPayload: VoucherSecretPayload = {
      code: 'TEST-PREFLIGHT-CHECK',
      instructions: 'Preflight health check'
    };
    const envelope = this.encrypt(testPayload);
    const decrypted = this.decrypt(envelope);
    return decrypted.code === testPayload.code;
  }

  /**
   * Encrypts a sensitive voucher redemption payload using AES-256-GCM.
   */
  public static encrypt(payload: VoucherSecretPayload): EncryptedVoucherEnvelope {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12); // Recommended 96-bit IV for GCM
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    const plaintext = JSON.stringify(payload);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encryptedPayload: encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  /**
   * Decrypts an encrypted voucher envelope and returns the original redemption payload.
   */
  public static decrypt(envelope: EncryptedVoucherEnvelope): VoucherSecretPayload {
    const key = this.getEncryptionKey();
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(envelope.encryptedPayload, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as VoucherSecretPayload;
  }

  /**
   * Reversibly masks a voucher code for secure dashboard visualization without leaking secrets.
   * Format: SWIGGY-••••-••••-9821
   */
  public static maskCode(code: string): string {
    if (!code || code.length < 8) return '••••-••••';
    const last4 = code.slice(-4);
    const prefix = code.split('-')[0] || 'REWARD';
    return `${prefix}-••••-••••-${last4}`;
  }
}
