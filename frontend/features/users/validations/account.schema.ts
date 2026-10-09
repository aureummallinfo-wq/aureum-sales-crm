export const changePasswordSchema = { minLength: 8, requires: ["uppercase", "lowercase", "number", "special", "confirmation"] as const };
