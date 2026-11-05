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
  evaluateProductProfitAndSubsidy,
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

  it('evaluates exact benchmark case: Rp 150.000 price, Rp 90.000 HPP, Rp 3.000 packaging, Rp 3.000 other, Rp 30.000 shipping, Rp 15.000 target', () => {
    const sampleShipping = [
      {
        optionId: 'ro_jne_reg',
        courierCode: 'jne',
        courierName: 'JNE',
        serviceCode: 'REG',
        serviceName: 'Layanan Reguler',
        etd: '1-2 hari',
        cost: 30000,
      },
    ];

    // 1. Skema awal tanpa subsidi (ongkir normal)
    const evalNormal = evaluateProductProfitAndSubsidy({
      salePrice: 150000,
      costPrice: 90000,
      packagingCost: 3000,
      otherCost: 3000,
      currentSubsidy: 0,
      minProfitTarget: 15000,
      shippingOptions: sampleShipping,
    });

    expect(evalNormal.totalBaseCost).toBe(96000);
    expect(evalNormal.grossMarginBeforeSubsidy).toBe(54000);
    expect(evalNormal.buyerTotalCheckout).toBe(180000);
    expect(evalNormal.netProfit).toBe(54000);
    expect(evalNormal.rawMaxSubsidyBudget).toBe(39000); // 54.000 - 15.000 = 39.000
    expect(evalNormal.maxShippingSubsidy).toBe(30000); // dibatasi ongkir aktual 30.000
    expect(evalNormal.canFullFreeShipping).toBe(true);
    expect(evalNormal.profitWithFullFreeShipping).toBe(24000); // 54.000 - 30.000 = 24.000 >= 15.000
    expect(evalNormal.isTargetMet).toBe(true);
    expect(evalNormal.isSafe).toBe(true);
    expect(evalNormal.recommendedSalePrice).toBe(150000); // pertahankan harga
    expect(evalNormal.optionalPromoSubsidy).toBe(30000); // bisa gratis ongkir penuh

    // 2. Jika gratis ongkir menyebabkan laba di bawah target (misal ongkir Rp 45.000 > budget subsidi Rp 39.000)
    const evalHighShipping = evaluateProductProfitAndSubsidy({
      salePrice: 150000,
      costPrice: 90000,
      packagingCost: 3000,
      otherCost: 3000,
      currentSubsidy: 45000,
      minProfitTarget: 15000,
      shippingOptions: [
        {
          optionId: 'ro_jne_yes',
          courierCode: 'jne',
          courierName: 'JNE',
          serviceCode: 'YES',
          serviceName: 'Yakin Esok Sampai',
          etd: '1 hari',
          cost: 45000,
        },
      ],
    });

    expect(evalHighShipping.canFullFreeShipping).toBe(false);
    expect(evalHighShipping.isTargetMet).toBe(false);
    expect(evalHighShipping.decisionCode).toBe('REDUCE_SUBSIDY_FIRST');
    expect(evalHighShipping.recommendedSalePrice).toBe(150000); // kurangi subsidi dulu sebelum ubah harga!
    expect(evalHighShipping.recommendedSubsidy).toBe(39000); // subsidi aman maksimal
    expect(evalHighShipping.recommendedBuyerShippingPay).toBe(6000); // sisa ongkir yang dibayar pembeli
    expect(evalHighShipping.recommendedNetProfit).toBe(15000);

    // 3. Jika laba tepat mencapai target minimum (Rp 15.000)
    const evalExact = evaluateProductProfitAndSubsidy({
      salePrice: 150000,
      costPrice: 90000,
      packagingCost: 3000,
      otherCost: 3000,
      currentSubsidy: 39000,
      minProfitTarget: 15000,
      shippingOptions: [
        {
          optionId: 'ro_jne_yes',
          courierCode: 'jne',
          courierName: 'JNE',
          serviceCode: 'YES',
          serviceName: 'Yakin Esok Sampai',
          etd: '1 hari',
          cost: 45000,
        },
      ],
    });
    expect(evalExact.netProfit).toBe(15000);
    expect(evalExact.decisionCode).toBe('EXACT_TARGET_MET');
    expect(evalExact.isSafe).toBe(true);

    // 4. Jika semua pilihan ongkir tetap menyebabkan kerugian / laba di bawah target bahkan tanpa subsidi
    const evalLoss = evaluateProductProfitAndSubsidy({
      salePrice: 100000,
      costPrice: 90000,
      packagingCost: 3000,
      otherCost: 3000,
      currentSubsidy: 10000,
      minProfitTarget: 15000,
      shippingOptions: sampleShipping,
    });
    expect(evalLoss.isSafe).toBe(false);
    expect(evalLoss.decisionCode).toBe('LOSS_OR_BELOW_TARGET_NO_SUBSIDY');
    expect(evalLoss.recommendedSubsidy).toBe(0);
    expect(evalLoss.recommendedSalePrice).toBe(111000); // 96.000 + 15.000

    // 5. Jika data biaya HPP belum lengkap (0)
    const evalIncomplete = evaluateProductProfitAndSubsidy({
      salePrice: 150000,
      costPrice: 0,
      packagingCost: 0,
      otherCost: 0,
      currentSubsidy: 0,
      minProfitTarget: 15000,
      shippingOptions: sampleShipping,
    });
    expect(evalIncomplete.isSafe).toBe(false);
    expect(evalIncomplete.decisionCode).toBe('INCOMPLETE_COST_DATA');
    expect(evalIncomplete.warnings.length).toBeGreaterThan(0);
  });
});
