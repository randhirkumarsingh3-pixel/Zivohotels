import { z } from 'zod';
const hotelSchema = z.object({
  legalName: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  incorporationType: z.string().optional(),
  payoutCycle: z.string().optional(),
  msme: z.string().optional(),
  builtYear: z.preprocess((val) => (val === '' || val === null ? undefined : Number(val)), z.number().optional()),
  bookingSince: z.preprocess((val) => (val === '' || val === null ? undefined : Number(val)), z.number().optional()),
});
const hotelUpdateSchema = hotelSchema.partial();
console.log(hotelUpdateSchema.safeParse({ builtYear: "2020", msme: "1234" }));
console.log(hotelUpdateSchema.safeParse({ builtYear: "", msme: "" }));
