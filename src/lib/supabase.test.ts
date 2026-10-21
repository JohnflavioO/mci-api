import { describe, expect, it } from "vitest";
import { getSupabase, isSupabaseConfigured } from "./supabase";

describe("supabase client", () => {
  it("initializes from VITE_ env vars", () => {
    expect(isSupabaseConfigured()).toBe(true);
    expect(typeof getSupabase().auth.getSession).toBe("function");
  });
});
