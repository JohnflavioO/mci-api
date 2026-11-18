import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const orders = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", user_id: "u1", status: "pending_payment", currency: "BRL", total: 100, provider: null, provider_order_id: null, provider_charge_id: null, provider_checkout_url: null, payment_link_created_at: null, created_at: "2026-11-17T10:00:00Z", updated_at: "2026-11-17T10:00:00Z", order_items: [] },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", user_id: "u2", status: "pending_payment", currency: "BRL", total: 200, provider: "infinitepay", provider_order_id: "o2", provider_charge_id: null, provider_checkout_url: "https://checkout.example/2", payment_link_created_at: "2026-11-17T10:05:00Z", created_at: "2026-11-17T10:05:00Z", updated_at: "2026-11-17T10:05:00Z", order_items: [] },
  { id: "cccccccc-0000-0000-0000-000000000003", user_id: "u3", status: "paid", currency: "BRL", total: 300, provider: "infinitepay", provider_order_id: "o3", provider_charge_id: "ch3", provider_checkout_url: "https://checkout.example/3", payment_link_created_at: "2026-11-17T10:10:00Z", created_at: "2026-11-17T10:10:00Z", updated_at: "2026-11-17T10:10:00Z", order_items: [] },
];

vi.mock("@/lib/supabase", () => {
  const query = { select: () => query, order: () => query, limit: async () => ({ data: orders, error: null }) };
  return { getSupabase: () => ({ from: () => query, auth: { getSession: async () => ({ data: { session: null } }) } }) };
});

const { Route } = await import("./admin.pedidos");

describe("/admin/pedidos", () => {
  it("renderiza a lista e as métricas sem quebrar a página", async () => {
    const Page = Route.options.component!;
    render(<QueryClientProvider client={new QueryClient()}><Page /></QueryClientProvider>);

    expect(await screen.findByText("#AAAAAAAA")).toBeInTheDocument();
    expect(screen.getByText("3 resultado(s)")).toBeInTheDocument();
    const card = (label: string) => screen.getByText(label, { selector: "article p" }).closest("article")!;
    // Pedidos efetivos: apenas os que geraram checkout ou foram pagos (2 de 3).
    expect(card("Pedidos efetivos")).toHaveTextContent(/^Pedidos efetivos2Checkout/);
    // Aguardando pagamento: só o pedido pendente que já gerou checkout.
    expect(card("Aguardando pagamento")).toHaveTextContent(/^Aguardando pagamento1Não/);
    expect(card("Total confirmado")).toHaveTextContent(/R\$\s?300,00/);
  });
});
