export type SignInState =
  | { step: 'phone'; phone?: string; error?: string }
  | { step: 'code'; phone: string; testCode: string | null; error?: string };
