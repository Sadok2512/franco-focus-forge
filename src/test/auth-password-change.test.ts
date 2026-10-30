import { describe, expect, it } from "vitest";

import { LoginResponseSchema } from "@/lib/api/auth-schemas";

describe("password change auth contract", () => {
  const response = {
    token: "test-token",
    token_type: "Bearer",
    expires_at: "2099-01-01T00:00:00Z",
    user: {
      id: "admin-test",
      email: "admin@example.invalid",
      role: "admin",
      active: true,
      created_at: "2026-10-30T00:00:00Z",
      must_change_password: true,
    },
  } as const;

  it("preserves the forced-change flag from login", () => {
    expect(LoginResponseSchema.parse(response).user.must_change_password).toBe(true);
  });

  it("rejects a response that omits the forced-change flag", () => {
    const { must_change_password: _omitted, ...user } = response.user;
    expect(LoginResponseSchema.safeParse({ ...response, user }).success).toBe(false);
  });
});
