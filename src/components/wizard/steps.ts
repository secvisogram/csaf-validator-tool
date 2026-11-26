export const STEPS = ['document', 'tests', 'run'] as const
export type Step = (typeof STEPS)[number]
