// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";

import { Response } from "@util/helpers";

import cache from "@meluiz/memojs";
import axios from "axios";
import * as cheerio from "cheerio";
import md5 from "md5";
import slugify from "slugify";
import URI from "urijs";

const _default = [
  "application-name",
  "author",
  "description",
  "keywords",
  "generator"
];

const _metatags: Record<string, [string[], string]> = {
  opengraph: [
    [
      "og:type",
      "og:title",
      "og:title",
      "og:descrition",
      "og:image",
      "og:image:width",
      "og:image:height",
      "og:image:alt",
      "og:locale",
      "og:site_name"
    ],
    "og"
  ],
  twitter: [["twitter:site", "twitter:creator", "twitter:card"], "twitter"]
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return Response(405)(res);

  const url = req.query.url;

  if (!url) return Response(400, "`url` params is missing", "error")(res);

  if (Array.isArray(url))
    return Response(400, "There are multiples `url` params", "error")(res);

  const _url = new URI(url);
  const _id = md5(slugify(_url.href(), { strict: true }));

  if (cache.has(_id)) return Response(200, cache.get(_id))(res);

  if (!_url.is("url"))
    return Response(400, "`url` param need to be valid", "error")(res);

  const _data: Record<string, any> = {
    id: _id
  };

  try {
    const { data } = await axios.get(_url.href());
    const $ = cheerio.load(data);

    const getValue = (field: string) =>
      $(`meta[property=${field}]`).attr("content") ||
      $(`meta[name=${field}]`).attr("content");

    _data.title = $("title").text();

    for (const field of _default) {
      _data[field] = getValue(field);
    }

    for (const index in _metatags) {
      _data[index] = {};
      const fields = _metatags[index][0];
      const pattern = _metatags[index][1];

      for (const field of fields) {
        const key = field.replace(`${pattern}:`, "").replace(/:/g, "_");
        const value = getValue(field);

        _data[index][key] = value || null;
      }
    }
  } catch (e: any) {
    return Response(400, e.message, "error")(res);
  }

  _data.updated = new Date().toISOString();

  cache.set(_id, _data, 3600);

  return Response(200, _data)(res);
}
