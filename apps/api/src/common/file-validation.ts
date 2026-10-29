import 'multer';

/**
 * File-type detection from magic bytes + structural sanity checks. Client MIME/extension are never trusted.
 */
export type DetectedType = { mime: 'image/jpeg' | 'image/png' | 'application/pdf' | 'image/webp'; ext: string };

export function detectFileType(buf: Buffer): DetectedType | null {
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf.toString('ascii', 1, 4) === 'PNG' &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Basic structural integrity: detects truncated/malformed files. */
export function isStructurallyValid(buf: Buffer, type: DetectedType): boolean {
  const tail = buf.subarray(Math.max(0, buf.length - 2048));
  switch (type.mime) {
    case 'application/pdf':
      return tail.includes(Buffer.from('%%EOF'));
    case 'image/png':
      return buf.length > 57 && tail.includes(Buffer.from('IEND'));
    case 'image/jpeg': {
      const end = buf.subarray(Math.max(0, buf.length - 64));
      for (let i = end.length - 2; i >= 0; i--) if (end[i] === 0xff && end[i + 1] === 0xd9) return true;
      return false;
    }
    case 'image/webp':
      return buf.readUInt32LE(4) + 8 <= buf.length + 1;
  }
}

const EXT_ALIASES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/pdf': ['pdf'],
  'image/webp': ['webp'],
};

export interface ValidateOptions {
  allowed: DetectedType['mime'][];
  maxBytes: number;
}

export class FileValidationError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
  }
}

export function validateUpload(
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  opts: ValidateOptions,
): DetectedType {
  if (!file || !file.buffer) throw new FileValidationError('File wajib dipilih.');
  if (file.size <= 0 || file.buffer.length === 0) throw new FileValidationError('File kosong.');
  if (file.buffer.length > opts.maxBytes)
    throw new FileValidationError(`Ukuran file maksimal ${(opts.maxBytes / 1024 / 1024).toFixed(1)} MB.`, 413);
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  const allowedExts = opts.allowed.flatMap((m) => EXT_ALIASES[m]);
  if (!allowedExts.includes(ext)) throw new FileValidationError(`Ekstensi .${ext} tidak diizinkan.`, 415);
  const detected = detectFileType(file.buffer);
  if (!detected || !opts.allowed.includes(detected.mime))
    throw new FileValidationError('Isi file bukan format yang diizinkan.', 415);
  if (!EXT_ALIASES[detected.mime].includes(ext)) throw new FileValidationError('Ekstensi tidak cocok dengan isi file.', 415);
  if (file.mimetype && file.mimetype !== 'application/octet-stream' && file.mimetype !== detected.mime)
    throw new FileValidationError('Tipe MIME tidak cocok dengan isi file.', 415);
  if (!isStructurallyValid(file.buffer, detected)) throw new FileValidationError('File rusak atau tidak lengkap.', 400);
  return detected;
}

export function safeDisplayName(name: string, fallback = 'dokumen'): string {
  const n = name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._() -]/g, '_')
    .trim();
  return (n || fallback).slice(0, 120);
}

