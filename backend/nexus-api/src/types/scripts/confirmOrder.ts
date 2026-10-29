/**
 * Confirms a manual payment (BaridiMob / CCP / bank transfer) and publishes
 * the listing. Run by VigiCore staff after checking the money arrived:
 *
 *   npm run order:confirm -- VG-202609-K7QF2M
 *
 * Deliberately a CLI and not an HTTP route: there is no platform-admin role
 * in the API yet (see Role in schema.prisma), and an unauthenticated or
 * shared-secret "mark as paid" endpoint would let anyone publish for free.
 * A future staff dashboard or a payment-gateway webhook should call
 * activateOrder() directly.
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import {
  activateOrder,
  OrderNotFoundError,
  OrderStateError,
  PlacementConflictError,
} from '../services/placements';

async function main() {
  const reference = process.argv[2]?.trim();
  if (!reference) {
    console.error('Usage: npm run order:confirm -- <ORDER_REFERENCE>');
    process.exitCode = 1;
    return;
  }

  try {
    const { order, alreadyPaid } = await activateOrder(prisma, { reference });
    if (alreadyPaid) {
      console.log(`Order ${order.reference} was already confirmed — nothing changed.`);
    } else {
      console.log(
        `Order ${order.reference} confirmed: "${order.listingTitle}" is live on ${order.placement} for ${order.months} month(s) (${order.total} DZD).`
      );
    }
  } catch (err) {
    if (err instanceof OrderNotFoundError || err instanceof OrderStateError || err instanceof PlacementConflictError) {
      console.error(`Not confirmed: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error('order:confirm failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
