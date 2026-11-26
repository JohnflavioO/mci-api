import { createInfinitePayCheckout } from "./infinitepay";
import { infinitePayConfig } from "./infinitepay-config";

type CheckoutInput = Parameters<typeof createInfinitePayCheckout>[1];
export interface CheckoutProvider {
  name: "infinitepay" | "rede";
  createCheckout(input: CheckoutInput): Promise<string>;
}

/** One server-selected provider; never silently fall back. Rede is not implemented yet. */
export function checkoutProvider(selection = process.env["CHECKOUT_PROVIDER"]): CheckoutProvider | null {
  if (selection !== undefined && selection !== "infinitepay") return null;
  const config = infinitePayConfig();
  if (!config) return null;
  return { name: "infinitepay", createCheckout: (input) => createInfinitePayCheckout(config, input) };
}
