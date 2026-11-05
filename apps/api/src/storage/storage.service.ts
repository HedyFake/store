import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { env, storageDir } from '../config/env';

const KEY_RE = /^(payment-proofs|shipment-docs)\/[a-zA-Z0-9-]{1,64}\/[a-f0-9-]{36}\.(jpg|png|pdf)$/;
const PUBLIC_RE = /^[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/;

/**
 * Private storage adapter. Local mode writes to STORAGE_LOCAL_DIR/private, which is never served statically;
 * files are only streamed through authorized API handlers. S3 mode uses a private bucket + short-lived signed URLs.
 */
@Injectable()
export class StorageService {
  private s3: S3Client | null = null;

  private get mode() {
    return env().STORAGE_PROVIDER;
  }

  private client(): S3Client {
    if (!this.s3) {
      const e = env();
      if (!e.S3_BUCKET_PRIVATE || !e.S3_ACCESS_KEY_ID) throw new Error('S3 belum dikonfigurasi');
      this.s3 = new S3Client({
        region: e.S3_REGION || 'auto',
        endpoint: e.S3_ENDPOINT || undefined,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
      });
    }
    return this.s3;
  }

  newKey(prefix: 'payment-proofs' | 'shipment-docs', scopeId: string, ext: string): string {
    return `${prefix}/${scopeId}/${randomUUID()}.${ext}`;
  }

  private localPath(key: string): string {
    if (!KEY_RE.test(key)) throw new Error('Storage key tidak valid');
    const base = path.join(storageDir(), 'private');
    const full = path.resolve(base, key);
    if (!full.startsWith(path.resolve(base) + path.sep)) throw new Error('Path traversal');
    return full;
  }

  async putPrivate(key: string, body: Buffer, mime: string): Promise<void> {
    if (this.mode === 's3') {
      await this.client().send(
        new PutObjectCommand({
          Bucket: env().S3_BUCKET_PRIVATE,
          Key: key,
          Body: body,
          ContentType: mime,
          CacheControl: 'private, no-store',
          ContentDisposition: 'attachment',
          ServerSideEncryption: 'AES256',
        }),
      );
      return;
    }
    const p = this.localPath(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, body, { flag: 'wx' });
  }

  async readPrivate(key: string): Promise<Buffer> {
    if (this.mode === 's3') {
      const res = await this.client().send(new GetObjectCommand({ Bucket: env().S3_BUCKET_PRIVATE, Key: key }));
      const chunks: Buffer[] = [];
      for await (const c of res.Body as Readable) chunks.push(Buffer.from(c));
      return Buffer.concat(chunks);
    }
    try {
      return await fs.promises.readFile(this.localPath(key));
    } catch {
      throw new NotFoundException('File tidak ditemukan');
    }
  }

  /** For S3 returns a 60-second signed URL; for local returns null (caller streams the file). */
  async signedUrl(key: string, downloadName: string): Promise<string | null> {
    if (this.mode !== 's3') return null;
    return getSignedUrl(
      this.client(),
      new GetObjectCommand({
        Bucket: env().S3_BUCKET_PRIVATE,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${downloadName.replace(/"/g, '')}"`,
      }),
      { expiresIn: 60 },
    );
  }

  async deletePrivate(key: string): Promise<void> {
    try {
      if (this.mode === 's3') {
        await this.client().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET_PRIVATE, Key: key }));
      } else {
        await fs.promises.unlink(this.localPath(key));
      }
    } catch {
      /* best effort cleanup */
    }
  }

  // ── Public media (CMS banners, QRIS image, logo, product photos/videos). Served via /api/media/:file
  async putPublic(body: Buffer, ext: 'jpg' | 'png' | 'webp' | 'mp4' | 'webm'): Promise<string> {
    const file = `${randomUUID()}.${ext}`;
    const dir = path.join(storageDir(), 'public');
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, file), body, { flag: 'wx' });
    return file;
  }

  publicPath(file: string): string {
    if (!PUBLIC_RE.test(file)) throw new NotFoundException();
    return path.join(storageDir(), 'public', file);
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}

