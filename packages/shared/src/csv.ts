/**
 * CSV import contract. The downloadable template, the parser and the exporter all use PRODUCT_CSV_COLUMNS,
 * so the template always matches the parser.
 */
export const PRODUCT_CSV_COLUMNS = [
  'sku',
  'name',
  'slug',
  'category',
  'description',
  'sale_price',
  'compare_at_price',
  'currency',
  'weight_gram',
  'stock_qty',
  'supplier_name',
  'supplier_sku',
  'warehouse_name',
  'cost_price',
  'supplier_product_url',
  'image_url',
  'cod_enabled',
  'status',
] as const;
export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

export const REQUIRED_CSV_COLUMNS: ProductCsvColumn[] = ['sku', 'name', 'sale_price', 'weight_gram'];

/** Protected field groups: never changed on existing SKUs unless admin explicitly enables the group. */
export const PROTECTED_FIELD_GROUPS = {
  PRICE: ['sale_price', 'compare_at_price'],
  COST: ['cost_price'],
  STOCK: ['stock_qty'],
  STATUS: ['status'],
  SUPPLIER: ['supplier_name', 'supplier_sku', 'warehouse_name', 'supplier_product_url'],
  COD: ['cod_enabled'],
} as const;
export type ProtectedGroup = keyof typeof PROTECTED_FIELD_GROUPS;

export class CsvParseError extends Error {}

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, UTF-8 BOM. */
export function parseCsv(text: string, maxRows = Infinity): string[][] {
  if (text.includes('\u0000')) throw new CsvParseError('File bukan teks CSV yang valid (mengandung byte NUL).');
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushRow = () => {
    row.push(field);
    field = '';
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
    if (rows.length > maxRows) throw new CsvParseError(`Jumlah baris melebihi batas ${maxRows - 1}.`);
  };
  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field.length > 0) throw new CsvParseError(`Tanda kutip tidak valid di baris ${rows.length + 1}.`);
      inQuotes = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r') {
      i++;
    } else if (c === '\n') {
      pushRow();
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (inQuotes) throw new CsvParseError('Tanda kutip tidak ditutup di akhir file.');
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Escape a value for CSV; also neutralizes spreadsheet formula injection (=,+,-,@). */
export function csvEscape(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: readonly string[], rows: Array<Record<string, unknown>>): string {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export interface NormalizedImportRow {
  rowNumber: number; // 1-based line number in the file (header = 1)
  sku: string;
  name: string;
  slug: string;
  category: string | null;
  description: string;
  salePrice: number;
  compareAtPrice: number | null;
  weightGram: number;
  stockQty: number | null;
  supplierName: string | null;
  supplierSku: string | null;
  warehouseName: string | null;
  costPrice: number | null;
  supplierProductUrl: string | null;
  imageUrl: string | null;
  codEnabled: boolean | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  provided: ProductCsvColumn[]; // columns that had a non-empty value
}

export interface RowError {
  rowNumber: number;
  column: string | null;
  sku: string | null;
  message: string;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const intRe = /^\d+$/;

/** Validate header + rows. Pure function (no DB). Returns normalized valid rows and per-cell errors. */
export function validateImportRows(
  rows: string[][],
): { header: string[]; valid: NormalizedImportRow[]; errors: RowError[]; totalRows: number } {
  const errors: RowError[] = [];
  if (rows.length === 0) {
    return { header: [], valid: [], errors: [{ rowNumber: 1, column: null, sku: null, message: 'File kosong.' }], totalRows: 0 };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const unknown = header.filter((h) => !(PRODUCT_CSV_COLUMNS as readonly string[]).includes(h));
  const missing = REQUIRED_CSV_COLUMNS.filter((c) => !header.includes(c));
  const dupHeader = header.filter((h, i) => header.indexOf(h) !== i);
  if (unknown.length) errors.push({ rowNumber: 1, column: unknown.join('|'), sku: null, message: `Kolom tidak dikenal: ${unknown.join(', ')}` });
  if (missing.length) errors.push({ rowNumber: 1, column: missing.join('|'), sku: null, message: `Kolom wajib tidak ada: ${missing.join(', ')}` });
  if (dupHeader.length) errors.push({ rowNumber: 1, column: dupHeader.join('|'), sku: null, message: `Kolom ganda: ${dupHeader.join(', ')}` });
  if (errors.length) return { header, valid: [], errors, totalRows: rows.length - 1 };

  const skuRows = new Map<string, number[]>();
  const slugRows = new Map<string, number[]>();
  const candidates: NormalizedImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const cells = rows[i];
    const rowErrors: RowError[] = [];
    if (cells.length !== header.length) {
      errors.push({ rowNumber, column: null, sku: cells[0] ?? null, message: `Jumlah kolom ${cells.length}, seharusnya ${header.length}.` });
      continue;
    }
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => (rec[h] = (cells[idx] ?? '').trim()));
    const sku = (rec.sku ?? '').toUpperCase();
    const err = (column: string, message: string) => rowErrors.push({ rowNumber, column, sku: sku || null, message });

    if (!/^[A-Z0-9._-]{2,64}$/.test(sku)) err('sku', 'SKU wajib, 2–64 karakter huruf/angka/._-');
    const name = rec.name ?? '';
    if (name.length < 3 || name.length > 160) err('name', 'Nama wajib 3–160 karakter');
    const slug = rec.slug ? rec.slug.toLowerCase() : slugify(name);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) err('slug', 'Slug tidak valid');
    const parseMoney = (col: string, required: boolean): number | null => {
      const v = rec[col] ?? '';
      if (v === '') {
        if (required) err(col, 'Wajib diisi');
        return null;
      }
      if (!intRe.test(v)) {
        err(col, 'Harus bilangan bulat rupiah tanpa titik/koma/Rp (mis. 125000)');
        return null;
      }
      const n = Number(v);
      if (n > 10_000_000_000) err(col, 'Nilai terlalu besar');
      return n;
    };
    const salePrice = parseMoney('sale_price', true);
    if (salePrice === 0) err('sale_price', 'Harga jual harus > 0');
    const compareAtPrice = parseMoney('compare_at_price', false);
    if (compareAtPrice != null && salePrice != null && compareAtPrice <= salePrice)
      err('compare_at_price', 'Harga coret harus lebih besar dari harga jual');
    const costPrice = parseMoney('cost_price', false);
    const weight = parseMoney('weight_gram', true);
    if (weight != null && (weight < 1 || weight > 100_000)) err('weight_gram', 'Berat 1–100000 gram');
    const stockRaw = rec.stock_qty ?? '';
    let stockQty: number | null = null;
    if (stockRaw !== '') {
      if (!intRe.test(stockRaw) || Number(stockRaw) > 1_000_000) err('stock_qty', 'Stok bilangan bulat 0–1000000');
      else stockQty = Number(stockRaw);
    }
    const currency = (rec.currency ?? '').toUpperCase();
    if (currency && currency !== 'IDR') err('currency', 'Hanya IDR yang didukung');
    const status = ((rec.status ?? '') || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) err('status', 'Status harus DRAFT, ACTIVE, atau ARCHIVED');
    const cod = (rec.cod_enabled ?? '').toLowerCase();
    let codEnabled: boolean | null = null;
    if (cod !== '') {
      if (['true', '1', 'ya', 'yes'].includes(cod)) codEnabled = true;
      else if (['false', '0', 'tidak', 'no'].includes(cod)) codEnabled = false;
      else err('cod_enabled', 'Isi true/false');
    }
    const url = (col: string, allowRelative = false): string | null => {
      const v = rec[col] ?? '';
      if (!v) return null;
      if (allowRelative && /^\/(demo|media)\/[A-Za-z0-9._\-/]+$/.test(v)) return v;
      if (v.length > 2048 || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v)) {
        err(col, 'URL harus diawali http:// atau https:// tanpa spasi');
        return null;
      }
      return v;
    };
    const supplierProductUrl = url('supplier_product_url', false);
    const imageUrl = url('image_url', true);
    const supplierName = rec.supplier_name || null;
    const supplierSku = rec.supplier_sku || null;
    const warehouseName = rec.warehouse_name || null;
    const supplierParts = [supplierName, supplierSku, warehouseName].filter(Boolean).length;
    if (supplierParts > 0 && supplierParts < 3)
      err('supplier_name', 'supplier_name, supplier_sku, dan warehouse_name harus diisi bersama');
    if (supplierParts === 3 && costPrice == null) err('cost_price', 'Harga modal wajib bila data pemasok diisi');
    const description = rec.description ?? '';
    if (description.length > 20_000) err('description', 'Deskripsi terlalu panjang');
    const category = rec.category || null;
    if (category && category.length > 80) err('category', 'Nama kategori maksimal 80 karakter');

    if (sku) skuRows.set(sku, [...(skuRows.get(sku) ?? []), rowNumber]);
    if (slug) slugRows.set(slug, [...(slugRows.get(slug) ?? []), rowNumber]);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }
    candidates.push({
      rowNumber,
      sku,
      name,
      slug,
      category,
      description,
      salePrice: salePrice!,
      compareAtPrice,
      weightGram: weight!,
      stockQty,
      supplierName,
      supplierSku,
      warehouseName,
      costPrice,
      supplierProductUrl,
      imageUrl,
      codEnabled,
      status: status as NormalizedImportRow['status'],
      provided: header.filter((h) => (rec[h] ?? '') !== '') as ProductCsvColumn[],
    });
  }

  const dupSkuRows = new Set<number>();
  for (const [sku, nums] of skuRows) {
    if (nums.length > 1) {
      for (const n of nums) {
        dupSkuRows.add(n);
        errors.push({ rowNumber: n, column: 'sku', sku, message: `SKU duplikat di file (baris ${nums.join(', ')})` });
      }
    }
  }
  for (const [slug, nums] of slugRows) {
    if (nums.length > 1) {
      for (const n of nums) {
        dupSkuRows.add(n);
        errors.push({ rowNumber: n, column: 'slug', sku: null, message: `Slug "${slug}" duplikat di file (baris ${nums.join(', ')})` });
      }
    }
  }
  const valid = candidates.filter((c) => !dupSkuRows.has(c.rowNumber));
  errors.sort((a, b) => a.rowNumber - b.rowNumber);
  return { header, valid, errors, totalRows: rows.length - 1 };
}

export function errorsToCsv(errors: RowError[]): string {
  return toCsv(
    ['row', 'column', 'sku', 'reason'],
    errors.map((e) => ({ row: e.rowNumber, column: e.column ?? '', sku: e.sku ?? '', reason: e.message })),
  );
}

