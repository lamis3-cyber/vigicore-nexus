/**
 * payments.ts — which payment methods are actually operational, and the
 * instructions a customer needs to pay with each one.
 *
 * A method is offered ONLY if it can really be honoured, so the dashboard
 * never lets an organization choose something that can't complete:
 *   - BARIDIMOB / BANK_TRANSFER: manual transfers, enabled once the
 *     receiving account is configured (PAYMENT_CCP_ACCOUNT / PAYMENT_BANK_RIB).
 *     VigiCore staff confirm them with `npm run order:confirm`.
 *   - EDAHABIA_CIB: needs a SATIM/bank merchant contract and a gateway
 *     integration that does not exist yet, so it is reported as unavailable.
 *     When it is built, its webhook must call activateOrder() (placements.ts).
 */

import type { PaymentMethodId } from './pricing';

export interface PaymentInstructions {
  beneficiary: string;
  /** CCP account or bank RIB to pay into. */
  account: string;
}

export interface PaymentMethodInfo {
  id: PaymentMethodId;
  name: string;
  hint: string;
  enabled: boolean;
  instructions?: PaymentInstructions;
}

export function getPaymentMethods(env: NodeJS.ProcessEnv = process.env): PaymentMethodInfo[] {
  // No invented beneficiary: a method is only offered when the owner supplied who receives the money.
  const beneficiary = env.PAYMENT_BENEFICIARY?.trim() ?? '';
  const ccp = env.PAYMENT_CCP_ACCOUNT?.trim();
  const rib = env.PAYMENT_BANK_RIB?.trim();

  return [
    {
      id: 'EDAHABIA_CIB',
      name: 'Edahabia / CIB card',
      hint: 'Online card payment — being connected, not available yet',
      enabled: false,
    },
    {
      id: 'BARIDIMOB',
      name: 'BaridiMob / CCP',
      hint: 'Pay in the app quoting your order reference · live once we confirm it',
      enabled: Boolean(ccp && beneficiary),
      instructions: ccp && beneficiary ? { beneficiary, account: ccp } : undefined,
    },
    {
      id: 'BANK_TRANSFER',
      name: 'Bank transfer',
      hint: 'Quote your order reference · live once we confirm the transfer',
      enabled: Boolean(rib && beneficiary),
      instructions: rib && beneficiary ? { beneficiary, account: rib } : undefined,
    },
  ];
}

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** e.g. VG-202609-K7QF2M — short enough to type into a transfer label. */
export function generateOrderReference(
  now: Date = new Date(),
  randomBytes: (n: number) => Uint8Array = (n) => require('crypto').randomBytes(n)
): string {
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const bytes = randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  return `VG-${ym}-${suffix}`;
}
