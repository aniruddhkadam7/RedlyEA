export type CopilotSafetyRule = {
  id: string;
  statement: string;
};

export const COPILOT_SAFETY_RULES: CopilotSafetyRule[] = [
  {
    id: 'no-write',
    statement: 'Copilot cannot write to repository.',
  },
  {
    id: 'no-exec',
    statement: 'Copilot cannot execute analysis.',
  },
  {
    id: 'no-auto-apply',
    statement: 'Copilot cannot auto-apply suggestions.',
  },
  {
    id: 'explicit-confirmation',
    statement: 'All actions require explicit user confirmation (future).',
  },
];

export const COPILOT_TRUST_BANNER = 'Copilot never changes your architecture automatically.';
