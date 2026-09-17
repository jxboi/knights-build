import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer, loadEnv } from "vite";
import { createAdvisorReply } from "./advisor-service.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const loadedEnv = loadEnv(isProduction ? "production" : "development", root, "");
const env = (name) => process.env[name] || loadedEnv[name];
const defaultPort = Number(process.env.PORT || 5173);
let activePort = defaultPort;
const host = process.env.HOST || "0.0.0.0";
const distDirectory = path.join(root, "dist");

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJson(request, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(new Error("Request is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        settled = true;
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

async function handleAdvisor(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await readJson(request);
    const result = await createAdvisorReply(body, {
      apiKey: env("OPENROUTER_API_KEY"),
      model: env("OPENROUTER_MODEL"),
      fallbackModel: env("OPENROUTER_FALLBACK_MODEL"),
      referer: env("OPENROUTER_SITE_URL") || `http://localhost:${activePort}`,
    });
    sendJson(response, result.status, result.body);
  } catch (error) {
    sendJson(response, 400, {
      error: error?.message || "Request body must be valid JSON.",
    });
  }
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

async function serveProduction(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const requestedFile = path.resolve(distDirectory, `.${pathname}`);
  const insideDist =
    requestedFile === distDirectory || requestedFile.startsWith(`${distDirectory}${path.sep}`);
  if (!insideDist) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  let filePath = requestedFile;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    if (path.extname(pathname)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    filePath = path.join(distDirectory, "index.html");
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const vite = isProduction
  ? null
  : await createViteServer({
      root,
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/api/advisor") {
    handleAdvisor(request, response);
    return;
  }
  if (vite) {
    vite.middlewares(request, response);
    return;
  }
  serveProduction(request, response);
});

function listen(candidatePort) {
  activePort = candidatePort;
  const retryOnBusyPort = (error) => {
    server.removeListener("error", retryOnBusyPort);
    if (error.code === "EADDRINUSE") {
      listen(candidatePort + 1);
      return;
    }
    console.error(error);
    process.exitCode = 1;
  };
  server.once("error", retryOnBusyPort);
  server.listen(candidatePort, host, () => {
    server.removeListener("error", retryOnBusyPort);
    console.log(`Hearth & Hamlet is running at http://localhost:${candidatePort}`);
  });
}

listen(defaultPort);
