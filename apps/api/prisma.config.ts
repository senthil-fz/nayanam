import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config.
 *
 * In Prisma 7 the datasource URL can no longer live in `schema.prisma`.
 * It must be provided here (for `prisma generate`, `prisma db pull`, and
 * Prisma Studio) or via a driver adapter on the `PrismaClient` constructor
 * (for runtime — see `src/prisma/prisma.service.ts`).
 *
 * IMPORTANT: We use Liquibase (`db/liquibase/`) for schema evolution, NOT
 * `prisma migrate`. This config exists only to satisfy `prisma generate`
 * and to let `prisma db pull` introspect the Liquibase-owned schema.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  experimental: {
    extensions: true,
  },
});
