import { z, ZodError } from 'zod';

const positiveInt = z.number({ invalid_type_error: 'Doit être un entier' }).int().positive();
const nonNegativeInt = z
  .number({ invalid_type_error: 'Doit être un entier' })
  .int()
  .min(0, 'Doit être positif ou nul');

const metadataSchema = z
  .object({
    orderId: z.string().trim().min(1).optional(),
    merchantId: z.string().trim().min(1).optional(),
  })
  .passthrough();

const paymentErrorSchema = z
  .object({
    message: z.string().optional(),
  })
  .partial();

export const checkoutItemSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom de l'article est requis"),
    unitAmount: positiveInt,
    quantity: positiveInt,
  })
  .strict();

export const checkoutExtrasSchema = z
  .object({
    mode: z.enum(['pickup', 'delivery']).optional(),
    note: z.string().trim().min(1).max(500).optional(),
    serviceFeeMinor: nonNegativeInt.optional(),
    deliveryFeeMinor: nonNegativeInt.optional(),
    tipMinor: nonNegativeInt.optional(),
  })
  .strict();

const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z]{3}$/.test(value), {
    message: 'Devise invalide',
  });

export const createCheckoutSessionSchema = z
  .object({
    merchantId: z.string().trim().min(1, 'merchantId requis'),
    currency: currencySchema.default('eur'),
    items: z.array(checkoutItemSchema).min(1, 'Au moins un article requis'),
    extras: checkoutExtrasSchema.optional(),
    customerEmail: z.string().trim().email().optional(),
  })
  .strict();

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;

export const connectOnboardSchema = z
  .object({
    merchantId: z.string().trim().min(1, 'merchantId requis'),
  })
  .strict();

export type ConnectOnboardInput = z.infer<typeof connectOnboardSchema>;

export const stripePaymentIntentSchema = z
  .object({
    id: z.string(),
    metadata: metadataSchema.optional(),
    amount: nonNegativeInt.optional(),
    amount_received: nonNegativeInt.optional(),
    last_payment_error: paymentErrorSchema.optional(),
  })
  .strip();

export const stripeChargeSchema = z
  .object({
    payment_intent: z.union([z.string(), z.object({ id: z.string() })]),
  })
  .strip();

export type StripePaymentIntentPayload = z.infer<typeof stripePaymentIntentSchema>;
export type StripeChargePayload = z.infer<typeof stripeChargeSchema>;

export const toValidationErrorPayload = (error: ZodError) => ({
  error: 'Requête invalide',
  issues: error.issues.map((issue) => ({
    path: issue.path.join('.') || 'root',
    code: issue.code,
    message: issue.message,
  })),
});
