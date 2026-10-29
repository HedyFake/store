import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Module,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaModule } from './prisma/prisma.service';
import { StorageModule } from './storage/storage.service';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { SettingsController, SettingsService } from './settings/settings.controller';
import { CatalogController } from './catalog/catalog.controller';
import { SuppliersController } from './suppliers/suppliers.controller';
import { ImportsController } from './imports/imports.controller';
import { ShippingController, ShippingService } from './shipping/shipping.service';
import { TelegramController, TelegramService } from './telegram/telegram.service';
import { OrdersController } from './orders/orders.controller';
import { FileValidationError } from './common/file-validation';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof FileValidationError) {
      return res.status(exception.status).json({
        statusCode: exception.status,
        message: exception.message,
      });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return res.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
    }
    console.error('Unhandled API exception:', exception);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Terjadi kesalahan internal pada server.',
    });
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    StorageModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [
    SettingsController,
    CatalogController,
    SuppliersController,
    ImportsController,
    ShippingController,
    TelegramController,
    OrdersController,
  ],
  providers: [
    SettingsService,
    ShippingService,
    TelegramService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [SettingsService, ShippingService, TelegramService],
})
export class AppModule {}

