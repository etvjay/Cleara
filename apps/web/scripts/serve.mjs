import { createServer } from "node:http";
import { createReadStream, realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist"));
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer((request, response) => {
  const rawPath = request.url?.split("?")[0] ?? "/";
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    response.writeHead(400); response.end("bad path"); return;
  }
  const relative = decoded === "/" ? "/index.html" : decoded;
  const candidate = resolve(root, `.${relative}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    response.writeHead(400); response.end("bad path"); return;
  }
  let file;
  try {
    file = realpathSync(candidate);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(400); response.end("bad path"); return;
    }
    if (statSync(file).isDirectory()) file = realpathSync(resolve(file, "index.html"));
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(400); response.end("bad path"); return;
    }
    if (!statSync(file).isFile()) {
      response.writeHead(404); response.end("not found"); return;
    }
  } catch {
    response.writeHead(404); response.end("not found"); return;
  }
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!response.headersSent) response.writeHead(404);
    response.end("not found");
  });
  stream.pipe(response);
});

function listen(candidate) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && candidate < port + 20) {
      listen(candidate + 1);
      return;
    }
    throw error;
  });
  server.listen(candidate, () => console.log(`Cleara workbench at http://localhost:${candidate}`));
}

listen(port);
