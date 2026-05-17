import { z } from "zod";

export const cookieSessionSchema = z.object({
  id: z.number(),
  cookies: z.any().nullable(),
  description: z.string().nullable(),
  is_premium: z.boolean().default(false),
  status: z.string().nullable().optional(),
  premium: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  memberSince: z.string().nullable().optional(),
  member_since: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  phoneVerified: z.string().nullable().optional(),
  phone_verified: z.string().nullable().optional(),
  videoQuality: z.string().nullable().optional(),
  video_quality: z.string().nullable().optional(),
  maxStreams: z.string().nullable().optional(),
  max_streams: z.string().nullable().optional(),
  paymentHold: z.string().nullable().optional(),
  payment_hold: z.string().nullable().optional(),
  extraMember: z.string().nullable().optional(),
  extra_member: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  emailVerified: z.string().nullable().optional(),
  email_verified: z.string().nullable().optional(),
  profiles: z.string().nullable().optional(),
  billing: z.string().nullable().optional(),
  rawData: z.string().nullable().optional(),
  raw_data: z.string().nullable().optional(),
}).passthrough();

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
