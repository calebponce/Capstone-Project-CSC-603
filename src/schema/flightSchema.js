const { z } = require("zod");

const flightSchema = z.object({
  airportCode: z.string().length(3, "Airport code must be exactly 3 characters."),
  arrivalTime: z.string().datetime({ offset: true }).or(z.string().min(1)).optional().nullable(),
  departureTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  airlineCode: z.string().max(3).optional().nullable(),
  flightNumber: z.string().max(6).optional().nullable(),
  connectionType: z.enum(["domestic", "international"]).optional(),
  sessionKey: z.string().optional(),
});

module.exports = { flightSchema };
