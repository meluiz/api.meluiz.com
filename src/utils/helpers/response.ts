import type { NextApiResponse } from "next";

const codes = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status (WebDAV)",
  208: "Already Reported (WebDAV)",
  226: "IM Used",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  306: "(Unused)",
  307: "Temporary Redirect",
  308: "Permanent Redirect (experimental)",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Request Entity Too Large",
  414: "Request-URI Too Long",
  415: "Unsupported Media Type",
  416: "Requested Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot (RFC 2324)",
  420: "Enhance Your Calm (Twitter)",
  422: "Unprocessable Entity (WebDAV)",
  423: "Locked (WebDAV)",
  424: "Failed Dependency (WebDAV)",
  425: "Reserved for WebDAV",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  444: "No Response (Nginx)",
  449: "Retry With (Microsoft)",
  450: "Blocked by Windows Parental Controls (Microsoft)",
  451: "Unavailable For Legal Reasons",
  499: "Client Closed Request (Nginx)",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates (Experimental)",
  507: "Insufficient Storage (WebDAV)",
  508: "Loop Detected (WebDAV)",
  509: "Bandwidth Limit Exceeded (Apache)",
  510: "Not Extended",
  511: "Network Authentication Required",
  598: "Network read timeout error",
  599: "Network connect timeout error"
};

type Code = keyof typeof codes;

const getStatus = function (code: number) {
  let _status = "unknown";

  if (code < 200) _status = "info";
  if (code >= 200 && code < 300) _status = "success";
  if (code >= 300 && code < 400) _status = "redirect";
  if (code >= 400) _status = "error";

  return _status;
};

export const Response = (code: Code, data?: any, model?: "error") =>
  function (res: NextApiResponse) {
    const _response = {
      code,
      status: getStatus(code),
      data: data || null
    };

    if (model === "error") {
      const _code = codes[code].replace(/ /gi, "_").toUpperCase();
      if (data !== null && typeof data === "object") {
        if (Array.isArray(data)) {
          _response.data = data.map(prev => {
            if (typeof prev === "object") {
              if (Array.isArray(prev))
                return { type: prev[0], message: prev[1] };
              return { type: _code, ...prev };
            }
            return { type: _code, message: prev };
          });
        } else {
          _response.data = [{ type: _code, ...data }];
        }
      } else {
        _response.data = [{ type: _code, message: data }];
      }
    }

    return res.status(code).json(_response);
  };
