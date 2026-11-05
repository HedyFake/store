export interface ShippingRateInput {
  optionId: string;
  courierCode: string;
  courierName: string;
  serviceCode: string;
  serviceName: string;
  etd: string;
  cost: number;
}

export interface ProfitEvaluationInput {
  salePrice: number;
  costPrice: number;
  packagingCost?: number;
  otherCost?: number;
  currentSubsidy?: number;
  minProfitTarget?: number;
  shippingOptions: ShippingRateInput[];
  selectedOptionId?: string;
}

export type ShippingSchemeType =
  | 'NORMAL_SHIPPING'
  | 'PARTIAL_SUBSIDY'
  | 'FREE_SHIPPING'
  | 'ADJUST_SUBSIDY'
  | 'ADJUST_PRICE'
  | 'WARNING_UNSAFE';

export type ProfitDecisionCode =
  | 'INCOMPLETE_COST_DATA'
  | 'LOSS_OR_BELOW_TARGET_NO_SUBSIDY'
  | 'REDUCE_SUBSIDY_FIRST'
  | 'EXACT_TARGET_MET'
  | 'TARGET_MET_KEEP_OR_SUBSIDIZE';

export interface ShippingOptionProfitBreakdown {
  optionId: string;
  courierCode: string;
  courierName: string;
  serviceCode: string;
  serviceName: string;
  etd: string;
  shippingCost: number;
  appliedSubsidy: number;
  buyerShippingPay: number;
  buyerTotalCheckout: number;
  netProfit: number;
  rawMaxSubsidyBudget: number;
  maxSafeSubsidyForOption: number;
  buyerRemainingAtMaxSubsidy: number;
  profitWithNormalShipping: number;
  profitWithFullFreeShipping: number;
  canFullFreeShipping: boolean;
  isCurrentSchemeMeetingTarget: boolean;
  recommendedOptionScheme: 'NORMAL_SHIPPING' | 'PARTIAL_SUBSIDY' | 'FREE_SHIPPING' | 'UNSAFE_MARGIN';
  recommendedOptionSubsidy: number;
  buyerPayUnderRecommendation: number;
  profitUnderRecommendation: number;
}

export interface ProfitEvaluationResult {
  salePrice: number;
  costPrice: number;
  packagingCost: number;
  otherCost: number;
  totalBaseCost: number;
  grossMarginBeforeSubsidy: number;
  currentSubsidy: number;
  minProfitTarget: number;
  shippingCost: number;
  appliedSubsidy: number;
  buyerShippingPay: number;
  buyerTotalCheckout: number;
  netProfit: number;
  rawMaxSubsidyBudget: number;
  maxShippingSubsidy: number;
  buyerRemainingShippingAtMaxSubsidy: number;
  profitWithNormalShipping: number;
  profitWithFullFreeShipping: number;
  canFullFreeShipping: boolean;
  isCostDataComplete: boolean;
  isTargetMet: boolean;
  isSafe: boolean;
  allOptionsCauseShortfall: boolean;
  decisionCode: ProfitDecisionCode;
  currentSchemeType: ShippingSchemeType;
  recommendedSchemeType: ShippingSchemeType;
  recommendedSchemeLabel: string;
  recommendedSalePrice: number;
  recommendedSubsidy: number;
  recommendedBuyerShippingPay: number;
  recommendedBuyerTotalCheckout: number;
  recommendedNetProfit: number;
  optionalPromoSubsidy: number;
  optionalPromoBuyerShippingPay: number;
  optionalPromoNetProfit: number;
  optionalPromoLabel: string;
  requiresPriceChange: boolean;
  requiresSubsidyChange: boolean;
  statusBadgeText: string;
  summaryText: string;
  warnings: string[];
  selectedOption: ShippingOptionProfitBreakdown | null;
  optionsBreakdown: ShippingOptionProfitBreakdown[];
}

export function evaluateProductProfitAndSubsidy(
  input: ProfitEvaluationInput,
): ProfitEvaluationResult {
  const salePrice = Math.max(0, Math.round(input.salePrice || 0));
  const costPrice = Math.max(0, Math.round(input.costPrice || 0));
  const packagingCost = Math.max(0, Math.round(input.packagingCost || 0));
  const otherCost = Math.max(0, Math.round(input.otherCost || 0));
  const currentSubsidy = Math.max(0, Math.round(input.currentSubsidy || 0));
  const minProfitTarget = Math.max(0, Math.round(input.minProfitTarget ?? 15000));

  const totalBaseCost = costPrice + packagingCost + otherCost;
  const grossMarginBeforeSubsidy = salePrice - totalBaseCost;
  const rawMaxSubsidyBudget = Math.max(0, grossMarginBeforeSubsidy - minProfitTarget);

  const isCostDataComplete = salePrice > 0 && costPrice > 0;
  const validOptions = (input.shippingOptions || []).filter(
    (opt) => typeof opt.cost === 'number' && opt.cost >= 0,
  );

  const optionsBreakdown: ShippingOptionProfitBreakdown[] = validOptions.map((opt) => {
    const shippingCost = Math.round(opt.cost);
    const appliedSubsidy = Math.min(shippingCost, currentSubsidy);
    const buyerShippingPay = Math.max(0, shippingCost - appliedSubsidy);
    const buyerTotalCheckout = salePrice + buyerShippingPay;
    const netProfit = grossMarginBeforeSubsidy - appliedSubsidy;
    const maxSafeSubsidyForOption = Math.max(
      0,
      Math.min(shippingCost, grossMarginBeforeSubsidy - minProfitTarget),
    );
    const buyerRemainingAtMaxSubsidy = Math.max(0, shippingCost - maxSafeSubsidyForOption);
    const profitWithNormalShipping = grossMarginBeforeSubsidy;
    const profitWithFullFreeShipping = grossMarginBeforeSubsidy - shippingCost;
    const canFullFreeShipping = isCostDataComplete && profitWithFullFreeShipping >= minProfitTarget;
    const isCurrentSchemeMeetingTarget = isCostDataComplete && netProfit >= minProfitTarget;

    let recommendedOptionScheme: ShippingOptionProfitBreakdown['recommendedOptionScheme'];
    let recommendedOptionSubsidy = appliedSubsidy;

    if (!isCostDataComplete || grossMarginBeforeSubsidy < minProfitTarget) {
      recommendedOptionScheme = 'UNSAFE_MARGIN';
      recommendedOptionSubsidy = 0;
    } else if (netProfit < minProfitTarget) {
      // Kurangi subsidi terlebih dahulu ke batas aman maksimal
      recommendedOptionSubsidy = maxSafeSubsidyForOption;
      recommendedOptionScheme =
        recommendedOptionSubsidy > 0 ? 'PARTIAL_SUBSIDY' : 'NORMAL_SHIPPING';
    } else if (netProfit === minProfitTarget) {
      recommendedOptionSubsidy = appliedSubsidy;
      recommendedOptionScheme =
        appliedSubsidy >= shippingCost && shippingCost > 0
          ? 'FREE_SHIPPING'
          : appliedSubsidy > 0
            ? 'PARTIAL_SUBSIDY'
            : 'NORMAL_SHIPPING';
    } else {
      // Laba sudah melebihi target: skema saat ini sudah aman, namun kita catat potensi promo
      recommendedOptionSubsidy = appliedSubsidy;
      if (appliedSubsidy >= shippingCost && shippingCost > 0) {
        recommendedOptionScheme = 'FREE_SHIPPING';
      } else if (appliedSubsidy > 0) {
        recommendedOptionScheme = 'PARTIAL_SUBSIDY';
      } else {
        recommendedOptionScheme = 'NORMAL_SHIPPING';
      }
    }

    const buyerPayUnderRecommendation = Math.max(0, shippingCost - recommendedOptionSubsidy);
    const profitUnderRecommendation = grossMarginBeforeSubsidy - recommendedOptionSubsidy;

    return {
      optionId: opt.optionId,
      courierCode: opt.courierCode,
      courierName: opt.courierName,
      serviceCode: opt.serviceCode,
      serviceName: opt.serviceName,
      etd: opt.etd,
      shippingCost,
      appliedSubsidy,
      buyerShippingPay,
      buyerTotalCheckout,
      netProfit,
      rawMaxSubsidyBudget,
      maxSafeSubsidyForOption,
      buyerRemainingAtMaxSubsidy,
      profitWithNormalShipping,
      profitWithFullFreeShipping,
      canFullFreeShipping,
      isCurrentSchemeMeetingTarget,
      recommendedOptionScheme,
      recommendedOptionSubsidy,
      buyerPayUnderRecommendation,
      profitUnderRecommendation,
    };
  });

  // Pilih opsi ongkir yang disorot (selectedOptionId atau opsi pertama / reguler termurah)
  const selectedOption =
    (input.selectedOptionId
      ? optionsBreakdown.find((o) => o.optionId === input.selectedOptionId)
      : undefined) ??
    optionsBreakdown[0] ??
    null;

  const shippingCost = selectedOption ? selectedOption.shippingCost : 0;
  const appliedSubsidy = selectedOption
    ? selectedOption.appliedSubsidy
    : Math.max(0, currentSubsidy);
  const buyerShippingPay = Math.max(0, shippingCost - appliedSubsidy);
  const buyerTotalCheckout = salePrice + buyerShippingPay;
  const netProfit = grossMarginBeforeSubsidy - appliedSubsidy;
  const maxShippingSubsidy = selectedOption
    ? selectedOption.maxSafeSubsidyForOption
    : rawMaxSubsidyBudget;
  const buyerRemainingShippingAtMaxSubsidy = Math.max(0, shippingCost - maxShippingSubsidy);
  const profitWithNormalShipping = grossMarginBeforeSubsidy;
  const profitWithFullFreeShipping = grossMarginBeforeSubsidy - shippingCost;
  const canFullFreeShipping = isCostDataComplete && profitWithFullFreeShipping >= minProfitTarget;

  const warnings: string[] = [];

  const currentSchemeType: ShippingSchemeType =
    appliedSubsidy >= shippingCost && shippingCost > 0
      ? 'FREE_SHIPPING'
      : appliedSubsidy > 0
        ? 'PARTIAL_SUBSIDY'
        : 'NORMAL_SHIPPING';

  // Case 1: Data biaya belum lengkap
  if (!isCostDataComplete) {
    warnings.push(
      'Data HPP (Harga Modal) atau Harga Jual belum lengkap. Sistem tidak mengklaim transaksi aman sebelum HPP produk diisi dengan benar.',
    );
    const fallbackRecommendedPrice = Math.max(salePrice, totalBaseCost + minProfitTarget);
    return {
      salePrice,
      costPrice,
      packagingCost,
      otherCost,
      totalBaseCost,
      grossMarginBeforeSubsidy,
      currentSubsidy,
      minProfitTarget,
      shippingCost,
      appliedSubsidy,
      buyerShippingPay,
      buyerTotalCheckout,
      netProfit,
      rawMaxSubsidyBudget: 0,
      maxShippingSubsidy: 0,
      buyerRemainingShippingAtMaxSubsidy: shippingCost,
      profitWithNormalShipping,
      profitWithFullFreeShipping,
      canFullFreeShipping: false,
      isCostDataComplete: false,
      isTargetMet: false,
      isSafe: false,
      allOptionsCauseShortfall: true,
      decisionCode: 'INCOMPLETE_COST_DATA',
      currentSchemeType,
      recommendedSchemeType: 'WARNING_UNSAFE',
      recommendedSchemeLabel: 'Peringatan: Data Biaya / HPP Belum Lengkap',
      recommendedSalePrice: fallbackRecommendedPrice,
      recommendedSubsidy: 0,
      recommendedBuyerShippingPay: shippingCost,
      recommendedBuyerTotalCheckout: fallbackRecommendedPrice + shippingCost,
      recommendedNetProfit: fallbackRecommendedPrice - totalBaseCost,
      optionalPromoSubsidy: 0,
      optionalPromoBuyerShippingPay: shippingCost,
      optionalPromoNetProfit: fallbackRecommendedPrice - totalBaseCost,
      optionalPromoLabel: 'Tidak ada rekomendasi subsidi sebelum HPP lengkap',
      requiresPriceChange: false,
      requiresSubsidyChange: false,
      statusBadgeText: 'Peringatan: Data Biaya Belum Lengkap',
      summaryText:
        'Mohon lengkapi Harga Jual dan HPP (Harga Modal) terlebih dahulu agar perhitungan laba dan subsidi ongkir akurat.',
      warnings,
      selectedOption,
      optionsBreakdown,
    };
  }

  // Case 2: Bahkan dengan ongkir normal (subsidi Rp 0), margin kotor masih di bawah target laba (atau rugi)
  if (grossMarginBeforeSubsidy < minProfitTarget) {
    const safeSalePrice = totalBaseCost + minProfitTarget;
    if (grossMarginBeforeSubsidy <= 0) {
      warnings.push(
        `PERINGATAN KERUGIAN: Harga jual (Rp ${salePrice.toLocaleString('id-ID')}) lebih rendah atau sama dengan total modal + biaya (Rp ${totalBaseCost.toLocaleString('id-ID')}). Semua pilihan ongkir tetap menyebabkan kerugian!`,
      );
    } else {
      warnings.push(
        `Laba sebelum subsidi (Rp ${grossMarginBeforeSubsidy.toLocaleString('id-ID')}) masih di bawah target laba minimum (Rp ${minProfitTarget.toLocaleString('id-ID')}). Jangan memberikan subsidi ongkir dan naikkan harga jual minimal menjadi Rp ${safeSalePrice.toLocaleString('id-ID')}.`,
      );
    }

    return {
      salePrice,
      costPrice,
      packagingCost,
      otherCost,
      totalBaseCost,
      grossMarginBeforeSubsidy,
      currentSubsidy,
      minProfitTarget,
      shippingCost,
      appliedSubsidy,
      buyerShippingPay,
      buyerTotalCheckout,
      netProfit,
      rawMaxSubsidyBudget: 0,
      maxShippingSubsidy: 0,
      buyerRemainingShippingAtMaxSubsidy: shippingCost,
      profitWithNormalShipping,
      profitWithFullFreeShipping,
      canFullFreeShipping: false,
      isCostDataComplete: true,
      isTargetMet: false,
      isSafe: false,
      allOptionsCauseShortfall: true,
      decisionCode: 'LOSS_OR_BELOW_TARGET_NO_SUBSIDY',
      currentSchemeType,
      recommendedSchemeType: 'ADJUST_PRICE',
      recommendedSchemeLabel: 'Ongkir Normal (Rp 0 Subsidi) + Sesuaikan Harga Jual',
      recommendedSalePrice: safeSalePrice,
      recommendedSubsidy: 0,
      recommendedBuyerShippingPay: shippingCost,
      recommendedBuyerTotalCheckout: safeSalePrice + shippingCost,
      recommendedNetProfit: minProfitTarget,
      optionalPromoSubsidy: 0,
      optionalPromoBuyerShippingPay: shippingCost,
      optionalPromoNetProfit: minProfitTarget,
      optionalPromoLabel: 'Gratis ongkir tidak direkomendasikan karena laba di bawah target',
      requiresPriceChange: true,
      requiresSubsidyChange: currentSubsidy > 0,
      statusBadgeText:
        grossMarginBeforeSubsidy <= 0
          ? 'Bahaya: Transaksi Merugi'
          : 'Laba Di Bawah Target (Perlu Penyesuaian Harga)',
      summaryText: `Tanpa subsidi ongkir sekalipun, laba hanya Rp ${grossMarginBeforeSubsidy.toLocaleString('id-ID')} (target minimal Rp ${minProfitTarget.toLocaleString('id-ID')}). Kurangi subsidi menjadi Rp 0 dan naikkan harga jual ke Rp ${safeSalePrice.toLocaleString('id-ID')}.`,
      warnings,
      selectedOption,
      optionsBreakdown,
    };
  }

  // Case 3: Margin kotor cukup (>= minProfitTarget), tetapi subsidi saat ini terlalu besar sehingga netProfit < minProfitTarget
  if (netProfit < minProfitTarget) {
    const safeSubsidy = maxShippingSubsidy;
    const remainingBuyerShipping = Math.max(0, shippingCost - safeSubsidy);
    warnings.push(
      `Subsidi ongkir saat ini (Rp ${appliedSubsidy.toLocaleString('id-ID')}) membuat laba bersih turun menjadi Rp ${netProfit.toLocaleString('id-ID')} (di bawah target Rp ${minProfitTarget.toLocaleString('id-ID')}). Kurangi subsidi ongkir menjadi maksimal Rp ${safeSubsidy.toLocaleString('id-ID')} (pembeli membayar sisa ongkir Rp ${remainingBuyerShipping.toLocaleString('id-ID')}) tanpa perlu menaikkan harga jual.`,
    );

    const recSchemeType: ShippingSchemeType =
      safeSubsidy > 0 ? 'PARTIAL_SUBSIDY' : 'NORMAL_SHIPPING';
    const recSchemeLabel =
      safeSubsidy > 0
        ? `Subsidi Ongkir Sebagian (Maks Rp ${safeSubsidy.toLocaleString('id-ID')}, Pembeli Bayar Rp ${remainingBuyerShipping.toLocaleString('id-ID')})`
        : 'Ongkir Normal Ditanggung Pembeli (Tanpa Subsidi)';

    return {
      salePrice,
      costPrice,
      packagingCost,
      otherCost,
      totalBaseCost,
      grossMarginBeforeSubsidy,
      currentSubsidy,
      minProfitTarget,
      shippingCost,
      appliedSubsidy,
      buyerShippingPay,
      buyerTotalCheckout,
      netProfit,
      rawMaxSubsidyBudget,
      maxShippingSubsidy,
      buyerRemainingShippingAtMaxSubsidy: remainingBuyerShipping,
      profitWithNormalShipping,
      profitWithFullFreeShipping,
      canFullFreeShipping: false,
      isCostDataComplete: true,
      isTargetMet: false,
      isSafe: false,
      allOptionsCauseShortfall: false,
      decisionCode: 'REDUCE_SUBSIDY_FIRST',
      currentSchemeType,
      recommendedSchemeType: recSchemeType,
      recommendedSchemeLabel: recSchemeLabel,
      recommendedSalePrice: salePrice,
      recommendedSubsidy: safeSubsidy,
      recommendedBuyerShippingPay: remainingBuyerShipping,
      recommendedBuyerTotalCheckout: salePrice + remainingBuyerShipping,
      recommendedNetProfit: grossMarginBeforeSubsidy - safeSubsidy,
      optionalPromoSubsidy: safeSubsidy,
      optionalPromoBuyerShippingPay: remainingBuyerShipping,
      optionalPromoNetProfit: grossMarginBeforeSubsidy - safeSubsidy,
      optionalPromoLabel:
        safeSubsidy > 0
          ? `Subsidi Sebagian Rp ${safeSubsidy.toLocaleString('id-ID')} (Sisa Ongkir Pembeli Rp ${remainingBuyerShipping.toLocaleString('id-ID')})`
          : 'Ongkir Normal (Gratis Ongkir Tidak Aman)',
      requiresPriceChange: false,
      requiresSubsidyChange: true,
      statusBadgeText: 'Subsidi Terlalu Besar (Kurangi Subsidi Ongkir)',
      summaryText: `Pertahankan harga jual Rp ${salePrice.toLocaleString('id-ID')}, tetapi kurangi subsidi ongkir ke Rp ${safeSubsidy.toLocaleString('id-ID')} agar laba mencapai target Rp ${minProfitTarget.toLocaleString('id-ID')}. Sisa ongkir yang dibayar pembeli: Rp ${remainingBuyerShipping.toLocaleString('id-ID')}.`,
      warnings,
      selectedOption,
      optionsBreakdown,
    };
  }

  // Case 4: Laba tepat mencapai target minimum (netProfit === minProfitTarget)
  if (netProfit === minProfitTarget) {
    if (!canFullFreeShipping && shippingCost > appliedSubsidy) {
      warnings.push(
        `Gratis ongkir penuh tidak direkomendasikan karena akan menurunkan laba di bawah Rp ${minProfitTarget.toLocaleString('id-ID')}. Pembeli tetap membayar sisa ongkir Rp ${buyerShippingPay.toLocaleString('id-ID')}.`,
      );
    }

    const currentLabel =
      currentSchemeType === 'FREE_SHIPPING'
        ? 'Gratis Ongkir Penuh (Tepat Target Laba)'
        : currentSchemeType === 'PARTIAL_SUBSIDY'
          ? `Subsidi Sebagian Rp ${appliedSubsidy.toLocaleString('id-ID')} (Pembeli Bayar Rp ${buyerShippingPay.toLocaleString('id-ID')})`
          : 'Ongkir Normal Ditanggung Pembeli (Tepat Target Laba)';

    return {
      salePrice,
      costPrice,
      packagingCost,
      otherCost,
      totalBaseCost,
      grossMarginBeforeSubsidy,
      currentSubsidy,
      minProfitTarget,
      shippingCost,
      appliedSubsidy,
      buyerShippingPay,
      buyerTotalCheckout,
      netProfit,
      rawMaxSubsidyBudget,
      maxShippingSubsidy,
      buyerRemainingShippingAtMaxSubsidy,
      profitWithNormalShipping,
      profitWithFullFreeShipping,
      canFullFreeShipping,
      isCostDataComplete: true,
      isTargetMet: true,
      isSafe: true,
      allOptionsCauseShortfall: false,
      decisionCode: 'EXACT_TARGET_MET',
      currentSchemeType,
      recommendedSchemeType: currentSchemeType,
      recommendedSchemeLabel: `Pertahankan Skema Saat Ini: ${currentLabel}`,
      recommendedSalePrice: salePrice,
      recommendedSubsidy: appliedSubsidy,
      recommendedBuyerShippingPay: buyerShippingPay,
      recommendedBuyerTotalCheckout: buyerTotalCheckout,
      recommendedNetProfit: netProfit,
      optionalPromoSubsidy: appliedSubsidy,
      optionalPromoBuyerShippingPay: buyerShippingPay,
      optionalPromoNetProfit: netProfit,
      optionalPromoLabel: 'Sudah pada batas maksimal subsidi aman (tepat target laba)',
      requiresPriceChange: false,
      requiresSubsidyChange: false,
      statusBadgeText: 'Aman: Laba Tepat Mencapai Target Minimum',
      summaryText: `Harga jual Rp ${salePrice.toLocaleString('id-ID')} dan skema ongkir saat ini menghasilkan laba tepat Rp ${netProfit.toLocaleString('id-ID')}. Pertahankan skema ini tanpa menambah subsidi agar laba tidak turun di bawah target.`,
      warnings,
      selectedOption,
      optionsBreakdown,
    };
  }

  // Case 5: Laba melebihi target minimum (netProfit > minProfitTarget)
  // Aturan:
  // - Pertahankan harga dan skema ongkir yang ada jika sudah memenuhi target laba.
  // - Berikan rekomendasi subsidi ongkir (opsional) hanya jika dapat meningkatkan daya tarik produk tanpa membuat laba turun di bawah target.
  // - Jika gratis ongkir menyebabkan laba di bawah target, jangan merekomendasikan gratis ongkir penuh; hitung sisa ongkir yang perlu dibayar pembeli.
  let optionalPromoSubsidy = appliedSubsidy;
  let optionalPromoLabel = 'Pertahankan Ongkir Normal';

  if (shippingCost > 0) {
    if (canFullFreeShipping) {
      optionalPromoSubsidy = shippingCost;
      optionalPromoLabel = `Dapat Gratis Ongkir Penuh (Subsidi Rp ${shippingCost.toLocaleString('id-ID')}, Laba Tetap Aman Rp ${(grossMarginBeforeSubsidy - shippingCost).toLocaleString('id-ID')})`;
    } else if (maxShippingSubsidy > 0) {
      optionalPromoSubsidy = maxShippingSubsidy;
      const buyerRem = Math.max(0, shippingCost - maxShippingSubsidy);
      optionalPromoLabel = `Subsidi Sebagian Maks Rp ${maxShippingSubsidy.toLocaleString('id-ID')} (Jangan Gratis Ongkir Penuh; Pembeli Bayar Sisa Rp ${buyerRem.toLocaleString('id-ID')})`;
      warnings.push(
        `Gratis ongkir penuh (Rp ${shippingCost.toLocaleString('id-ID')}) tidak direkomendasikan karena laba akan turun menjadi Rp ${profitWithFullFreeShipping.toLocaleString('id-ID')} (di bawah target Rp ${minProfitTarget.toLocaleString('id-ID')}). Jika ingin memberi promo, gunakan Subsidi Sebagian maksimal Rp ${maxShippingSubsidy.toLocaleString('id-ID')} dan pembeli membayar sisa ongkir Rp ${buyerRem.toLocaleString('id-ID')}.`,
      );
    }
  }

  const optionalPromoBuyerShippingPay = Math.max(0, shippingCost - optionalPromoSubsidy);
  const optionalPromoNetProfit = grossMarginBeforeSubsidy - optionalPromoSubsidy;

  const currentLabel =
    currentSchemeType === 'FREE_SHIPPING'
      ? `Gratis Ongkir Penuh (Subsidi Rp ${appliedSubsidy.toLocaleString('id-ID')})`
      : currentSchemeType === 'PARTIAL_SUBSIDY'
        ? `Subsidi Ongkir Sebagian Rp ${appliedSubsidy.toLocaleString('id-ID')} (Pembeli Bayar Rp ${buyerShippingPay.toLocaleString('id-ID')})`
        : 'Ongkir Normal (Ditanggung Pembeli)';

  return {
    salePrice,
    costPrice,
    packagingCost,
    otherCost,
    totalBaseCost,
    grossMarginBeforeSubsidy,
    currentSubsidy,
    minProfitTarget,
    shippingCost,
    appliedSubsidy,
    buyerShippingPay,
    buyerTotalCheckout,
    netProfit,
    rawMaxSubsidyBudget,
    maxShippingSubsidy,
    buyerRemainingShippingAtMaxSubsidy,
    profitWithNormalShipping,
    profitWithFullFreeShipping,
    canFullFreeShipping,
    isCostDataComplete: true,
    isTargetMet: true,
    isSafe: true,
    allOptionsCauseShortfall: false,
    decisionCode: 'TARGET_MET_KEEP_OR_SUBSIDIZE',
    currentSchemeType,
    recommendedSchemeType: currentSchemeType,
    recommendedSchemeLabel: `Pertahankan Skema Saat Ini (${currentLabel}) — Opsional: ${optionalPromoLabel}`,
    recommendedSalePrice: salePrice,
    recommendedSubsidy: appliedSubsidy,
    recommendedBuyerShippingPay: buyerShippingPay,
    recommendedBuyerTotalCheckout: buyerTotalCheckout,
    recommendedNetProfit: netProfit,
    optionalPromoSubsidy,
    optionalPromoBuyerShippingPay,
    optionalPromoNetProfit,
    optionalPromoLabel,
    requiresPriceChange: false,
    requiresSubsidyChange: false,
    statusBadgeText: 'Aman: Harga & Ongkir Memenuhi Target Laba',
    summaryText: `Harga jual Rp ${salePrice.toLocaleString('id-ID')} dan skema ongkir saat ini menghasilkan laba bersih Rp ${netProfit.toLocaleString('id-ID')} (di atas target Rp ${minProfitTarget.toLocaleString('id-ID')}). Skema saat ini aman dipertahankan. ${optionalPromoLabel}.`,
    warnings,
    selectedOption,
    optionsBreakdown,
  };
}

