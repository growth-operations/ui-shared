// Unit tests for the auto-provision toggle's copy + interaction state
// machine (the component, src/billing/AutoProvisionToggle.jsx, is the thin
// wiring over this pure reducer — hooks keep it out of the renderer-less
// test harness, so the ON→OFF confirmation flow is pinned here).
import { describe, it, expect } from "vitest";
import {
  AUTO_PROVISION_TITLE,
  AUTO_PROVISION_CONFIRM_YES,
  AUTO_PROVISION_CONFIRM_NO,
  AUTO_PROVISION_IDLE,
  autoProvisionSubtext,
  autoProvisionConfirmBody,
  resolveAutoProvision,
  autoProvisionReducer,
} from "../src/lib/autoProvision";

describe("auto-provision copy (verbatim from Andrew's 2026-10 feedback)", () => {
  it("pins the title and both confirm buttons byte-for-byte", () => {
    expect(AUTO_PROVISION_TITLE).toBe("Add Additional Credits Automatically");
    expect(AUTO_PROVISION_CONFIRM_YES).toBe("Yes, disable this feature.");
    expect(AUTO_PROVISION_CONFIRM_NO).toBe(
      "No, keep automatic credit provisioning enabled."
    );
  });

  it("templates the app name into the subtext and confirm body", () => {
    expect(autoProvisionSubtext("Test App")).toBe(
      "If monthly credits are used, this will automatically purchase another pack of credits so use of Test App is not impacted."
    );
    expect(autoProvisionConfirmBody("Test App")).toBe(
      "Are you sure you want to disable automatic credit provisioning? If monthly credits are used, Test App will no longer function and workflow actions will fail."
    );
  });
});

describe("resolveAutoProvision", () => {
  it("defaults to ENABLED when the block is absent (the contract default)", () => {
    expect(resolveAutoProvision(undefined)).toEqual({ enabled: true });
    expect(resolveAutoProvision(null)).toEqual({ enabled: true });
    expect(resolveAutoProvision({})).toEqual({ enabled: true });
  });

  it("reads an explicit flag", () => {
    expect(resolveAutoProvision({ enabled: true })).toEqual({ enabled: true });
    expect(resolveAutoProvision({ enabled: false })).toEqual({ enabled: false });
  });
});

describe("autoProvisionReducer — the ON→OFF confirmation flow", () => {
  it("ON→OFF parks in confirming (the toggle stays checked; nothing saves yet)", () => {
    const next = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: false,
    });
    expect(next).toEqual({ phase: "confirming", notice: null });
  });

  it("'Yes, disable this feature.' moves confirming -> saving", () => {
    const confirming = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: false,
    });
    const saving = autoProvisionReducer(confirming, { type: "confirm" });
    expect(saving).toEqual({ phase: "saving", notice: null });
  });

  it("'No, keep automatic credit provisioning enabled.' cancels back to idle", () => {
    const confirming = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: false,
    });
    const idle = autoProvisionReducer(confirming, { type: "cancel" });
    expect(idle).toEqual({ phase: "idle", notice: null });
  });

  it("OFF→ON saves immediately — no confirmation to turn protection back ON", () => {
    const next = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: true,
    });
    expect(next).toEqual({ phase: "saving", notice: null });
  });

  it("a successful save lands idle with the success notice", () => {
    const saving = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: true,
    });
    const saved = autoProvisionReducer(saving, { type: "saved" });
    expect(saved).toEqual({
      phase: "idle",
      notice: { variant: "success", text: "Saved." },
    });
  });

  it("a failed save lands idle with the error notice (default message)", () => {
    const saving = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: true,
    });
    const failed = autoProvisionReducer(saving, { type: "failed" });
    expect(failed.phase).toBe("idle");
    expect(failed.notice.variant).toBe("error");
    expect(failed.notice.text).toBe(
      "Couldn't update automatic credit provisioning."
    );
  });

  it("a failed save carries the server's detail message", () => {
    const saving = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: false,
    });
    const failed = autoProvisionReducer(saving, {
      type: "failed",
      message: "Invalid or expired billing action token.",
    });
    expect(failed.notice.text).toBe("Invalid or expired billing action token.");
  });

  it("ignores a new request while a save is in flight", () => {
    const saving = autoProvisionReducer(AUTO_PROVISION_IDLE, {
      type: "request",
      enabled: true,
    });
    expect(
      autoProvisionReducer(saving, { type: "request", enabled: false })
    ).toBe(saving);
  });

  it("confirm/cancel are no-ops outside the confirming phase", () => {
    expect(autoProvisionReducer(AUTO_PROVISION_IDLE, { type: "confirm" })).toBe(
      AUTO_PROVISION_IDLE
    );
    expect(autoProvisionReducer(AUTO_PROVISION_IDLE, { type: "cancel" })).toBe(
      AUTO_PROVISION_IDLE
    );
  });
});
