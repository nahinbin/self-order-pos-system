const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
process.env.HOSTNAME = hostname;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: "/socket.io",
    addTrailingSlash: false,
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    const restaurantId =
      socket.handshake.auth?.restaurantId ?? socket.handshake.query?.restaurantId;
    if (restaurantId != null) {
      socket.join(`restaurant:${restaurantId}`);
    }
  });

  const g = typeof globalThis !== "undefined" ? globalThis : global;
  g.__socket_io = io;

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
