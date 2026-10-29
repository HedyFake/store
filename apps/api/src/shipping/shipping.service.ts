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
    id: '6984',
    label: 'Coblong, Kota Bandung, Jawa Barat (40132)',
    province: 'Jawa Barat',
    city: 'Kota Bandung',
    district: 'Coblong',
    subdistrict: 'Dago',
    postalCode: '40132',
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
    id: '31597',
    label: 'Depok, Sleman, DI Yogyakarta (55281)',
    province: 'DI Yogyakarta',
    city: 'Sleman',
    district: 'Depok',
    subdistrict: 'Caturtunggal',
    postalCode: '55281',
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
];

@Injectable()
export class ShippingService {
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
    if (this.isRajaOngkirEnabled()) {
      try {
        const e = env();
        const url = new URL(`${e.RAJAONGKIR_BASE_URL.replace(/\/$/, '')}/destination/domestic-destination`);
        url.searchParams.set('search', q);
        url.searchParams.set('limit', '15');
        url.searchParams.set('offset', '0');
        const res = await fetch(url.toString(), {
          headers: { key: e.RAJAONGKIR_API_KEY, Accept: 'application/json' },
          signal: AbortSignal.timeout(7000),
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
            return {
              source: 'rajaongkir',
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
          }
        }
      } catch (err) {
        console.warn('RajaOngkir destination lookup fallback:', sanitizeError(err));
      }
    }

    const lower = q.toLowerCase();
    const filtered = FALLBACK_DESTINATIONS.filter((d) => d.label.toLowerCase().includes(lower));
    return { items: filtered.length ? filtered : FALLBACK_DESTINATIONS, source: 'local' };
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
      try {
        const e = env();
        const url = `${e.RAJAONGKIR_BASE_URL.replace(/\/$/, '')}/calculate/domestic-cost`;
        const body = new URLSearchParams({
          origin: params.originId,
          destination: params.destinationId,
          weight: String(weight),
          courier: (cfg.couriers.length ? cfg.couriers : ['jne', 'sicepat', 'jnt']).join(':'),
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
          signal: AbortSignal.timeout(8000),
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
            if (mapped.length > 0) return mapped;
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

