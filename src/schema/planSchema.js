const { z } = require("zod");

const planSchema = z.object({
  airportCode: z.string().length(3, "Airport code must be exactly 3 characters."),
  arrivalTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  departureTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  connectionType: z.enum(["domestic", "international"]),
  interests: z.array(z.string()).optional().default([]),
  airlineCode: z.string().max(3).nullable().optional(),
  flightNumber: z.string().max(6).nullable().optional(),
  riskProfile: z.enum(["conservative", "balanced", "explorer"]).optional().default("balanced"),
  strategyPack: z
    .enum([
      "standard",
      "food-first",
      "culture-deep",
      "recharge",
      "local-gems",
      "scenic-balance",
    ])
    .optional()
    .default("standard"),
  preferredPoiName: z.string().trim().max(120).nullable().optional(),
  preferredPoi: z
    .object({
      name: z.string().trim().max(120),
      lat: z.number().finite(),
      lon: z.number().finite(),
      category: z.string().trim().max(80).optional().nullable(),
      address: z.string().trim().max(180).optional().nullable(),
    })
    .optional(),
  trustAcknowledged: z.literal(true, {
    errorMap: () => ({ message: "trustAcknowledged must be true before generating a plan." }),
  }),
  sessionKey: z.string().optional(),
});

module.exports = { planSchema };
