import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { MinioStorageProvider } from 'src/files/minio-storage.provider';

const mockSend = jest.fn<Promise<unknown>, [unknown]>();
const mockDestroy = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  ...jest.requireActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3'),
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend, destroy: mockDestroy })),
}));
const config = (extra: Record<string, unknown> = {}) =>
  new ConfigService({
    NODE_ENV: 'test',
    storage: {
      minio: {
        endpoint: '127.0.0.1',
        port: 59057,
        useSsl: false,
        accessKey: 'test-account',
        secretKey: 'synthetic-credentials',
        bucket: 'private-qa',
      },
    },
    ...extra,
  });

describe('MinIO S3 transport replacement contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
  });
  it('uses the existing configured endpoint, explicit credentials, path style and one attempt', () => {
    new MinioStorageProvider(config());
    expect(jest.mocked(S3Client).mock.calls[0]?.[0]).toMatchObject({
      endpoint: 'http://127.0.0.1:59057',
      region: 'us-east-1',
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: { accessKeyId: 'test-account', secretAccessKey: 'synthetic-credentials' },
    });
  });
  it('never reconfigures policy or recreates an existing private bucket', async () => {
    mockSend.mockResolvedValue({});
    await new MinioStorageProvider(config()).onModuleInit();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
  });
  it('creates only a confirmed missing bucket', async () => {
    mockSend
      .mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })
      .mockResolvedValueOnce({});
    await new MinioStorageProvider(config()).onModuleInit();
    expect(mockSend.mock.calls[1]?.[0]).toBeInstanceOf(CreateBucketCommand);
  });
  it.each([{ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }, { name: 'TimeoutError' }])(
    'does not mistake authentication/transport failure for absence: %j',
    async (error) => {
      mockSend.mockRejectedValue(error);
      await expect(new MinioStorageProvider(config()).onModuleInit()).rejects.toBe(error);
      expect(mockSend).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves original bytes, MIME, size, object key and legacy API URL without setting public ACL', async () => {
    mockSend.mockResolvedValue({});
    const body = Buffer.from([0, 254, 18]);
    const result = await new MinioStorageProvider(config()).putObject({
      key: 'products/intake-private.webp',
      body,
      mimeType: 'image/webp',
      size: body.length,
    });
    const command = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'private-qa',
      Key: 'products/intake-private.webp',
      Body: body,
      ContentLength: 3,
      ContentType: 'image/webp',
    });
    expect(result).toEqual({
      key: 'products/intake-private.webp',
      url: '/api/media/products/intake-private.webp',
      mimeType: 'image/webp',
      size: 3,
    });
  });
  it('reads authoritative size/type and stream in one GET, not a racy HEAD/GET pair', async () => {
    const stream = Readable.from(Buffer.from('abc'));
    mockSend.mockResolvedValue({ Body: stream, ContentLength: 3, ContentType: 'image/jpeg' });
    const result = await new MinioStorageProvider(config()).getObject('products/a.jpg');
    expect(result).toEqual({ stream, size: 3, mimeType: 'image/jpeg' });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
  });
  it('maps missing-object response to the existing MEDIA_NOT_FOUND contract', async () => {
    mockSend.mockRejectedValue({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
    await expect(new MinioStorageProvider(config()).getObject('absent')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('does not conceal permission failures as missing media', async () => {
    const error = new Error('AccessDenied');
    mockSend.mockRejectedValue(error);
    await expect(new MinioStorageProvider(config()).getObject('denied')).rejects.toBe(error);
  });
  it('closes an invalid-length response instead of leaking its stream', async () => {
    const stream = Readable.from(Buffer.from('abc'));
    mockSend.mockResolvedValue({ Body: stream });
    await expect(new MinioStorageProvider(config()).getObject('bad')).rejects.toThrow(
      'STORAGE_RESPONSE_LENGTH_INVALID',
    );
    expect(stream.destroyed).toBe(true);
  });
  it('preserves delete identity and closes SDK resources on shutdown', async () => {
    mockSend.mockResolvedValue({});
    const provider = new MinioStorageProvider(config());
    await provider.removeObject('products/a.jpg');
    const command = mockSend.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command.input).toEqual({ Bucket: 'private-qa', Key: 'products/a.jpg' });
    provider.onModuleDestroy();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
  it('rejects implicit default storage credentials in production', () => {
    expect(() => new MinioStorageProvider(new ConfigService({ NODE_ENV: 'production' }))).toThrow(
      'STORAGE_PRODUCTION_CREDENTIALS_REQUIRED',
    );
  });
});
