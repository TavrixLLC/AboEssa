import { HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { AppException } from 'src/common/exceptions/app.exception';
import {
  RetrievedObject,
  StorageProvider,
  StoredObject,
} from 'src/files/storage-provider.interface';

type StorageError = Error & { code?: string; $metadata?: { httpStatusCode?: number } };

@Injectable()
export class MinioStorageProvider implements StorageProvider, OnModuleInit, OnModuleDestroy {
  // Keep the injection identity, object keys and API URLs unchanged. Only the
  // S3-compatible transport changes; storage remains the existing MinIO server.
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.minio.bucket') ?? 'aboessa-media';
    const host = config.get<string>('storage.minio.endpoint') ?? 'localhost';
    const port = config.get<number>('storage.minio.port') ?? 9000;
    const ssl = config.get<boolean>('storage.minio.useSsl') ?? false;
    const accessKeyId = config.get<string>('storage.minio.accessKey') ?? 'minioadmin';
    const secretAccessKey = config.get<string>('storage.minio.secretKey') ?? 'minioadmin';
    if (
      config.get<string>('NODE_ENV') === 'production' &&
      (!accessKeyId ||
        !secretAccessKey ||
        accessKeyId === 'minioadmin' ||
        secretAccessKey === 'minioadmin')
    ) {
      throw new Error('STORAGE_PRODUCTION_CREDENTIALS_REQUIRED');
    }
    const authority = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    this.client = new S3Client({
      endpoint: `${ssl ? 'https' : 'http'}://${authority}:${port}`,
      region: config.get<string>('storage.minio.region') ?? 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      // A single transport attempt: workflow idempotency/retry remains in the
      // owning service, not hidden inside an SDK. No AWS credential discovery.
      maxAttempts: 1,
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const e = error as StorageError;
      if (e.$metadata?.httpStatusCode !== 404 && e.name !== 'NoSuchBucket') throw error;
      // Never turn AccessDenied, network/TLS failure or authentication error
      // into a bucket-creation attempt. Existing bucket policy is not changed.
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    mimeType: string;
    size: number;
  }): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentLength: input.size,
        ContentType: input.mimeType,
      }),
    );
    return {
      key: input.key,
      url: `/api/media/${input.key}`,
      mimeType: input.mimeType,
      size: input.size,
    };
  }

  async getObject(key: string): Promise<RetrievedObject> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!(object.Body instanceof Readable)) throw new Error('STORAGE_RESPONSE_STREAM_INVALID');
      if (!Number.isSafeInteger(object.ContentLength) || object.ContentLength! < 0) {
        object.Body.destroy();
        throw new Error('STORAGE_RESPONSE_LENGTH_INVALID');
      }
      return {
        stream: object.Body,
        mimeType: object.ContentType ?? 'application/octet-stream',
        size: object.ContentLength!,
      };
    } catch (error) {
      const e = error as StorageError;
      if (
        e.name === 'NoSuchKey' ||
        e.code === 'NoSuchKey' ||
        e.code === 'NoSuchObject' ||
        e.$metadata?.httpStatusCode === 404
      ) {
        throw new AppException('Media was not found', 'MEDIA_NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async removeObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  onModuleDestroy() {
    this.client.destroy();
  }
}
