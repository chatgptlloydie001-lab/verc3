import { z } from "zod";

export const cookieSessionSchema = z.object({
  id: z.number(),
  cookies: z.any(),
  description: z.string().nullable(),
  is_premium: z.boolean().default(false),
});

export type CookieSession = z.infer<typeof cookieSessionSchema>;

export const checkResultSchema = z.object({
  valid: z.boolean(),
  status: z.string().optional(),
  premium: z.string().optional(),
  country: z.string().optional(),
  plan: z.string().optional(),
  price: z.string().optional(),
  memberSince: z.string().optional(),
  paymentMethod: z.string().optional(),
  phone: z.string().optional(),
  phoneVerified: z.string().optional(),
  videoQuality: z.string().optional(),
  maxStreams: z.string().optional(),
  paymentHold: z.string().optional(),
  extraMember: z.string().optional(),
  email: z.string().optional(),
  emailVerified: z.string().optional(),
  profiles: z.string().optional(),
  billing: z.string().optional(),
  watchLink: z.string().optional(),
  rawData: z.string().optional(),
  error: z.string().optional(),
});

export type CheckResult = z.infer<typeof checkResultSchema>;

export const activationKeySchema = z.object({
  id: z.number(),
  key: z.string(),
  device_limit: z.enum(["single", "limited", "unlimited"]),
  max_devices: z.number(),
  devices: z.array(z.string()).default([]),
  expires_at: z.string().nullable(),
  is_active: z.boolean(),
  is_premium: z.boolean().default(false),
  created_at: z.string().nullable(),
});

export type ActivationKey = z.infer<typeof activationKeySchema>;

export const loginRequestSchema = z.object({
  key: z.string().min(1, "Activation key is required"),
  deviceId: z.string().min(1, "Device ID is required"),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
