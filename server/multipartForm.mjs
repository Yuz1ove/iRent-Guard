export async function readMultipartForm(req, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const contentType = getHeader(req, "content-type");
  const boundary = parseBoundary(contentType);

  if (!boundary) {
    throw badRequest("Content-Type must be multipart/form-data.");
  }

  const buffer = await readRequestBuffer(req);
  if (buffer.length > maxBytes) {
    throw badRequest("Uploaded file is too large.");
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from("\r\n\r\n");
  const fields = {};
  const files = {};
  let cursor = buffer.indexOf(delimiter);

  while (cursor !== -1) {
    cursor += delimiter.length;

    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) {
      break;
    }

    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) {
      cursor += 2;
    }

    const headerEnd = buffer.indexOf(headerSeparator, cursor);
    if (headerEnd === -1) break;

    const headerText = buffer.subarray(cursor, headerEnd).toString("utf8");
    const disposition = parseContentDisposition(headerText);
    const contentTypeHeader = parsePartHeader(headerText, "content-type");
    const contentStart = headerEnd + headerSeparator.length;
    const nextDelimiter = buffer.indexOf(delimiter, contentStart);
    if (nextDelimiter === -1) break;

    let contentEnd = nextDelimiter;
    if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) {
      contentEnd -= 2;
    }

    const content = buffer.subarray(contentStart, contentEnd);

    if (disposition.name) {
      if (disposition.fileName) {
        files[disposition.name] = {
          fileName: disposition.fileName,
          mimeType: contentTypeHeader || "application/octet-stream",
          buffer: content
        };
      } else {
        fields[disposition.name] = content.toString("utf8");
      }
    }

    cursor = nextDelimiter;
  }

  return { fields, files };
}

async function readRequestBuffer(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getHeader(req, name) {
  if (typeof req.headers?.get === "function") {
    return req.headers.get(name) ?? "";
  }

  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value.join("; ") : value ?? "";
}

function parseBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
  return match?.[1] ?? match?.[2] ?? "";
}

function parseContentDisposition(headerText) {
  const header = parsePartHeader(headerText, "content-disposition");
  const name = /(?:^|;\s*)name="([^"]+)"/i.exec(header)?.[1] ?? "";
  const fileName = /(?:^|;\s*)filename="([^"]*)"/i.exec(header)?.[1] ?? "";
  return { name, fileName };
}

function parsePartHeader(headerText, headerName) {
  const line = headerText
    .split(/\r\n/)
    .find((item) => item.toLowerCase().startsWith(`${headerName.toLowerCase()}:`));
  return line ? line.slice(line.indexOf(":") + 1).trim() : "";
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
