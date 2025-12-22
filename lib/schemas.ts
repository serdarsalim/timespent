import { z } from 'zod'

// Goal schemas
export const keyResultSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(500),
  status: z.enum(['started', 'pending', 'on-hold', 'completed'])
})

export const goalSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  timeframe: z.string().max(100),
  description: z.string().max(1000).optional(),
  statusOverride: z.string().max(50).optional().nullable(),
  archived: z.boolean().optional(),
  keyResults: z.array(keyResultSchema)
})

export const goalsArraySchema = z.array(goalSchema)

// Schedule schemas
export const scheduleEntrySchema = z.object({
  time: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  title: z.string().min(1).max(200),
  color: z.string().max(20).optional().nullable(),
  repeat: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly']).optional(),
  repeatUntil: z.string().optional().nullable(),
  repeatDays: z.array(z.number().min(0).max(6)).optional(),
  skipDates: z.array(z.string()).optional()
})

export const scheduleEntriesSchema = z.record(z.string(), z.array(scheduleEntrySchema))

// Productivity schemas
export const productivityRatingsSchema = z.record(z.string(), z.number().min(1).max(10).nullable())

// Notes schemas
export const weeklyNotesSchema = z.record(z.string(), z.string().max(10000))

// Profile schema
export const profileSchema = z.object({
  personName: z.string().max(200).nullable(),
  dateOfBirth: z.string().nullable(),
  weekStartDay: z.number().min(0).max(6),
  recentYears: z.string().max(10),
  goalsSectionTitle: z.string().max(100).optional(),
  productivityViewMode: z.enum(['day', 'week']).optional(),
  productivityScaleMode: z.enum(['3', '4']).optional(),
  showLegend: z.boolean().optional(),
  weeklyGoalsTemplate: z.string().max(4000).optional()
})

// Type exports
export type Goal = z.infer<typeof goalSchema>
export type KeyResult = z.infer<typeof keyResultSchema>
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>
export type Profile = z.infer<typeof profileSchema>
