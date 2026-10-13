import { expect, test } from "vitest";
import { createDisabledEmailDelivery } from "../src/email/delivery.js";

test("disabled email delivery never claims a send", async () => {
  const delivery = createDisabledEmailDelivery();
  expect(delivery.enabled).toBe(false);
  await expect(delivery.deliver({ to: "student@example.com" })).resolves.toEqual({
    status: "disabled", retryable: false, providerMessageId: null,
  });
});
