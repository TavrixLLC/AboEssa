import { Injectable } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { PushProvider, PushSendResult } from 'src/notifications/push-provider.interface';

const invalidTokenCodes = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const transientCodes = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/quota-exceeded',
  'messaging/unknown-error',
]);

export class TransientPushError extends Error {
  constructor(readonly safeCode: string) {
    super('Transient push provider failure');
  }
}

@Injectable()
export class FirebasePushProvider implements PushProvider {
  readonly enabled = true;

  constructor(serviceAccountFile: string, projectId?: string) {
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountFile, 'utf8')) as object;
      initializeApp({ credential: cert(serviceAccount), projectId });
    }
  }

  async send(input: {
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }): Promise<PushSendResult> {
    try {
      await getMessaging().send({
        token: input.token,
        notification: { title: input.title, body: input.body },
        data: input.data,
        android: {
          priority: 'high',
          notification: { channelId: 'aboessa_customer_notifications' },
        },
      });
      return { status: 'SENT' };
    } catch (error) {
      const code = this.safeCode(error);
      if (invalidTokenCodes.has(code)) return { status: 'INVALID_TOKEN', code };
      if (transientCodes.has(code)) throw new TransientPushError(code);
      return { status: 'PERMANENT_FAILURE', code };
    }
  }

  private safeCode(error: unknown) {
    const value = error as { code?: unknown };
    return typeof value?.code === 'string' && /^messaging\/[a-z0-9-]+$/.test(value.code)
      ? value.code
      : 'messaging/provider-error';
  }
}
