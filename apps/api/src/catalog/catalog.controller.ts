import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { catalogQuerySchema, categorySchema, productSchema } from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminGuard, AuthedUser, CurrentUser, Roles } from '../auth/auth.module';
import { parseOrThrow } from '../common/zod.pipe';

/** Format a product for public storefront responses — never exposes supplier cost or internal notes. */
function formatPublicProduct(
  p: Prisma.ProductGetPayload<{
    include: {
      category: true;
      images: true;
      variants: true;
      offers: { include: { supplier: true; warehouse: true } };
    };
  }>,
) {
  const activeOffers = p.offers.filter((o) => o.active && o.supplier.active && o.warehouse.active);
  const totalStock = activeOffers.reduce((sum, o) => sum + Math.max(0, o.stockQty), 0);
  const codSupported = activeOffers.some((o) => o.codEnabled && o.supplier.codSupported && o.stockQty > 0);
  const warehouses = Array.from(new Set(activeOffers.filter((o) => o.stockQty > 0).map((o) => o.warehouse.city)));
  const minLeadDays = activeOffers.length ? Math.min(...activeOffers.map((o) => o.leadTimeDays)) : null;
  const maxLeadDays = activeOffers.length ? Math.max(...activeOffers.map((o) => o.leadTimeDays)) : null;

  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    description: p.description,
    salePrice: p.salePrice,
    compareAtPrice: p.compareAtPrice,
    currency: p.currency,
    weightGram: p.weightGram,
    highlights: p.highlights,
    badges: p.badges,
    featured: p.featured,
    isDemo: p.isDemo,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    images: p.images.sort((a, b) => a.sortOrder - b.sortOrder).map((img) => ({ id: img.id, url: img.url, alt: img.alt })),
    variants: p.variants
      .filter((v) => v.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => {
        const vOffers = activeOffers.filter((o) => o.variantId === v.id || o.variantId === null);
        const vStock = vOffers.reduce((s, o) => s + Math.max(0, o.stockQty), 0);
        return {
          id: v.id,
          sku: v.sku,
          name: v.name,
          options: v.options,
          priceOverride: v.priceOverride,
          effectivePrice: v.priceOverride ?? p.salePrice,
          stockQty: vStock,
        };
      }),
    availability: {
      inStock: totalStock > 0,
      totalStock,
      codSupported,
      originCities: warehouses,
      leadTimeDaysMin: minLeadDays,
      leadTimeDaysMax: maxLeadDays,
      offerCount: activeOffers.length,
    },
  };
}

@Controller('api')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────── Public catalog ───────────────────────

  @Get('categories')
  async publicCategories() {
    const cats = await this.prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { status: 'ACTIVE', archivedAt: null } } } },
      },
    });
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      imageUrl: c.imageUrl,
      parentId: c.parentId,
      productCount: c._count.products,
    }));
  }

  @Get('products')
  async listPublicProducts(@Query() rawQuery: Record<string, unknown>) {
    const q = parseOrThrow(catalogQuerySchema, rawQuery);
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      archivedAt: null,
    };
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { sku: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    if (q.category) {
      where.category = { slug: q.category };
    }
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      where.salePrice = {
        ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
        ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
      };
    }
    if (q.inStock) {
      where.offers = {
        some: { active: true, stockQty: { gt: 0 }, supplier: { active: true }, warehouse: { active: true } },
      };
    }
    if (q.cod) {
      where.offers = {
        some: {
          active: true,
          stockQty: { gt: 0 },
          codEnabled: true,
          supplier: { active: true, codSupported: true },
          warehouse: { active: true },
        },
      };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ salePrice: 'asc' }]
        : q.sort === 'price_desc'
          ? [{ salePrice: 'desc' }]
          : q.sort === 'name'
            ? [{ name: 'asc' }]
            : q.sort === 'popular'
              ? [{ featured: 'desc' }, { orderItems: { _count: 'desc' } }, { createdAt: 'desc' }]
              : [{ featured: 'desc' }, { createdAt: 'desc' }];

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          category: true,
          images: true,
          variants: true,
          offers: { include: { supplier: true, warehouse: true } },
        },
      }),
    ]);

    return {
      items: items.map(formatPublicProduct),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  @Get('products/:slug')
  async getPublicProduct(@Param('slug') slug: string) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(slug);
    const product = await this.prisma.product.findFirst({
      where: {
        OR: isUuid ? [{ slug }, { id: slug }] : [{ slug }],
        status: 'ACTIVE',
        archivedAt: null,
      },
      include: {
        category: true,
        images: true,
        variants: true,
        offers: { include: { supplier: true, warehouse: true } },
      },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan atau tidak aktif.');

    const related = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        archivedAt: null,
        id: { not: product.id },
        ...(product.categoryId ? { categoryId: product.categoryId } : {}),
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        images: true,
        variants: true,
        offers: { include: { supplier: true, warehouse: true } },
      },
    });

    return {
      product: formatPublicProduct(product),
      related: related.map(formatPublicProduct),
    };
  }

  // ─────────────────────── Admin catalog ───────────────────────

  @UseGuards(AdminGuard)
  @Get('admin/categories')
  async adminCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/categories')
  async createCategory(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(categorySchema, body);
    const exists = await this.prisma.category.findUnique({ where: { slug: data.slug } });
    if (exists) throw new ConflictException('Slug kategori sudah digunakan.');
    const created = await this.prisma.category.create({ data });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CATEGORY_CREATED',
      entityType: 'Category',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Patch('admin/categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const data = parseOrThrow(categorySchema.partial(), body);
    const updated = await this.prisma.category.update({ where: { id }, data });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CATEGORY_UPDATED',
      entityType: 'Category',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Get('admin/products')
  async adminListProducts(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const page = Math.max(1, Number(pageRaw) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
    const where: Prisma.ProductWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (status && ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) {
      where.status = status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    }
    if (categoryId) where.categoryId = categoryId;

    const [total, items, activeCount, allOffers] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          variants: { orderBy: { sortOrder: 'asc' } },
          offers: { include: { supplier: true, warehouse: true }, orderBy: { fulfillmentPriority: 'asc' } },
        },
      }),
      this.prisma.product.count({ where: { status: 'ACTIVE', archivedAt: null } }),
      this.prisma.supplierOffer.findMany({
        where: { active: true, product: { status: { not: 'ARCHIVED' } } },
        select: { productId: true, stockQty: true, costPrice: true },
      }),
    ]);

    const stockByProduct = new Map<string, number>();
    let inventoryCostValue = 0;
    for (const o of allOffers) {
      stockByProduct.set(o.productId, (stockByProduct.get(o.productId) ?? 0) + Math.max(0, o.stockQty));
      inventoryCostValue += Math.max(0, o.stockQty) * o.costPrice;
    }
    let lowStockProducts = 0;
    for (const [, qty] of stockByProduct) if (qty > 0 && qty <= 5) lowStockProducts++;

    return {
      items: items.map((p) => ({
        ...p,
        totalStock: p.offers.filter((o) => o.active).reduce((s, o) => s + Math.max(0, o.stockQty), 0),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      metrics: {
        activeProducts: activeCount,
        lowStockProducts,
        inventoryCostValue,
      },
    };
  }

  @UseGuards(AdminGuard)
  @Get('admin/products/:id')
  async adminGetProduct(@Param('id') id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sortOrder: 'asc' } },
        offers: { include: { supplier: true, warehouse: true }, orderBy: { fulfillmentPriority: 'asc' } },
      },
    });
    if (!p) throw new NotFoundException('Produk tidak ditemukan');
    return p;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/products')
  async createProduct(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(productSchema, body);
    const [skuDup, slugDup] = await Promise.all([
      this.prisma.product.findUnique({ where: { sku: data.sku } }),
      this.prisma.product.findUnique({ where: { slug: data.slug } }),
    ]);
    if (skuDup) throw new ConflictException(`SKU ${data.sku} sudah digunakan.`);
    if (slugDup) throw new ConflictException(`Slug ${data.slug} sudah digunakan.`);

    const created = await this.prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          sku: data.sku,
          slug: data.slug,
          name: data.name,
          description: data.description,
          categoryId: data.categoryId ?? null,
          status: data.status,
          salePrice: data.salePrice,
          compareAtPrice: data.compareAtPrice ?? null,
          weightGram: data.weightGram,
          lengthCm: data.lengthCm ?? null,
          widthCm: data.widthCm ?? null,
          heightCm: data.heightCm ?? null,
          highlights: data.highlights,
          badges: data.badges,
          featured: data.featured,
          seoTitle: data.seoTitle ?? null,
          seoDescription: data.seoDescription ?? null,
          images: {
            create: (data.images ?? []).map((img, idx) => ({ url: img.url, alt: img.alt ?? '', sortOrder: idx })),
          },
          variants: {
            create: (data.variants ?? []).map((v, idx) => ({
              sku: v.sku,
              name: v.name,
              priceOverride: v.priceOverride ?? null,
              active: v.active,
              sortOrder: idx,
            })),
          },
        },
      });

      if (data.initialStockQty !== undefined) {
        const defaultWarehouse = await tx.warehouse.findFirst({
          where: { active: true, supplier: { active: true } },
          include: { supplier: true },
          orderBy: { createdAt: 'asc' },
        });
        if (defaultWarehouse) {
          const offer = await tx.supplierOffer.create({
            data: {
              productId: prod.id,
              supplierId: defaultWarehouse.supplierId,
              warehouseId: defaultWarehouse.id,
              supplierSku: `${prod.sku}-DEF`,
              costPrice: Math.round(prod.salePrice * 0.7),
              stockQty: data.initialStockQty,
              leadTimeDays: 1,
              fulfillmentPriority: 100,
              codEnabled: defaultWarehouse.supplier.codSupported,
              integrationMode: defaultWarehouse.supplier.integrationMode,
              active: true,
            },
          });
          if (data.initialStockQty > 0) {
            await tx.inventoryMovement.create({
              data: {
                offerId: offer.id,
                delta: data.initialStockQty,
                reason: 'INITIAL_STOCK_ADMIN_FORM',
                actorId: user.id,
                note: 'Stok awal dari formulir admin produk',
              },
            });
          }
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id: prod.id },
        include: { images: true, variants: true, category: true, offers: { include: { supplier: true, warehouse: true } } },
      });
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: created.id,
      after: { sku: created.sku, name: created.name, salePrice: created.salePrice, status: created.status },
    });
    return created;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Patch('admin/products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true, variants: true },
    });
    if (!existing) throw new NotFoundException('Produk tidak ditemukan');
    const data = parseOrThrow(productSchema.innerType().partial(), body);
    if (data.compareAtPrice != null && (data.salePrice ?? existing.salePrice) >= data.compareAtPrice) {
      throw new BadRequestException('Harga coret harus lebih besar dari harga jual');
    }
    if (data.sku && data.sku !== existing.sku) {
      const dup = await this.prisma.product.findUnique({ where: { sku: data.sku } });
      if (dup) throw new ConflictException(`SKU ${data.sku} sudah digunakan.`);
    }
    if (data.slug && data.slug !== existing.slug) {
      const dup = await this.prisma.product.findUnique({ where: { slug: data.slug } });
      if (dup) throw new ConflictException(`Slug ${data.slug} sudah digunakan.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (data.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (data.images.length) {
          await tx.productImage.createMany({
            data: data.images.map((img, idx) => ({
              productId: id,
              url: img.url,
              alt: img.alt ?? '',
              sortOrder: idx,
            })),
          });
        }
      }
      if (data.variants) {
        for (const [idx, v] of data.variants.entries()) {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                sku: v.sku,
                name: v.name,
                priceOverride: v.priceOverride ?? null,
                active: v.active,
                sortOrder: idx,
              },
            });
          } else {
            await tx.productVariant.create({
              data: {
                productId: id,
                sku: v.sku,
                name: v.name,
                priceOverride: v.priceOverride ?? null,
                active: v.active,
                sortOrder: idx,
              },
            });
          }
        }
      }
      if (data.initialStockQty !== undefined) {
        const primaryOffer = await tx.supplierOffer.findFirst({
          where: { productId: id, active: true },
          orderBy: { fulfillmentPriority: 'asc' },
        });
        if (primaryOffer) {
          const delta = data.initialStockQty - primaryOffer.stockQty;
          if (delta !== 0) {
            await tx.supplierOffer.update({
              where: { id: primaryOffer.id },
              data: { stockQty: data.initialStockQty },
            });
            await tx.inventoryMovement.create({
              data: {
                offerId: primaryOffer.id,
                delta,
                reason: 'ADMIN_FORM_ADJUST',
                actorId: user.id,
                note: 'Penyesuaian stok via formulir produk admin',
              },
            });
          }
        } else {
          const defaultWarehouse = await tx.warehouse.findFirst({
            where: { active: true, supplier: { active: true } },
            include: { supplier: true },
            orderBy: { createdAt: 'asc' },
          });
          if (defaultWarehouse) {
            const createdOffer = await tx.supplierOffer.create({
              data: {
                productId: id,
                supplierId: defaultWarehouse.supplierId,
                warehouseId: defaultWarehouse.id,
                supplierSku: `${data.sku ?? existing.sku}-DEF`,
                costPrice: Math.round((data.salePrice ?? existing.salePrice) * 0.7),
                stockQty: data.initialStockQty,
                leadTimeDays: 1,
                fulfillmentPriority: 100,
                codEnabled: defaultWarehouse.supplier.codSupported,
                integrationMode: defaultWarehouse.supplier.integrationMode,
                active: true,
              },
            });
            if (data.initialStockQty > 0) {
              await tx.inventoryMovement.create({
                data: {
                  offerId: createdOffer.id,
                  delta: data.initialStockQty,
                  reason: 'INITIAL_STOCK_ADMIN_FORM',
                  actorId: user.id,
                  note: 'Stok awal dari formulir produk admin',
                },
              });
            }
          }
        }
      }
      return tx.product.update({
        where: { id },
        data: {
          sku: data.sku ?? existing.sku,
          slug: data.slug ?? existing.slug,
          name: data.name ?? existing.name,
          description: data.description ?? existing.description,
          categoryId: data.categoryId !== undefined ? data.categoryId : existing.categoryId,
          status: data.status ?? existing.status,
          salePrice: data.salePrice ?? existing.salePrice,
          compareAtPrice: data.compareAtPrice !== undefined ? data.compareAtPrice : existing.compareAtPrice,
          weightGram: data.weightGram ?? existing.weightGram,
          lengthCm: data.lengthCm !== undefined ? data.lengthCm : existing.lengthCm,
          widthCm: data.widthCm !== undefined ? data.widthCm : existing.widthCm,
          heightCm: data.heightCm !== undefined ? data.heightCm : existing.heightCm,
          highlights: data.highlights ?? existing.highlights,
          badges: data.badges ?? existing.badges,
          featured: data.featured ?? existing.featured,
          seoTitle: data.seoTitle !== undefined ? data.seoTitle : existing.seoTitle,
          seoDescription: data.seoDescription !== undefined ? data.seoDescription : existing.seoDescription,
          archivedAt:
            data.status === 'ARCHIVED' ? new Date() : data.status ? null : existing.archivedAt,
        },
        include: { category: true, images: true, variants: true, offers: { include: { supplier: true, warehouse: true } } },
      });
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: id,
      before: {
        sku: existing.sku,
        name: existing.name,
        salePrice: existing.salePrice,
        compareAtPrice: existing.compareAtPrice,
        status: existing.status,
      },
      after: {
        sku: updated.sku,
        name: updated.name,
        salePrice: updated.salePrice,
        compareAtPrice: updated.compareAtPrice,
        status: updated.status,
      },
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/products/:id/archive')
  async archiveProduct(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Produk tidak ditemukan');
    // Soft archive only — historical OrderItems remain untouched.
    const updated = await this.prisma.product.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PRODUCT_ARCHIVED',
      entityType: 'Product',
      entityId: id,
      before: { status: existing.status },
      after: { status: updated.status, archivedAt: updated.archivedAt },
    });
    return updated;
  }
}
