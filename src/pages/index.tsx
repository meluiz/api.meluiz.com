import type { NextPage } from "next";
import React from "react";

const Page: NextPage = function () {
  return <div>Hello, World</div>;
};

export default Page;

export async function getStaticProps() {
  return { notFound: true };
}
