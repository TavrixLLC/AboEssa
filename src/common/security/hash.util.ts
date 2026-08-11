import { createHash } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hashRequestMetadata = (value?: string | string[]) => {
  if (!value) {
    return undefined;
  }

  return sha256(Array.isArray(value) ? value.join(',') : value);
};

