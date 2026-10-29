import { describe, it, expect } from 'vitest';
import {
  formatRupiah,
  parseRupiahInput,
  sumRupiah,
  normalizeIndoPhone,
  waLink,
  deriveOrderStatus,
  parseCsv,
  validateImportRows,
  PROTECTED_FIELD_GROUPS,
} from './index';

describe('@store/shared unit tests', () => {
  it('formats and parses IDR integer amounts safely without floating point drift', () => {
    expect(formatRupiah(429000)).toBe('Rp 429.000');
    expect(parseRupiahInput('Rp 1.250.000')).toBe(1250000);
    expect(parseRupiahInput('12,5')).toBeNull();
    expect(sumRupiah([100000, 25000, 15000])).toBe(140000);
  });

  it('normalizes Indonesian phone numbers and builds WhatsApp URLs', () => {
    expect(normalizeIndoPhone('0822-3303-8659')).toBe('6282233038659');
    expect(normalizeIndoPhone('+62 812 3456 7890')).toBe('6281234567890');
    const url = waLink('082233038659', 'Halo Admin ORD-123');
    expect(url).toBe('https://wa.me/082233038659?text=Halo%20Admin%20ORD-123');
  });

  it('derives split shipment order statuses accurately', () => {
    expect(
      deriveOrderStatus({
        current: 'PROCESSING',
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'PAID',
        supplierOrders: [
          { status: 'DELIVERED', shipments: [{ status: 'DELIVERED' }] },
          { status: 'SHIPPED', shipments: [{ status: 'IN_TRANSIT' }] },
        ],
      }),
    ).toBe('PARTIALLY_DELIVERED');

    expect(
      deriveOrderStatus({
        current: 'PROCESSING',
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'PAID',
        supplierOrders: [
          { status: 'SHIPPED', shipments: [{ status: 'TRACKING_AVAILABLE' }] },
          { status: 'PACKED', shipments: [] },
        ],
      }),
    ).toBe('PARTIALLY_SHIPPED');

    expect(
      deriveOrderStatus({
        current: 'SHIPPED',
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'PAID',
        supplierOrders: [
          { status: 'DELIVERED', shipments: [{ status: 'DELIVERED' }] },
          { status: 'DELIVERED', shipments: [{ status: 'DELIVERED' }] },
        ],
      }),
    ).toBe('DELIVERED');

    expect(
      deriveOrderStatus({
        current: 'PENDING_PAYMENT',
        paymentMethod: 'BANK_TRANSFER',
        paymentStatus: 'PENDING_REVIEW',
        supplierOrders: [{ status: 'PENDING', shipments: [] }],
      }),
    ).toBe('PENDING_PAYMENT');
  });

  it('parses CSV and validates rows, relative /demo paths, and duplicate SKUs', () => {
    const csvText = [
      'sku,name,slug,category,description,sale_price,compare_at_price,currency,weight_gram,stock_qty,supplier_name,supplier_sku,warehouse_name,cost_price,supplier_product_url,image_url,cod_enabled,status',
      'DRP-001,Contoh Botol Minum,contoh-botol-minum,Perlengkapan Rumah,"Produk demo untuk menguji import CSV",79000,,IDR,350,12,Supplier Contoh,SRC-001,Gudang Surabaya,42000,https://supplier.example/product/DRP-001,/demo/bottle.jpg,false,DRAFT',
      'DRP-002,Contoh Headphone,contoh-headphone,Elektronik,"Baris demo kedua",249000,299000,IDR,600,8,Supplier Contoh,SRC-002,Gudang Bandung,175000,https://supplier.example/product/DRP-002,https://images.example/DRP-002.jpg,true,ACTIVE',
      'DRP-001,Duplikat SKU,duplikat-sku,Elektronik,"Baris duplikat",150000,,IDR,500,5,Supplier Contoh,SRC-003,Gudang Bandung,100000,https://supplier.example/product/DRP-003,https://images.example/DRP-003.jpg,true,DRAFT',
    ].join('\n');

    const rows = parseCsv(csvText);
    expect(rows).toHaveLength(4);

    const result = validateImportRows(rows);
    expect(result.totalRows).toBe(3);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].sku).toBe('DRP-002');
    expect(result.errors.some((e) => e.sku === 'DRP-001' && e.message.includes('SKU duplikat'))).toBe(true);
    expect(PROTECTED_FIELD_GROUPS.PRICE).toContain('sale_price');
  });
});
