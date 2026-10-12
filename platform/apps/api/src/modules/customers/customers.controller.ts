import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { latLngSchema, phoneSchema, VEHICLE_TH, VEHICLE_TYPES } from '@ship/shared';
import { z } from 'zod';
import { Auth, AuthUser, CurrentUser } from '../../common/auth';
import { DbService } from '../../common/db.service';
import { NotFound } from '../../common/errors';
import { zbody } from '../../common/zod';
import { ZonesService } from '../zones/zones.service';

const addressSchema = z.object({
  label: z.string().max(40).optional(),
  address: z.string().trim().min(1).max(500),
  building: z.string().max(120).optional(),
  floor: z.string().max(20).optional(),
  room: z.string().max(40).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: phoneSchema.optional(),
  note: z.string().max(500).optional(),
  location: latLngSchema,
});

const profileSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email().optional() });

@Controller()
export class CustomersController {
  constructor(
    private readonly db: DbService,
    private readonly zones: ZonesService,
  ) {}

  @Patch('me/profile')
  @Auth('CUSTOMER')
  async updateProfile(@CurrentUser() user: AuthUser, @Body(zbody(profileSchema)) body: z.infer<typeof profileSchema>) {
    await this.db.query('UPDATE customers SET name = $2, email = $3 WHERE id = $1', [user.id, body.name, body.email ?? null]);
    await this.db.query('UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1', [user.id, body.name]);
    return { ok: true };
  }

  @Get('me/addresses')
  @Auth('CUSTOMER')
  addresses(@CurrentUser() user: AuthUser) {
    return this.db.query(
      `SELECT id, label, address, building, floor, room, contact_name, contact_phone, note,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM addresses WHERE customer_id = $1 ORDER BY created_at DESC`,
      [user.id],
    );
  }

  @Post('me/addresses')
  @Auth('CUSTOMER')
  async addAddress(@CurrentUser() user: AuthUser, @Body(zbody(addressSchema)) a: z.infer<typeof addressSchema>) {
    return this.db.one(
      `INSERT INTO addresses (customer_id, label, address, building, floor, room, contact_name, contact_phone, note, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_SetSRID(ST_MakePoint($11, $10), 4326)::geography) RETURNING id`,
      [user.id, a.label ?? null, a.address, a.building ?? null, a.floor ?? null, a.room ?? null, a.contactName ?? null, a.contactPhone ?? null, a.note ?? null, a.location.lat, a.location.lng],
    );
  }

  @Delete('me/addresses/:id')
  @Auth('CUSTOMER')
  @HttpCode(204)
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.db.query('DELETE FROM addresses WHERE id = $1 AND customer_id = $2 RETURNING id', [id, user.id]);
    if (!rows.length) throw NotFound('Address');
  }

  /** Is this point serviceable, and with which vehicles? */
  @Get('zones/lookup')
  @Auth()
  async lookup(@Query('lat') lat: string, @Query('lng') lng: string) {
    const p = latLngSchema.parse({ lat: Number(lat), lng: Number(lng) });
    const zone = await this.zones.findByPoint(p);
    if (!zone) return { serviceable: false, zone: null };
    return {
      serviceable: true,
      open: this.zones.isOpen(zone, new Date()),
      zone: { id: zone.id, code: zone.code, name: zone.name, vehicleTypes: zone.vehicle_types },
    };
  }

  /** Vehicle catalogue (labels, capacity) — prices always come from POST /quotes. */
  @Get('catalog/vehicles')
  vehicles() {
    return VEHICLE_TYPES.map((type) => ({ type, ...VEHICLE_TH[type] }));
  }
}
