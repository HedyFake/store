import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Data tidak valid',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): T {
  return new ZodPipe(schema).transform(value);
}
