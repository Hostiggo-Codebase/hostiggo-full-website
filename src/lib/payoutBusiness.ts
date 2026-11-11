// Who a host's payouts are made out to. Razorpay Route "business_type" values, safe to import
// from client components. The 4th character of a PAN encodes the holder type, and Razorpay
// rejects a PAN that doesn't fit the business type, so it is checked here first.

export const BUSINESS_TYPES = [
  { value: "individual", label: "Individual (my own name)", pan: "P" },
  { value: "proprietorship", label: "Proprietorship", pan: "P" },
  { value: "partnership", label: "Partnership firm", pan: "F" },
  { value: "llp", label: "LLP (Limited Liability Partnership)", pan: "F" },
  { value: "private_limited", label: "Private Limited company", pan: "C" },
  { value: "public_limited", label: "Public Limited company", pan: "C" },
  { value: "trust", label: "Trust", pan: "T" },
  { value: "society", label: "Society", pan: "AT" },
  { value: "ngo", label: "NGO", pan: "AT" },
  { value: "not_yet_registered", label: "Business not yet registered", pan: "PAB" },
  { value: "educational_institutes", label: "Educational institute", pan: "TAC" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];

export const DEFAULT_BUSINESS_TYPE: BusinessType = "individual";

export function isBusinessType(value: unknown): value is BusinessType {
  return BUSINESS_TYPES.some((t) => t.value === value);
}

/** Anything other than a person acting in their own name. */
export function isCompanyType(type: string | null | undefined): boolean {
  return Boolean(type) && type !== "individual";
}

/**
 * Whether Razorpay wants a stakeholder (the person behind the account) before the
 * account can be paid: yes for people, who are their own stakeholder. A registered
 * business is activated on its own PAN and bank account instead.
 */
export function needsStakeholder(type: string | null | undefined): boolean {
  return !type || type === "individual" || type === "proprietorship";
}

/** Returns an error message when the PAN's holder type doesn't fit the business type. */
export function panProblemForBusiness(pan: string, type: BusinessType): string | null {
  const entry = BUSINESS_TYPES.find((t) => t.value === type);
  const fourth = pan.trim().toUpperCase().charAt(3);
  if (!entry || entry.pan.includes(fourth)) return null;
  return type === "individual" || type === "proprietorship"
    ? "A personal PAN is needed for this account type. Choose a company type if you are paying out to a business."
    : `This PAN doesn't look like a ${entry.label.split(" (")[0]} PAN. Enter the business's own PAN, not a personal one.`;
}
