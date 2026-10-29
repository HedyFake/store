export interface ShippingLabelPdfInput {
  storeName: string;
  storePhone?: string | null;
  orderNumber: string;
  createdAt: Date | string;
  packageSequence: number;
  totalPackages: number;
  paymentMethod: string;
  paymentStatus: string;
  grandTotal: number;
  packageSubtotal: number;
  shippingCost: number;
  codAmount: number;
  carrier: string;
  carrierService?: string | null;
  courierEtd?: string | null;
  trackingNumber?: string | null;
  warehouseName: string;
  warehouseCity: string;
  warehouseProvince?: string | null;
  recipient: {
    name: string;
    phone: string;
    email?: string | null;
    addressLine: string;
    district: string;
    city: string;
    province: string;
    postalCode?: string | null;
    customerNote?: string | null;
  };
  items: Array<{
    name: string;
    variantName?: string | null;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    weightGram?: number;
  }>;
}

function pdfEscape(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return ['-'];
  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function rupiahStr(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

/**
 * Generates a valid, multi-section printable PDF-1.4 shipping label & customer data sheet (A4/A6 friendly).
 * Starts with %PDF-1.4 and has exact xref byte offsets so all PDF readers & Telegram preview it cleanly.
 */
export function buildShippingLabelPdf(data: ShippingLabelPdfInput): Buffer {
  const ops: string[] = [];

  // Page dimensions: 420 x 595 pt (A5 portrait shipping label)
  const width = 420;
  const height = 595;

  // Outer border & header box
  ops.push('0.85 G 1 w');
  ops.push(`18 18 ${width - 36} ${height - 36} re S`);

  // Dark header bar
  ops.push('0.09 0.13 0.12 rg');
  ops.push(`18 ${height - 72} ${width - 36} 54 re f`);

  const drawText = (
    text: string,
    x: number,
    y: number,
    size = 9,
    bold = false,
    rgb: [number, number, number] = [0.1, 0.11, 0.11],
  ) => {
    ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} Td (${pdfEscape(text)}) Tj ET`,
    );
  };

  const drawLine = (y: number) => {
    ops.push('0.82 G 0.7 w');
    ops.push(`18 ${y} m ${width - 18} ${y} l S`);
  };

  // Header content
  drawText((data.storeName || 'Pasti Murahnya').toUpperCase(), 28, height - 40, 13, true, [1, 0.87, 0.35]);
  drawText(
    `LABEL PENGIRIMAN & RESI PESANAN (PAKET #${data.packageSequence}/${data.totalPackages})`,
    28,
    height - 56,
    8.5,
    false,
    [0.95, 0.95, 0.95],
  );

  let y = height - 92;

  // Order & Resi Box
  drawText(`NO. PESANAN: ${data.orderNumber}`, 28, y, 11, true);
  const dateStr = new Date(data.createdAt).toISOString().slice(0, 16).replace('T', ' ');
  drawText(`Tgl: ${dateStr}`, 275, y, 8.5, false, [0.35, 0.35, 0.35]);
  y -= 16;

  const courierLabel = `${data.carrier.toUpperCase()}${data.carrierService ? ' - ' + data.carrierService : ''}${data.courierEtd ? ' (' + data.courierEtd + ')' : ''}`;
  drawText(`KURIR: ${courierLabel}`, 28, y, 10, true);
  y -= 15;

  const resiLabel = data.trackingNumber ? data.trackingNumber : 'MENUNGGU NOMOR RESI KURIR';
  drawText(`NO. RESI: ${resiLabel}`, 28, y, 11, true, [0.08, 0.32, 0.24]);
  y -= 16;

  // Payment / COD highlight box
  const isCod = data.paymentMethod === 'COD';
  ops.push(isCod ? '1 0.95 0.80 rg' : '0.93 0.95 0.94 rg');
  ops.push(`26 ${y - 22} ${width - 52} 28 re f`);
  if (isCod) {
    drawText(
      `METODE: COD (BAYAR DI TEMPAT) - TAGIH TUNAI: ${rupiahStr(data.grandTotal)}`,
      34,
      y - 11,
      9.5,
      true,
      [0.45, 0.25, 0],
    );
  } else {
    drawText(
      `METODE: ${data.paymentMethod} (${data.paymentStatus}) - TOTAL: ${rupiahStr(data.grandTotal)}`,
      34,
      y - 11,
      9,
      true,
      [0.1, 0.2, 0.16],
    );
  }
  y -= 34;
  drawLine(y);
  y -= 16;

  // Recipient (Data Diri Pelanggan)
  drawText('DATA DIRI PELANGGAN / PENERIMA:', 28, y, 9.5, true, [0.08, 0.32, 0.24]);
  y -= 14;
  drawText(`Nama Penerima : ${data.recipient.name}`, 28, y, 9.5, true);
  y -= 13;
  drawText(`No. Telepon/WA: ${data.recipient.phone}`, 28, y, 9.5, true);
  y -= 13;
  if (data.recipient.email) {
    drawText(`Email         : ${data.recipient.email}`, 28, y, 8.5, false);
    y -= 12;
  }

  const fullAddress = `${data.recipient.addressLine}, Kec. ${data.recipient.district}, ${data.recipient.city}, ${data.recipient.province}${data.recipient.postalCode ? ' ' + data.recipient.postalCode : ''}`;
  const addrLines = wrapText(fullAddress, 62);
  drawText('Alamat Tujuan :', 28, y, 8.5, true);
  y -= 12;
  for (const line of addrLines.slice(0, 4)) {
    drawText(line, 28, y, 8.5, false);
    y -= 11;
  }

  if (data.recipient.customerNote) {
    const noteLines = wrapText(`Catatan: ${data.recipient.customerNote}`, 62);
    for (const nl of noteLines.slice(0, 2)) {
      drawText(nl, 28, y, 8, false, [0.35, 0.35, 0.35]);
      y -= 11;
    }
  }

  y -= 4;
  drawLine(y);
  y -= 15;

  // Sender / Warehouse Origin
  drawText('PENGIRIM / GUDANG ASAL:', 28, y, 8.5, true, [0.08, 0.32, 0.24]);
  y -= 12;
  drawText(
    `${data.storeName || 'Pasti Murahnya'} - ${data.warehouseName} (${data.warehouseCity}${data.warehouseProvince ? ', ' + data.warehouseProvince : ''})`,
    28,
    y,
    8.5,
    false,
  );
  if (data.storePhone) {
    y -= 11;
    drawText(`Kontak Toko / WA: ${data.storePhone}`, 28, y, 8, false, [0.35, 0.35, 0.35]);
  }

  y -= 10;
  drawLine(y);
  y -= 15;

  // Items List
  drawText('DAFTAR ISI PAKET:', 28, y, 9, true, [0.08, 0.32, 0.24]);
  y -= 13;

  for (const [idx, it] of data.items.slice(0, 8).entries()) {
    if (y < 55) break;
    const itemTitle = `${idx + 1}. ${it.name}${it.variantName ? ' (' + it.variantName + ')' : ''}`;
    const wrappedTitle = wrapText(itemTitle, 58);
    drawText(wrappedTitle[0], 28, y, 8.5, true);
    y -= 11;
    if (wrappedTitle[1]) {
      drawText('   ' + wrappedTitle[1], 28, y, 8, false);
      y -= 11;
    }
    drawText(
      `   SKU: ${it.sku}  |  Qty: ${it.quantity} unit  |  Harga: ${rupiahStr(it.unitPrice)}  |  Subtotal: ${rupiahStr(it.lineTotal)}`,
      28,
      y,
      8,
      false,
      [0.25, 0.25, 0.25],
    );
    y -= 13;
  }

  // Footer
  drawLine(38);
  drawText(
    'Dokumen ini dibuat otomatis oleh sistem Pasti Murahnya. Harap tempelkan pada paket pengiriman.',
    28,
    26,
    7.5,
    false,
    [0.4, 0.4, 0.4],
  );

  const streamContent = ops.join('\n') + '\n';
  const streamBytes = Buffer.byteLength(streamContent, 'utf8');

  const objects: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamContent}endstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

