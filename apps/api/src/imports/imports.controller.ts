import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  CsvParseError,
  NormalizedImportRow,
  PRODUCT_CSV_COLUMNS,
  ProtectedGroup,
  RowError,
  errorsToCsv,
  importCommitSchema,
  parseCsv,
  slugify,
  toCsv,
  validateImportRows,
} from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminGuard, AuthedUser, CurrentUser, Roles } from '../auth/auth.module';
import { env } from '../config/env';
import { sha256 } from '../common/crypto';
import { safeDisplayName } from '../common/file-validation';
import { parseOrThrow } from '../common/zod.pipe';

const TEMPLATE_SAMPLE_ROWS = [
  {
    sku: 'DRP-001',
    name: 'Contoh Botol Minum',
    slug: 'contoh-botol-minum',
    category: 'Perlengkapan Rumah',
    description: 'Produk demo untuk menguji import CSV; ganti dengan barang yang benar',
    sale_price: 79000,
    compare_at_price: '',
    currency: 'IDR',
    weight_gram: 350,
    stock_qty: 12,
    supplier_name: 'Supplier Contoh',
    supplier_sku: 'SRC-001',
    warehouse_name: 'Gudang Surabaya',
    cost_price: 42000,
    supplier_product_url: 'https://supplier.example/product/DRP-001',
    image_url: 'https://images.example/DRP-001.jpg',
    cod_enabled: 'false',
    status: 'DRAFT',
  },
  {
    sku: 'DRP-002',
    name: 'Contoh Headphone',
    slug: 'contoh-headphone',
    category: 'Elektronik',
    description: 'Baris demo; URL example tidak digunakan untuk transaksi',
    sale_price: 249000,
    compare_at_price: 299000,
    currency: 'IDR',
    weight_gram: 600,
    stock_qty: 8,
    supplier_name: 'Supplier Contoh',
    supplier_sku: 'SRC-002',
    warehouse_name: 'Gudang Bandung',
    cost_price: 175000,
    supplier_product_url: 'https://supplier.example/product/DRP-002',
    image_url: 'https://images.example/DRP-002.jpg',
    cod_enabled: 'true',
    status: 'DRAFT',
  },
];

@UseGuards(AdminGuard)
@Controller('api/admin')
export class ImportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('imports/products/template.csv')
  downloadTemplate(@Res() res: Response) {
    const csv = toCsv(PRODUCT_CSV_COLUMNS, TEMPLATE_SAMPLE_ROWS);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="06_PRODUCT_IMPORT_TEMPLATE.csv"');
    return res.send(csv);
  }

  @Get('products/export.csv')
  async exportCatalog(@Res() res: Response) {
    const products = await this.prisma.product.findMany({
      orderBy: { sku: 'asc' },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        offers: {
          where: { active: true },
          orderBy: { fulfillmentPriority: 'asc' },
          take: 1,
          include: { supplier: true, warehouse: true },
        },
      },
    });
    const rows = products.map((p) => {
      const offer = p.offers[0];
      return {
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        category: p.category?.name ?? '',
        description: p.description,
        sale_price: p.salePrice,
        compare_at_price: p.compareAtPrice ?? '',
        currency: p.currency,
        weight_gram: p.weightGram,
        stock_qty: offer ? offer.stockQty : '',
        supplier_name: offer ? offer.supplier.name : '',
        supplier_sku: offer ? offer.supplierSku : '',
        warehouse_name: offer ? offer.warehouse.name : '',
        cost_price: offer ? offer.costPrice : '',
        supplier_product_url: offer?.supplierProductUrl ?? '',
        image_url: p.images[0]?.url ?? '',
        cod_enabled: offer ? String(offer.codEnabled) : '',
        status: p.status,
      };
    });
    const csv = toCsv(PRODUCT_CSV_COLUMNS, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="katalog-produk-export.csv"');
    return res.send(csv);
  }

  @Roles('OWNER', 'ADMIN')
  @Post('imports/products/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewCsv(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthedUser,
  ) {
    if (!file || !file.buffer) throw new BadRequestException('Pilih file CSV terlebih dahulu.');
    const maxBytes = env().PRODUCT_IMPORT_MAX_BYTES;
    const maxRows = env().PRODUCT_IMPORT_MAX_ROWS;
    if (file.size <= 0 || file.buffer.length === 0) throw new BadRequestException('File CSV kosong.');
    if (file.buffer.length > maxBytes) {
      throw new PayloadTooLargeException(
        `Ukuran file melebihi batas ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`,
      );
    }
    const lowerName = file.originalname.toLowerCase();
    if (!lowerName.endsWith('.csv')) {
      throw new UnsupportedMediaTypeException('Hanya file berekstensi .csv yang diterima.');
    }

    const text = file.buffer.toString('utf8');
    if (text.includes('\uFFFD')) {
      throw new BadRequestException('File CSV harus ber-encoding UTF-8 yang valid.');
    }

    let parsedRows: string[][];
    try {
      parsedRows = parseCsv(text, maxRows + 1);
    } catch (e) {
      if (e instanceof CsvParseError) throw new BadRequestException(e.message);
      throw new BadRequestException('CSV tidak dapat diparse.');
    }
    if (parsedRows.length < 2) {
      throw new BadRequestException('CSV harus memiliki baris header dan minimal 1 baris produk.');
    }
    if (parsedRows.length - 1 > maxRows) {
      throw new PayloadTooLargeException(`Jumlah baris melebihi batas maksimal ${maxRows} baris.`);
    }

    const validation = validateImportRows(parsedRows);
    const skus = validation.valid.map((r) => r.sku);
    const existingProducts = skus.length
      ? await this.prisma.product.findMany({
          where: { sku: { in: skus } },
          include: {
            category: true,
            offers: {
              where: { active: true },
              orderBy: { fulfillmentPriority: 'asc' },
              include: { supplier: true, warehouse: true },
            },
          },
        })
      : [];
    const bySku = new Map(existingProducts.map((p) => [p.sku, p]));

    const previewItems = validation.valid.map((r) => {
      const existing = bySku.get(r.sku);
      if (!existing) {
        return {
          rowNumber: r.rowNumber,
          sku: r.sku,
          name: r.name,
          action: 'CREATE' as const,
          salePrice: r.salePrice,
          costPrice: r.costPrice,
          stockQty: r.stockQty,
          supplierName: r.supplierName,
          warehouseName: r.warehouseName,
          status: r.status,
          diffs: [],
        };
      }
      const offer = existing.offers[0];
      const diffs: Array<{ field: string; group: ProtectedGroup | 'DESCRIPTIVE'; before: unknown; after: unknown }> = [];
      if (existing.name !== r.name) diffs.push({ field: 'name', group: 'DESCRIPTIVE', before: existing.name, after: r.name });
      if (existing.salePrice !== r.salePrice)
        diffs.push({ field: 'sale_price', group: 'PRICE', before: existing.salePrice, after: r.salePrice });
      if ((existing.compareAtPrice ?? null) !== (r.compareAtPrice ?? null))
        diffs.push({
          field: 'compare_at_price',
          group: 'PRICE',
          before: existing.compareAtPrice,
          after: r.compareAtPrice,
        });
      if (r.costPrice != null && offer && offer.costPrice !== r.costPrice)
        diffs.push({ field: 'cost_price', group: 'COST', before: offer.costPrice, after: r.costPrice });
      if (r.stockQty != null && (!offer || offer.stockQty !== r.stockQty))
        diffs.push({ field: 'stock_qty', group: 'STOCK', before: offer?.stockQty ?? 0, after: r.stockQty });
      if (existing.status !== r.status)
        diffs.push({ field: 'status', group: 'STATUS', before: existing.status, after: r.status });
      if (r.codEnabled != null && offer && offer.codEnabled !== r.codEnabled)
        diffs.push({ field: 'cod_enabled', group: 'COD', before: offer.codEnabled, after: r.codEnabled });

      return {
        rowNumber: r.rowNumber,
        sku: r.sku,
        name: r.name,
        action: 'UPDATE' as const,
        salePrice: r.salePrice,
        costPrice: r.costPrice,
        stockQty: r.stockQty,
        supplierName: r.supplierName,
        warehouseName: r.warehouseName,
        status: r.status,
        diffs,
      };
    });

    const job = await this.prisma.productImportJob.create({
      data: {
        actorId: user.id,
        fileName: safeDisplayName(file.originalname, 'import.csv'),
        fileHash: sha256(file.buffer),
        mode: 'CREATE_ONLY',
        status: 'PREVIEWED',
        totalRows: validation.totalRows,
        validRows: validation.valid.length,
        failedCount: validation.errors.length,
        rows: validation.valid as unknown as Prisma.InputJsonValue,
        errors: {
          create: validation.errors.map((e) => ({
            rowNumber: e.rowNumber,
            column: e.column,
            sku: e.sku,
            message: e.message,
            phase: 'PREVIEW',
          })),
        },
      },
    });

    const createCandidates = previewItems.filter((i) => i.action === 'CREATE').length;
    const updateCandidates = previewItems.filter((i) => i.action === 'UPDATE').length;

    return {
      jobId: job.id,
      fileName: job.fileName,
      totalRows: validation.totalRows,
      validRows: validation.valid.length,
      errorRows: validation.errors.length,
      createCandidates,
      updateCandidates,
      previewItems: previewItems.slice(0, 100),
      errors: validation.errors,
    };
  }

  @Roles('OWNER', 'ADMIN')
  @Post('imports/products/commit')
  async commitImport(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const input = parseOrThrow(importCommitSchema, body);
    const job = await this.prisma.productImportJob.findUnique({
      where: { id: input.jobId },
      include: { errors: true },
    });
    if (!job) throw new NotFoundException('Job import tidak ditemukan.');
    if (job.status === 'COMMITTED') {
      return {
        jobId: job.id,
        alreadyCommitted: true,
        createdCount: job.createdCount,
        updatedCount: job.updatedCount,
        skippedCount: job.skippedCount,
        failedCount: job.failedCount,
      };
    }

    const rows = (job.rows as unknown as NormalizedImportRow[]) ?? [];
    const enabledProtected = new Set<ProtectedGroup>(input.protectedFields);
    const commitErrors: RowError[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const existing = await tx.product.findUnique({ where: { sku: row.sku } });
          if (existing && input.mode === 'CREATE_ONLY') {
            skippedCount++;
            commitErrors.push({
              rowNumber: row.rowNumber,
              column: 'sku',
              sku: row.sku,
              message: 'SKU sudah ada di database (dilewati karena mode CREATE_ONLY).',
            });
            return;
          }

          // Resolve category if provided
          let categoryId: string | null = existing?.categoryId ?? null;
          if (row.category) {
            const catSlug = slugify(row.category);
            const cat = await tx.category.upsert({
              where: { slug: catSlug },
              create: { name: row.category, slug: catSlug, active: true },
              update: {},
            });
            categoryId = cat.id;
          }

          let productId: string;
          if (!existing) {
            // Ensure unique slug on create
            let finalSlug = row.slug;
            const slugTaken = await tx.product.findUnique({ where: { slug: finalSlug } });
            if (slugTaken) finalSlug = `${row.slug}-${row.sku.toLowerCase()}`.slice(0, 120);

            const created = await tx.product.create({
              data: {
                sku: row.sku,
                slug: finalSlug,
                name: row.name,
                description: row.description,
                categoryId,
                salePrice: row.salePrice,
                compareAtPrice: row.compareAtPrice,
                weightGram: row.weightGram,
                status: row.status,
                images: row.imageUrl ? { create: [{ url: row.imageUrl, alt: row.name, sortOrder: 0 }] } : undefined,
              },
            });
            productId = created.id;
            createdCount++;
          } else {
            // UPSERT_BY_SKU: descriptive fields always update; protected fields only when explicitly enabled
            const updateData: Prisma.ProductUpdateInput = {
              name: row.name,
              description: row.provided.includes('description') ? row.description : existing.description,
              weightGram: row.weightGram,
              ...(row.category ? { category: { connect: { id: categoryId! } } } : {}),
            };
            if (enabledProtected.has('PRICE')) {
              updateData.salePrice = row.salePrice;
              if (row.provided.includes('compare_at_price')) {
                updateData.compareAtPrice = row.compareAtPrice;
              }
            }
            if (enabledProtected.has('STATUS') && row.provided.includes('status')) {
              updateData.status = row.status;
              updateData.archivedAt = row.status === 'ARCHIVED' ? new Date() : null;
            }
            await tx.product.update({ where: { id: existing.id }, data: updateData });
            if (row.imageUrl) {
              await tx.productImage.deleteMany({ where: { productId: existing.id } });
              await tx.productImage.create({
                data: { productId: existing.id, url: row.imageUrl, alt: row.name, sortOrder: 0 },
              });
            }
            productId = existing.id;
            updatedCount++;
          }

          // Supplier offer handling
          const canTouchSupplier = !existing || enabledProtected.has('SUPPLIER');
          if (row.supplierName && row.supplierSku && row.warehouseName && row.costPrice != null && canTouchSupplier) {
            const supplier = await tx.supplier.upsert({
              where: { name: row.supplierName },
              create: {
                name: row.supplierName,
                active: true,
                integrationMode: 'MANUAL',
                codSupported: Boolean(row.codEnabled),
              },
              update: row.codEnabled ? { codSupported: true } : {},
            });
            const warehouse = await tx.warehouse.upsert({
              where: { supplierId_name: { supplierId: supplier.id, name: row.warehouseName } },
              create: {
                supplierId: supplier.id,
                name: row.warehouseName,
                city: row.warehouseName.replace(/^Gudang\s+/i, '') || 'Jakarta',
                active: true,
              },
              update: {},
            });

            const existingOffer = await tx.supplierOffer.findUnique({
              where: {
                supplierId_warehouseId_supplierSku: {
                  supplierId: supplier.id,
                  warehouseId: warehouse.id,
                  supplierSku: row.supplierSku,
                },
              },
            });

            if (!existingOffer) {
              const newOffer = await tx.supplierOffer.create({
                data: {
                  productId,
                  supplierId: supplier.id,
                  warehouseId: warehouse.id,
                  supplierSku: row.supplierSku,
                  supplierProductUrl: row.supplierProductUrl,
                  costPrice: row.costPrice,
                  stockQty: row.stockQty ?? 0,
                  codEnabled: row.codEnabled ?? false,
                  active: true,
                },
              });
              if ((row.stockQty ?? 0) > 0) {
                await tx.inventoryMovement.create({
                  data: {
                    offerId: newOffer.id,
                    delta: row.stockQty ?? 0,
                    reason: 'CSV_IMPORT',
                    actorId: user.id,
                  },
                });
              }
            } else {
              const offerUpdate: Prisma.SupplierOfferUpdateInput = {
                supplierProductUrl: row.supplierProductUrl ?? existingOffer.supplierProductUrl,
              };
              if (enabledProtected.has('COST')) offerUpdate.costPrice = row.costPrice;
              if (enabledProtected.has('COD') && row.codEnabled != null) offerUpdate.codEnabled = row.codEnabled;
              if (enabledProtected.has('STOCK') && row.stockQty != null && row.stockQty !== existingOffer.stockQty) {
                offerUpdate.stockQty = row.stockQty;
                await tx.inventoryMovement.create({
                  data: {
                    offerId: existingOffer.id,
                    delta: row.stockQty - existingOffer.stockQty,
                    reason: 'CSV_IMPORT',
                    actorId: user.id,
                  },
                });
              }
              await tx.supplierOffer.update({ where: { id: existingOffer.id }, data: offerUpdate });
            }
          }
        });
      } catch (err) {
        commitErrors.push({
          rowNumber: row.rowNumber,
          column: null,
          sku: row.sku,
          message: err instanceof Error ? err.message.slice(0, 200) : 'Gagal menyimpan baris',
        });
      }
    }

    if (commitErrors.length) {
      await this.prisma.productImportRowError.createMany({
        data: commitErrors.map((e) => ({
          jobId: job.id,
          rowNumber: e.rowNumber,
          column: e.column,
          sku: e.sku,
          message: e.message,
          phase: 'COMMIT',
        })),
      });
    }

    const totalFailed = job.errors.length + commitErrors.length;
    const finished = await this.prisma.productImportJob.update({
      where: { id: job.id },
      data: {
        mode: input.mode,
        protectedFields: input.protectedFields,
        status: 'COMMITTED',
        createdCount,
        updatedCount,
        skippedCount,
        failedCount: totalFailed,
        committedAt: new Date(),
      },
      include: { errors: { orderBy: { rowNumber: 'asc' } } },
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PRODUCT_CSV_IMPORT_COMMITTED',
      entityType: 'ProductImportJob',
      entityId: job.id,
      after: {
        fileName: job.fileName,
        mode: input.mode,
        protectedFields: input.protectedFields,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount: totalFailed,
      },
    });

    return {
      jobId: finished.id,
      mode: finished.mode,
      protectedFields: finished.protectedFields,
      totalRows: finished.totalRows,
      createdCount: finished.createdCount,
      updatedCount: finished.updatedCount,
      skippedCount: finished.skippedCount,
      failedCount: finished.failedCount,
      errors: finished.errors,
    };
  }

  @Get('imports/:jobId/report.csv')
  async downloadErrorReport(@Param('jobId') jobId: string, @Res() res: Response) {
    const job = await this.prisma.productImportJob.findUnique({
      where: { id: jobId },
      include: { errors: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Laporan import tidak ditemukan.');
    const csv = errorsToCsv(
      job.errors.map((e) => ({
        rowNumber: e.rowNumber,
        column: e.column,
        sku: e.sku,
        message: e.message,
      })),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${job.id.slice(0, 8)}.csv"`);
    return res.send(csv);
  }
}
