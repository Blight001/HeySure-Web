/**
 * Admin panel API client — service monitoring + user management.
 *
 * Every endpoint is gated server-side to owner/admin; the UI additionally
 * hides the entry point for members. Thin barrel over domain modules so
 * `import * as adminApi from '@/api/admin'` stays stable.
 */
export * from './adminServices'
export * from './adminUsers'
export * from './adminFiles'
export * from './adminDb'
export * from './adminRepo'
