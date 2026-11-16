// The post section of a person's data export: where and when their mail
// arrives, and the notices sent to tell them it had.

import { desc, eq } from 'drizzle-orm'
import * as tables from '@nuxthub/db/schema'

import type { ExtensionDb } from '#server/utils/extensions'

import { weekdaysFromMailDays } from '../../shared/utils/mail-days'

export interface AccountExportPost {
  profile: {
    city: string
    country: string
    /** The city's centre from the public city list, never a device's location. */
    lat: number
    lng: number
    timeZone: string
    /** 1 is Monday, 6 is Saturday. */
    mailDays: number[]
    deliveryHour: number
    /** A change to days or hour that has not started yet. */
    pending: { mailDays: number[] | null; deliveryHour: number | null; from: string } | null
  } | null
  notices: { mailDate: string; channel: string; state: string; sentAt: string | null }[]
}

export async function exportPost(db: ExtensionDb, userId: string): Promise<AccountExportPost> {
  const { postalProfiles, notices } = tables
  const [profile] = await db
    .select()
    .from(postalProfiles)
    .where(eq(postalProfiles.userId, userId))
    .limit(1)
  const sent = await db
    .select()
    .from(notices)
    .where(eq(notices.userId, userId))
    .orderBy(desc(notices.mailDate))

  return {
    profile: profile
      ? {
          city: profile.cityName,
          country: profile.country,
          lat: profile.lat,
          lng: profile.lng,
          timeZone: profile.timeZone,
          mailDays: weekdaysFromMailDays(profile.mailDays),
          deliveryHour: profile.deliveryHour,
          pending: profile.pendingFrom
            ? {
                mailDays:
                  profile.pendingMailDays === null
                    ? null
                    : weekdaysFromMailDays(profile.pendingMailDays),
                deliveryHour: profile.pendingDeliveryHour,
                from: profile.pendingFrom,
              }
            : null,
        }
      : null,
    notices: sent.map((row) => ({
      mailDate: row.mailDate,
      channel: row.channel,
      state: row.state,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    })),
  }
}
