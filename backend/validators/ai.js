'use strict';
const { z, text } = require('./common');
const { symptomsById } = require('../services/content');

const chat = z.object({
  message: z.string({ error: 'Message is required.' }).trim().min(1, 'Message is required.').max(2000, 'Message must be at most 2000 characters.'),
  includeVitals: z.boolean().optional().default(false),
});

const symptoms = z.object({
  symptoms: z.array(z.string(), { error: 'Select at least one symptom.' })
    .min(1, 'Select at least one symptom.')
    .max(15, 'Too many symptoms selected.')
    .refine((a) => a.every((id) => symptomsById.has(id)), 'Unknown symptom selected.')
    .transform((a) => [...new Set(a)]),
});

module.exports = { chat, symptoms, text };
