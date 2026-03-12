const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
// Render/Railway: must listen on 0.0.0.0 so the platform proxy can reach the app
const hostname = process.env.PORT ? "0.0.0.0" : (process.env.HOSTNAME || "0.0.0.0");
process.env.HOSTNAME = hostname;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const httpServer = createServer((req, res) => handle(req, res));

    const io = new Server(httpServer, {
      path: "/socket.io",
      addTrailingSlash: false,
      cors: { origin: "*" },
    });

    io.on("connection", (socket) => {
      const restaurantId =
        socket.handshake.auth?.restaurantId ?? socket.handshake.query?.restaurantId;
      const room =
        restaurantId != null ? `restaurant:${restaurantId}` : null;

      if (room) {
        socket.join(room);
      }

      // Allow privileged clients (e.g. cashier) to broadcast lightweight
      // customer display updates to all screens for the same restaurant.
      socket.on("customer-display:update", (payload) => {
        if (!room) return;
        io.to(room).emit("customer-display:update", payload);
      });
    });

    const g = typeof globalThis !== "undefined" ? globalThis : global;
    g.__socket_io = io;

    httpServer.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("unhandledRejection at", p, "reason:", reason);
});
