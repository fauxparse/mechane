import { describe, expect, it } from "vitest";

import { ADMIN_AREA_PERMISSIONS, roleCan, roleCanImpersonate } from "./access-control";

describe("roleCan", () => {
  it("opens the admin area to admins only", () => {
    expect(roleCan("admin", ADMIN_AREA_PERMISSIONS)).toBe(true);
    expect(roleCan("user", ADMIN_AREA_PERMISSIONS)).toBe(false);
  });

  it("requires every requested action", () => {
    expect(roleCan("admin", { show: ["list", "delete"], user: ["impersonate-admins"] })).toBe(
      false,
    );
  });

  it("grants nothing to a role it does not know", () => {
    expect(roleCan("superuser", { show: ["list"] })).toBe(false);
    expect(roleCan("toString", { show: ["list"] })).toBe(false);
  });
});

describe("roleCanImpersonate", () => {
  it("lets admins impersonate ordinary users but not other admins", () => {
    expect(roleCanImpersonate("admin", "user")).toBe(true);
    expect(roleCanImpersonate("admin", "admin")).toBe(false);
  });

  it("lets nobody else impersonate anyone", () => {
    expect(roleCanImpersonate("user", "user")).toBe(false);
    expect(roleCanImpersonate("superuser", "user")).toBe(false);
  });
});
