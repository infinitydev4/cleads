import { Prisma } from "@prisma/client"

/**
 * A time for raw SQL on Prisma's DateTime columns. Prisma stores the UTC wall clock in "timestamp without time zone"
 * columns, while a Date parameter arrives as "timestamp with time zone" and NOW() follows the session's time zone:
 * both would shift by the session's offset (an hour in Paris). This gives the UTC wall clock Prisma itself writes.
 */
export const utc = (date: Date) => Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`
