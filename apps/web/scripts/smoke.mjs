import { request } from "node:http";
import { spawn } from "node:child_process";

const port = 4178;
const child = spawn(process.execPath, ["scripts/serve.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});

function requestRaw(path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end();
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await requestRaw("/");
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error("server did not become ready");

  const home = await requestRaw("/");
  if (home.status !== 200 || !home.body.includes("src/browser.js")) throw new Error("home shell is incomplete");
  const tryPage = await requestRaw("/try?mode=guided");
  if (tryPage.status !== 200 || !tryPage.body.includes("src/browser.js")) throw new Error("try shell is incomplete");
  for (const path of ["/src/browser.js", "/src/browser.css", "/src/case.js", "/styles.css"]) {
    if ((await requestRaw(path)).status !== 200) throw new Error(`asset unavailable: ${path}`);
  }
  for (const path of ["/missing", "/src/", "/../package.json", "/%2e%2e/package.json", "/%2e%2e%2fpackage.json"]) {
    const status = (await requestRaw(path)).status;
    if (status !== 400 && status !== 404) throw new Error(`unsafe or missing path ${path} returned ${status}`);
  }
  console.log("workbench HTTP smoke: PASS");
} finally {
  child.kill("SIGTERM");
}
