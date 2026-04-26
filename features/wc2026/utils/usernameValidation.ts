const RESERVED_WORDS = [
  'admin',
  'administrator',
  'moderator',
  'mod',
  'system',
  'support',
  'help',
  'info',
  'contact',
  'official',
  'fifa',
  'worldcup',
  'worldcup2026',
  'wc2026',
];

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
const ALLOWED_CHARS = /^[a-zA-Z0-9_]+$/;

export interface UsernameValidationResult {
  valid: boolean;
  error?: string;
}

export const validateUsername = (username: string): UsernameValidationResult => {
  const trimmed = username.trim();

  if (!trimmed) {
    return { valid: false, error: 'Username is required' };
  }
  if (trimmed.length < MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${MIN_LENGTH} characters` };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { valid: false, error: `Username must be less than ${MAX_LENGTH} characters` };
  }
  if (!ALLOWED_CHARS.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  if (trimmed[0] === '_' || /^[0-9]/.test(trimmed)) {
    return { valid: false, error: 'Username must start with a letter' };
  }

  const lowerUsername = trimmed.toLowerCase();
  if (RESERVED_WORDS.some((word) => lowerUsername.includes(word))) {
    return { valid: false, error: 'This username is not available. Please choose another.' };
  }
  if (trimmed.includes('__')) {
    return { valid: false, error: 'Username cannot contain consecutive underscores' };
  }
  if (trimmed.replace(/_/g, '').length === 0) {
    return { valid: false, error: 'Username cannot contain only underscores' };
  }

  return { valid: true };
};
