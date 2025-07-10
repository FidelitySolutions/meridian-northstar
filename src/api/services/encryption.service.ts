/**
 * AES-256-GCM message encryption service.
 * Encryption keys managed via AWS KMS — key ARN read from Secrets Manager at runtime.
 * IV generated per message and stored alongside ciphertext in the messages table.
 *
 * Original implementation: Marcus Webb (Apr 2025, PR #35)
 * Bug introduced: PR #61 (May 2025) — catch block in retrieval path returned empty string on
 *   DecryptionError instead of rethrowing. Identified in INC-2025-001, fixed in PR #94 (Rafael Mendes).
 * Current state: all decryption error paths throw DecryptionError. Do not add catch blocks
 *   here that return empty string — that is the exact pattern that caused the incident.
 */

import { KMSClient, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getKmsKeyArn } from '../utils/kms.util';
import { DecryptionError } from '../utils/errors.util';
import { logger } from '../utils/logger.util';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const kmsClient = new KMSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Encrypt a plaintext string using AES-256-GCM with a KMS-managed data key.
 * Returns the ciphertext, IV, and auth tag — all must be stored to allow decryption.
 */
export async function encrypt(plaintext: string): Promise<EncryptedPayload> {
  const keyArn = await getKmsKeyArn();

  const { Plaintext: dataKey, CiphertextBlob: encryptedDataKey } = await kmsClient.send(
    new GenerateDataKeyCommand({ KeyId: keyArn, KeySpec: 'AES_256' })
  );

  if (!dataKey || !encryptedDataKey) {
    throw new Error('KMS did not return a data key');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(dataKey), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Zero out the plaintext data key from memory
  dataKey.fill(0);

  return { ciphertext, iv, authTag };
}

/**
 * Decrypt a ciphertext payload using AES-256-GCM.
 * ALWAYS throws DecryptionError on failure — never returns empty string.
 * See INC-2025-001 and ADR-003.
 */
export async function decrypt(payload: EncryptedPayload): Promise<string> {
  const { ciphertext, iv, authTag } = payload;
  const keyArn = await getKmsKeyArn();

  let plaintext: string;

  try {
    const { Plaintext: dataKey } = await kmsClient.send(
      new DecryptCommand({ KeyId: keyArn, CiphertextBlob: ciphertext })
    );

    if (!dataKey) {
      throw new DecryptionError('KMS returned no plaintext data key');
    }

    const decipher = createDecipheriv(ALGORITHM, Buffer.from(dataKey), iv);
    decipher.setAuthTag(authTag);

    plaintext = decipher.update(ciphertext) + decipher.final('utf8');

    // Zero out data key
    dataKey.fill(0);
  } catch (err) {
    // Log to CloudWatch so failures are never silent (PR #94 fix — see INC-2025-001)
    logger.error('DecryptionError in encryption.service', { error: String(err) });
    if (err instanceof DecryptionError) {
      throw err;
    }
    throw new DecryptionError(`Decryption failed: ${String(err)}`);
  }

  return plaintext;
}

// feat: complete messaging thread list create send and retriev

// refactor: wrap decrypt call in message retrieval path to pre

// docs: add inline comments to encryption service and stub ser
