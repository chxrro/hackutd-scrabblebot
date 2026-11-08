// Loopback-only latency injector for local adapter tests:
//   node scripts/latency-proxy.mjs <listenPort> <upstreamPort> <rttMs>
// HTTP requests are forwarded with rtt/2 delay each way; WebSocket frames are
// delayed rtt/2 in each direction (order preserved). Never point it off-host.
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const [listenPort, upstreamPort, rttArg] = process.argv.slice(2).map(Number);
const half = (rttArg || 200) / 2;
const UP = `127.0.0.1:${upstreamPort}`;

const server = http.createServer((req, res) => {
  setTimeout(() => {
    const up = http.request(
      { host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: { ...req.headers, host: UP } },
      (ur) => {
        const chunks = [];
        ur.on("data", (c) => chunks.push(c));
        ur.on("end", () => setTimeout(() => { res.writeHead(ur.statusCode ?? 502, ur.headers); res.end(Buffer.concat(chunks)); }, half));
      },
    );
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  }, half);
});
const wss = new WebSocketServer({ noServer: true, handleProtocols: (protos) => [...protos][0] });
server.on("upgrade", (req, socket, head) => {
  const protos = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const headers = {};
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  const upstream = new WebSocket(`ws://${UP}${req.url}`, protos, { headers, perMessageDeflate: false });
  const pendingUp = [];
  upstream.on("error", () => socket.destroy());
  upstream.on("unexpected-response", (_r, resp) => { socket.write(`HTTP/1.1 ${resp.statusCode} x\r\n\r\n`); socket.destroy(); });
  upstream.on("open", () => {
    wss.handleUpgrade(req, socket, head, (client) => {
      client.on("message", (data, isBinary) => setTimeout(() => upstream.readyState === 1 && upstream.send(data, { binary: isBinary }), half));
      upstream.on("message", (data, isBinary) => setTimeout(() => client.readyState === 1 && client.send(data, { binary: isBinary }), half));
      client.on("close", () => setTimeout(() => upstream.close(), half));
      upstream.on("close", () => setTimeout(() => client.close(), half));
      for (const p of pendingUp) upstream.send(p);
    });
  });
});
server.listen(listenPort, "127.0.0.1", () => console.log(`latency proxy 127.0.0.1:${listenPort} -> ${UP} rtt=${half * 2}ms`));
