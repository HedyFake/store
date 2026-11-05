import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { env } from '../config/env';
import { DEFAULT_SHIPPING_SETTINGS, SettingsService } from '../settings/settings.controller';
import { sanitizeError } from '../common/crypto';

export interface ShippingOption {
  optionId: string;
  courierCode: string;
  courierName: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
  source: 'rajaongkir' | 'flat';
}

export interface DomesticDestination {
  id: string;
  label: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  postalCode: string;
}

const FALLBACK_DESTINATIONS: DomesticDestination[] = [
  {
    id: '17473',
    label: 'Kebayoran Baru, Jakarta Selatan, DKI Jakarta (12190)',
    province: 'DKI Jakarta',
    city: 'Jakarta Selatan',
    district: 'Kebayoran Baru',
    subdistrict: 'Senayan',
    postalCode: '12190',
  },
  {
    id: '17512',
    label: 'Menteng, Jakarta Pusat, DKI Jakarta (10310)',
    province: 'DKI Jakarta',
    city: 'Jakarta Pusat',
    district: 'Menteng',
    subdistrict: 'Menteng',
    postalCode: '10310',
  },
  {
    id: '17345',
    label: 'Grogol Petamburan, Jakarta Barat, DKI Jakarta (11470)',
    province: 'DKI Jakarta',
    city: 'Jakarta Barat',
    district: 'Grogol Petamburan',
    subdistrict: 'Tanjung Duren',
    postalCode: '11470',
  },
  {
    id: '17610',
    label: 'Cakung, Jakarta Timur, DKI Jakarta (13910)',
    province: 'DKI Jakarta',
    city: 'Jakarta Timur',
    district: 'Cakung',
    subdistrict: 'Cakung Timur',
    postalCode: '13910',
  },
  {
    id: '17701',
    label: 'Kelapa Gading, Jakarta Utara, DKI Jakarta (14240)',
    province: 'DKI Jakarta',
    city: 'Jakarta Utara',
    district: 'Kelapa Gading',
    subdistrict: 'Kelapa Gading Barat',
    postalCode: '14240',
  },
  {
    id: '6984',
    label: 'Coblong, Kota Bandung, Jawa Barat (40132)',
    province: 'Jawa Barat',
    city: 'Kota Bandung',
    district: 'Coblong',
    subdistrict: 'Dago',
    postalCode: '40132',
  },
  {
    id: '8120',
    label: 'Cibinong, Kab. Bogor, Jawa Barat (16911)',
    province: 'Jawa Barat',
    city: 'Bogor',
    district: 'Cibinong',
    subdistrict: 'Pakansari',
    postalCode: '16911',
  },
  {
    id: '11420',
    label: 'Beji, Kota Depok, Jawa Barat (16421)',
    province: 'Jawa Barat',
    city: 'Depok',
    district: 'Beji',
    subdistrict: 'Pondok Cina',
    postalCode: '16421',
  },
  {
    id: '7412',
    label: 'Bekasi Selatan, Kota Bekasi, Jawa Barat (17141)',
    province: 'Jawa Barat',
    city: 'Bekasi',
    district: 'Bekasi Selatan',
    subdistrict: 'Pekayon Jaya',
    postalCode: '17141',
  },
  {
    id: '45120',
    label: 'Serpong, Tangerang Selatan, Banten (15310)',
    province: 'Banten',
    city: 'Tangerang Selatan',
    district: 'Serpong',
    subdistrict: 'BSD',
    postalCode: '15310',
  },
  {
    id: '44910',
    label: 'Karawaci, Kota Tangerang, Banten (15115)',
    province: 'Banten',
    city: 'Tangerang',
    district: 'Karawaci',
    subdistrict: 'Karawaci',
    postalCode: '15115',
  },
  {
    id: '33210',
    label: 'Semarang Tengah, Kota Semarang, Jawa Tengah (50131)',
    province: 'Jawa Tengah',
    city: 'Semarang',
    district: 'Semarang Tengah',
    subdistrict: 'Pekunden',
    postalCode: '50131',
  },
  {
    id: '34810',
    label: 'Laweyan, Kota Surakarta (Solo), Jawa Tengah (57141)',
    province: 'Jawa Tengah',
    city: 'Surakarta',
    district: 'Laweyan',
    subdistrict: 'Purwosari',
    postalCode: '57141',
  },
  {
    id: '31597',
    label: 'Depok, Sleman, DI Yogyakarta (55281)',
    province: 'DI Yogyakarta',
    city: 'Sleman',
    district: 'Depok',
    subdistrict: 'Caturtunggal',
    postalCode: '55281',
  },
  {
    id: '31710',
    label: 'Gondokusuman, Kota Yogyakarta, DI Yogyakarta (55221)',
    province: 'DI Yogyakarta',
    city: 'Yogyakarta',
    district: 'Gondokusuman',
    subdistrict: 'Terban',
    postalCode: '55221',
  },
  {
    id: '42915',
    label: 'Gubeng, Kota Surabaya, Jawa Timur (60281)',
    province: 'Jawa Timur',
    city: 'Kota Surabaya',
    district: 'Gubeng',
    subdistrict: 'Airlangga',
    postalCode: '60281',
  },
  {
    id: '41210',
    label: 'Waru, Kab. Sidoarjo, Jawa Timur (61256)',
    province: 'Jawa Timur',
    city: 'Sidoarjo',
    district: 'Waru',
    subdistrict: 'Waru',
    postalCode: '61256',
  },
  {
    id: '38910',
    label: 'Lowokwaru, Kota Malang, Jawa Timur (65141)',
    province: 'Jawa Timur',
    city: 'Malang',
    district: 'Lowokwaru',
    subdistrict: 'Jatimulyo',
    postalCode: '65141',
  },
  {
    id: '5132',
    label: 'Denpasar Selatan, Kota Denpasar, Bali (80228)',
    province: 'Bali',
    city: 'Kota Denpasar',
    district: 'Denpasar Selatan',
    subdistrict: 'Sanur',
    postalCode: '80228',
  },
  {
    id: '24110',
    label: 'Medan Baru, Kota Medan, Sumatera Utara (20152)',
    province: 'Sumatera Utara',
    city: 'Medan',
    district: 'Medan Baru',
    subdistrict: 'Babura',
    postalCode: '20152',
  },
  {
    id: '28110',
    label: 'Ilir Timur I, Kota Palembang, Sumatera Selatan (30121)',
    province: 'Sumatera Selatan',
    city: 'Palembang',
    district: 'Ilir Timur I',
    subdistrict: '20 Ilir',
    postalCode: '30121',
  },
  {
    id: '36110',
    label: 'Panakkukang, Kota Makassar, Sulawesi Selatan (90231)',
    province: 'Sulawesi Selatan',
    city: 'Makassar',
    district: 'Panakkukang',
    subdistrict: 'Masale',
    postalCode: '90231',
  },
  {
    id: '19810',
    label: 'Balikpapan Selatan, Kota Balikpapan, Kalimantan Timur (76114)',
    province: 'Kalimantan Timur',
    city: 'Balikpapan',
    district: 'Balikpapan Selatan',
    subdistrict: 'Sepinggan',
    postalCode: '76114',
  },
];

@Injectable()
export class ShippingService {
  private readonly destCache = new Map<
    string,
    { data: { items: DomesticDestination[]; source: 'rajaongkir' | 'local' }; expiresAt: number }
  >();
  private readonly quoteCache = new Map<string, { data: ShippingOption[]; expiresAt: number }>();

  constructor(private readonly settings: SettingsService) {}

  private isRajaOngkirEnabled(): boolean {
    const e = env();
    return e.SHIPPING_PROVIDER === 'rajaongkir' && Boolean(e.RAJAONGKIR_API_KEY);
  }

  async searchDestinations(search: string): Promise<{ items: DomesticDestination[]; source: 'rajaongkir' | 'local' }> {
    const q = (search ?? '').trim();
    if (q.length < 2) {
      return { items: FALLBACK_DESTINATIONS, source: 'local' };
    }
    const cacheKey = q.toLowerCase();
    const cached = this.destCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    if (this.isRajaOngkirEnabled()) {
      try {
        const e = env();
        const url = new URL(`${e.RAJAONGKIR_BASE_URL.replace(/\/$/, '')}/destination/domestic-destination`);
        url.searchParams.set('search', q);
        url.searchParams.set('limit', '15');
        url.searchParams.set('offset', '0');
        const res = await fetch(url.toString(), {
          headers: { key: e.RAJAONGKIR_API_KEY, Accept: 'application/json' },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            data?: Array<{
              id?: number | string;
              label?: string;
              province_name?: string;
              city_name?: string;
              district_name?: string;
              subdistrict_name?: string;
              zip_code?: string;
            }>;
          };
          if (Array.isArray(json.data) && json.data.length > 0) {
            const result = {
              source: 'rajaongkir' as const,
              items: json.data.map((d) => ({
                id: String(d.id ?? ''),
                label:
                  d.label ??
                  [d.subdistrict_name, d.district_name, d.city_name, d.province_name].filter(Boolean).join(', '),
                province: d.province_name ?? '',
                city: d.city_name ?? '',
                district: d.district_name ?? '',
                subdistrict: d.subdistrict_name ?? '',
                postalCode: d.zip_code ?? '',
              })),
            };
            this.destCache.set(cacheKey, { data: result, expiresAt: Date.now() + 300_000 });
            return result;
          }
        }
      } catch (err) {
        console.warn('RajaOngkir destination lookup fallback:', sanitizeError(err));
      }
    }

    const lower = q.toLowerCase();
    const filtered = FALLBACK_DESTINATIONS.filter(
      (d) =>
        d.label.toLowerCase().includes(lower) ||
        d.city.toLowerCase().includes(lower) ||
        d.province.toLowerCase().includes(lower),
    );
    return { items: filtered.length ? filtered : FALLBACK_DESTINATIONS, source: 'local' };
  }

  /**
   * Automatically resolves the best RajaOngkir origin ID & province for a given city/regency name.
   */
  async resolveOriginByCity(city: string): Promise<DomesticDestination | null> {
    const clean = (city ?? '').trim();
    if (!clean) return null;
    const { items } = await this.searchDestinations(clean);
    if (!items || items.length === 0) return null;
    const lower = clean.toLowerCase();
    const exactCityMatch = items.find(
      (i) =>
        i.city.toLowerCase() === lower ||
        i.city.toLowerCase().includes(lower) ||
        lower.includes(i.city.toLowerCase()),
    );
    return exactCityMatch ?? items[0];
  }

  async quoteGroup(params: {
    originId: string | null | undefined;
    originCity: string;
    destinationId: string | null | undefined;
    weightGram: number;
  }): Promise<ShippingOption[]> {
    const cfg = await this.settings.get('shipping', DEFAULT_SHIPPING_SETTINGS);
    const weight = Math.max(100, params.weightGram);

    if (this.isRajaOngkirEnabled() && cfg.provider === 'rajaongkir' && params.originId && params.destinationId) {
      const couriersJoined = (cfg.couriers.length ? cfg.couriers : ['jne', 'sicepat', 'jnt']).join(':');
      const qKey = `${params.originId}:${params.destinationId}:${Math.ceil(weight / 500)}:${couriersJoined}`;
      const hit = this.quoteCache.get(qKey);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.data;
      }
      try {
        const e = env();
        const url = `${e.RAJAONGKIR_BASE_URL.replace(/\/$/, '')}/calculate/domestic-cost`;
        const body = new URLSearchParams({
          origin: params.originId,
          destination: params.destinationId,
          weight: String(weight),
          courier: couriersJoined,
          price: 'lowest',
        });
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            key: e.RAJAONGKIR_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            data?: Array<{
              code?: string;
              name?: string;
              service?: string;
              description?: string;
              cost?: number;
              etd?: string;
            }>;
          };
          if (Array.isArray(json.data) && json.data.length > 0) {
            const seenIds = new Set<string>();
            const mapped = json.data
              .filter((r) => typeof r.cost === 'number' && Number.isInteger(r.cost) && r.cost >= 0)
              .slice(0, 6)
              .map((r, idx) => {
                const sanitizedService = (r.service ?? String(idx))
                  .toString()
                  .toLowerCase()
                  .replace(/</g, 'lt')
                  .replace(/>/g, 'gt')
                  .replace(/[^a-z0-9]/g, '');
                const baseId = `ro_${(r.code ?? 'kurir').toLowerCase()}_${sanitizedService || idx}`;
                let optionId = baseId;
                if (seenIds.has(optionId)) {
                  optionId = `${baseId}_${idx}`;
                }
                seenIds.add(optionId);
                return {
                  optionId,
                  courierCode: (r.code ?? 'kurir').toUpperCase(),
                  courierName: r.name ?? (r.code ?? 'Kurir').toUpperCase(),
                  service: r.service ?? 'REG',
                  description: r.description ?? r.service ?? 'Layanan reguler',
                  cost: Math.trunc(r.cost!),
                  etd: r.etd ? `${r.etd.replace(/day|hari/gi, '').trim()} hari` : '2-4 hari',
                  source: 'rajaongkir' as const,
                };
              });
            if (mapped.length > 0) {
              this.quoteCache.set(qKey, { data: mapped, expiresAt: Date.now() + 300_000 });
              return mapped;
            }
          }
        }
      } catch (err) {
        console.warn('RajaOngkir cost quote fallback:', sanitizeError(err));
      }
    }

    // Configured flat rate fallback (never Rp 0 unless explicitly configured by admin)
    const kg = Math.max(1, Math.ceil(weight / 1000));
    const base = Math.max(0, cfg.flatRatePerGroup);
    return [
      {
        optionId: 'flat_reg',
        courierCode: 'REGULER',
        courierName: cfg.flatRateLabel || `Reguler dari ${params.originCity}`,
        service: 'REG',
        description: `Tarif flat toko (${kg} kg dari ${params.originCity})`,
        cost: base * kg,
        etd: '2-4 hari',
        source: 'flat',
      },
      {
        optionId: 'flat_exp',
        courierCode: 'EKSPRES',
        courierName: `Kilat dari ${params.originCity}`,
        service: 'BEST',
        description: `Prioritas cepat (${kg} kg dari ${params.originCity})`,
        cost: Math.round(base * kg * 1.6),
        etd: '1-2 hari',
        source: 'flat',
      },
    ];
  }
}

@Controller('api/shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('destinations')
  async search(@Query('q') q?: string) {
    return this.shipping.searchDestinations(q ?? '');
  }
}

