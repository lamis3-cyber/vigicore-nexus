/**
 * Declaration payload contract — Decision 9.
 *
 * Phase 1 stores Declaration.payload as opaque JSON in the database (the
 * actual field set is domain/role-specific and defined by wizard
 * configuration, which is Phase 3+ scope). This file documents the SHAPE
 * that payload is expected to satisfy so field-level redaction can be
 * added later as a filter step over this structure, without a schema
 * migration.
 *
 * IMPORTANT: no enforcement reads `sensitivity` yet. This is deliberately
 * inert in Phase 1 — see Decision 9 in the locked architecture. Whether
 * this becomes a Day 1 legal requirement instead of a deferred enhancement
 * is a compliance question that has NOT been resolved here.
 */

export type FieldSensitivity = 'standard' | 'patient-identifying';

export interface PayloadField {
  /** Machine key, stable across wizard configuration versions. */
  key: string;
  /** Value as submitted. Left as unknown here — actual per-field typing
   * (string/number/date/enum/etc.) is defined by the wizard configuration
   * schema, which does not exist yet in Phase 1. */
  value: unknown;
  sensitivity: FieldSensitivity;
}

/**
 * A Declaration's `payload` JSON column is expected to be an array of
 * PayloadField entries (not an arbitrary nested object), specifically so
 * that a future redaction step can filter the array by `sensitivity`
 * without needing to know the domain-specific field names in advance.
 */
export type DeclarationPayload = PayloadField[];

/** Type guard used by validation code (Phase 1 provides the guard; wiring
 * it into an actual submission endpoint is Phase 3 scope). */
export function isDeclarationPayload(value: unknown): value is DeclarationPayload {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as PayloadField).key === 'string' &&
      ((entry as PayloadField).sensitivity === 'standard' ||
        (entry as PayloadField).sensitivity === 'patient-identifying')
  );
}
