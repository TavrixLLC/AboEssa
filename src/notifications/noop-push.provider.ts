import { Injectable } from '@nestjs/common';
import { PushProvider, PushSendResult } from 'src/notifications/push-provider.interface';

@Injectable()
export class NoopPushProvider implements PushProvider {
  readonly enabled = false;

  async send(): Promise<PushSendResult> {
    return { status: 'PERMANENT_FAILURE', code: 'PUSH_PROVIDER_DISABLED' };
  }
}
