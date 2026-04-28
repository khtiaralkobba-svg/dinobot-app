const http = require("http");
const fs = require("fs");
const path = require("path");

let orders = [];
let nextId = 1;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Serve index.html
  if (req.method === "GET" && pathname === "/") {
    const filePath = path.join(__dirname, "index.html");

    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("index.html not found");
    }
    return;
  }

  // Get all orders
  if (req.method === "GET" && pathname === "/api/orders") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(orders));
    return;
  }

  // Create order
  if (req.method === "POST" && pathname === "/api/orders") {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);

        const newOrder = {
          id: nextId++,
          table: data.table,
          items: data.items,
          status: "new",
          createdAt: new Date()
        };

        orders.push(newOrder);

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(newOrder));
      } catch (err) {
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });

    return;
  }

  // Update order status
  if (req.method === "PATCH" && pathname.startsWith("/api/orders/")) {
    const id = parseInt(pathname.split("/")[3]);

    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const order = orders.find(o => o.id === id);

        if (!order) {
          res.writeHead(404);
          res.end("Order not found");
          return;
        }

        order.status = data.status;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(order));
      } catch (err) {
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });

    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(3000, () => {
  console.log("🚀 Dinobot running at http://localhost:3000");
});