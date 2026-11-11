import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a real calendar date",
  );
const text = (max = 1000) => z.string().trim().max(max);
const number = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullable().optional();
export const sessionSchema = z.enum(["Morning", "Noon", "Evening"]);
export const patientSchema = z
  .strictObject({
    name: text(100).min(2),
    age: z.number().int().min(0).max(130),
    gender: z.enum(["Female", "Male", "Other"]),
    phone: text(30).default(""),
    address: text(500).default(""),
    admissionDate: dateSchema,
    dischargeDate: dateSchema,
    nextVisit: z.union([dateSchema, z.literal("")]).default(""),
    diagnosis: text(300).default(""),
    physician: text(100).min(2),
    room: text(100).default("Unassigned"),
    bloodGroup: z
      .enum(["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .default("Unknown"),
    allergies: text(500).default("None reported"),
    favourite: z.boolean().default(false),
    vitalsMode: z.enum(["legacy", "three_session"]).default("three_session"),
  })
  .refine((v) => v.dischargeDate >= v.admissionDate, {
    message: "Discharge must be on or after admission",
    path: ["dischargeDate"],
  })
  .refine(
    (v) =>
      (Date.parse(v.dischargeDate) - Date.parse(v.admissionDate)) / 86400000 <
      366,
    {
      message: "One admission can cover at most 366 days",
      path: ["dischargeDate"],
    },
  );
export const vitalSchema = z
  .strictObject({
    date: dateSchema,
    session: z.enum(["Morning", "Noon", "Evening", "Daily"]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    height: number(20, 300),
    weight: number(0.1, 600),
    temperature: number(25, 45),
    pulse: number(1, 300),
    bp: z
      .union([
        z.literal(""),
        z
          .string()
          .regex(/^\d{2,3}\/\d{2,3}$/, "Use systolic/diastolic, e.g. 120/80")
          .refine((v) => {
            const [s, d] = v.split("/").map(Number);
            return s > d && s <= 300 && d >= 20;
          }, "Check blood pressure values"),
      ])
      .default(""),
    rr: number(1, 100),
    painScore: number(0, 10),
    fbs: number(1, 1500),
    ppbs: number(1, 1500),
    rbs: number(1, 1500),
    spo2: number(0, 100),
    sleep: text(80).default(""),
    bowel: text(80).default(""),
    appetite: text(80).default(""),
  })
  .refine(
    (v) =>
      Object.entries(v).some(
        ([k, value]) =>
          !["date", "session", "time"].includes(k) &&
          value !== null &&
          value !== undefined &&
          value !== "",
      ),
    "Enter at least one observation",
  );
export const assignmentSchema = z.strictObject({
  dates: z.array(dateSchema).min(1).max(366),
  sessions: z.array(sessionSchema).min(1).max(3),
  therapyIds: z.array(z.string().min(1).max(100)).min(1).max(30),
});
export const recordSchema = z.strictObject({
  kind: z.enum([
    "history",
    "prescription",
    "diet",
    "investigation",
    "discharge",
    "program",
    "accommodation",
    "estimate",
  ]),
  title: text(200).min(2),
  detail: text(5000).default(""),
  date: dateSchema,
  status: z
    .enum([
      "Active",
      "Recorded",
      "Occupied",
      "Scheduled",
      "Pending",
      "Completed",
      "Draft",
      "Final",
      "Cancelled",
    ])
    .default("Active"),
  quantity: z.number().min(0.01).max(100000).default(1),
  amount: z.number().min(0).max(10000000).default(0),
  session: text(100).default(""),
});
export const noteSchema = z.strictObject({
  date: dateSchema,
  session: sessionSchema,
  text: text(3000).min(1),
});
export const inventorySchema = z.strictObject({
  name: text(150).min(2),
  stock: z.number().min(0).max(1000000),
  unit: text(40).min(1),
  price: z.number().min(0).max(1000000).multipleOf(0.01),
  reorderLevel: z.number().min(0).max(1000000).default(10),
});
const currency = z.number().finite().min(0).max(10000000).multipleOf(0.01);
export const therapySchema = z.strictObject({
  name: text(200).min(2),
  category: z.enum(["CGHS", "NON-NABH"]),
  price: currency,
  duration: z.number().int().min(5).max(480),
  active: z.boolean().default(true),
});
export const invoiceSchema = z.strictObject({
  title: text(200).min(2),
  items: z
    .array(
      z.strictObject({
        description: text(250).min(2),
        quantity: z.number().positive().max(100000),
        unitPrice: currency,
      }),
    )
    .min(1)
    .max(100),
  requestId: z.uuid(),
});
export const paymentSchema = z.strictObject({
  amount: currency.refine((n) => n > 0, "Enter a positive payment amount"),
  method: z.enum(["Cash", "UPI", "Card", "Bank transfer"]),
  reference: text(150).default(""),
  date: dateSchema,
  requestId: z.uuid(),
});
export const prescriptionSchema = z.strictObject({
  inventoryId: text(100).default(""),
  name: text(200).min(2),
  dose: text(200).min(1),
  frequency: z.enum([
    "Morning",
    "Noon",
    "Evening",
    "Morning / Evening",
    "Three times daily",
    "As directed",
  ]),
  days: z.number().int().min(1).max(366),
  quantity: z.number().positive().max(100000),
  instructions: text(3000).default(""),
  date: dateSchema,
});
export const dispenseSchema = z.strictObject({
  quantity: z.number().positive().max(100000),
  requestId: z.uuid(),
});
export const stockAdjustmentSchema = z.strictObject({
  delta: z
    .number()
    .finite()
    .min(-1000000)
    .max(1000000)
    .refine((n) => n !== 0, "Enter a nonzero adjustment"),
  reason: text(500).min(3),
  requestId: z.uuid(),
});
export const roomSchema = z.strictObject({
  name: text(100).min(2),
  type: z.enum(["Private", "Shared", "General"]),
  capacity: z.number().int().min(1).max(100),
  rate: currency,
  active: z.boolean().default(true),
});
export const roomAssignmentSchema = z.strictObject({
  roomId: text(100).min(1),
  startDate: dateSchema,
});
export const physicianSchema = z.strictObject({
  name: text(100).min(2),
  speciality: text(150).default("Ayurveda"),
  phone: text(30).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  active: z.boolean().default(true),
});
export const practiceSchema = z.strictObject({
  name: text(100).min(2),
  tagline: text(150).default(""),
  phone: text(30).default(""),
  address: text(500).default(""),
});
export const dischargeSchema = z.strictObject({
  date: dateSchema,
  summary: text(10000).min(10),
  instructions: text(5000).min(3),
  nextVisit: z.union([dateSchema, z.literal("")]).default(""),
});
export const billSchema = z.strictObject({
  title: text(200).min(2),
  amount: z.number().positive().max(10000000).multipleOf(0.01),
  status: z.enum(["Unpaid", "Paid"]).default("Unpaid"),
});
export const estimateSchema = z.strictObject({
  session: z.enum(["Morning", "Noon", "Evening", "All"]),
  items: z
    .array(
      z.strictObject({
        therapyId: z.string().min(1).max(100),
        days: z.number().int().min(1).max(366),
      }),
    )
    .min(1)
    .max(50),
});
