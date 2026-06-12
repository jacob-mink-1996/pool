import assert from "node:assert/strict";
import test from "node:test";
import { createLocalTrustConfig, isAuthorizedRequest, isLoopbackHost } from "./local-trust.mjs";

test("local trust allows loopback without a token", () => {
  const config = createLocalTrustConfig({ host: "127.0.0.1" });

  assert.equal(config.mode, "loopback");
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isAuthorizedRequest({ headers: {} }, config), true);
});

test("local trust requires token protection for non-loopback hosts", () => {
  assert.throws(
    () => createLocalTrustConfig({ host: "0.0.0.0" }),
    /FLOOP_AUTH_TOKEN/,
  );

  const config = createLocalTrustConfig({ host: "0.0.0.0", authToken: "secret" });
  assert.equal(config.mode, "token");
  assert.equal(isAuthorizedRequest({ headers: {} }, config), false);
  assert.equal(isAuthorizedRequest({ headers: { authorization: "Bearer secret" } }, config), true);
  assert.equal(isAuthorizedRequest({ headers: { "x-floop-auth": "secret" } }, config), true);
});
