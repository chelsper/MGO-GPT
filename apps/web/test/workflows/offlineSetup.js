import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
import { afterAll, afterEach } from "vitest";

if (process.env.WORKFLOW_OFFLINE !== "1") {
  throw new Error("Use npm run test:workflows to run with credentials removed.");
}
const attempts = [];
const restore = [];
function block(object, key, label) {
  const original = object[key];
  object[key] = () => {
    attempts.push(label);
    throw new Error(`Offline workflow attempted ${label}; mock the external boundary instead.`);
  };
  restore.push(() => { object[key] = original; });
}
block(globalThis, "fetch", "unmocked fetch");
block(net.Socket.prototype, "connect", "network socket");
block(tls, "connect", "TLS connection");
for (const [module, name] of [[http, "HTTP"], [https, "HTTPS"]]) {
  block(module, "request", `${name} request`);
  block(module, "get", `${name} GET`);
}
block(dgram, "createSocket", "UDP socket");
syncBuiltinESMExports();
afterEach(() => {
  if (attempts.length) {
    const blocked = attempts.splice(0);
    throw new Error(`Offline workflow blocked unexpected I/O: ${blocked.join(", ")}`);
  }
});
afterAll(() => {
  restore.reverse().forEach(reset => reset());
  syncBuiltinESMExports();
});
