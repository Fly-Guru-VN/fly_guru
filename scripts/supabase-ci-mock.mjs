import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 54321;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  // Public pages only read the services table. An empty successful response
  // exercises the repository's checked-in fallback content without coupling
  // browser CI to production data or credentials.
  if (url.pathname === "/rest/v1/services") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("[]");
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end('{"message":"not found"}');
});

server.listen(port, host, () => {
  console.log(`Supabase CI mock listening on http://${host}:${port}`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
