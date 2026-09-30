import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ToeicEvent } from "../types/toeic";

let server: http.Server;

beforeAll(async () => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.url === "/api/toeic/chunk") {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        const a = JSON.stringify({ type: "transcript", seq: 1, text: "hello", sttMs: 10, provider: "p" }) + "\n";
        const b = JSON.stringify({ type: "position", part: 2, next: 8 }) + "\n";
        // split a line across two network writes to check the parser keeps partial lines
        res.write(a.slice(0, 20));
        setTimeout(() => {
          res.write(a.slice(20) + b.slice(0, 5));
          setTimeout(() => res.end(b.slice(5) + JSON.stringify({ type: "done", seq: 1 })), 20);
        }, 20);
      } else {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Bad app token" }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  (import.meta.env as Record<string, string>).VITE_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("sendChunk", () => {
  it("reassembles NDJSON events that are split across network chunks", async () => {
    const { sendChunk } = await import("./toeicService");
    const events: ToeicEvent[] = [];
    await sendChunk(new Blob([new Uint8Array([82, 73, 70, 70])]), "session-abcdef", 1, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["transcript", "position", "done"]);
  });

  it("turns a 401 into a readable error", async () => {
    const { setPosition } = await import("./toeicService");
    await expect(setPosition("session-abcdef", 1)).rejects.toThrow(/APP_TOKEN/);
  });
});
