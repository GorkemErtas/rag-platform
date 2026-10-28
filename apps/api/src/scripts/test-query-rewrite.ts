import { expandSearchQueries } from "../services/query-rewrite-service.js";

const query =
  process.argv.slice(2).join(" ").trim() ||
  "Can a client-visible build be sent as a direct file attachment?";

const queries = await expandSearchQueries(query);

console.log("\nQueries:");

queries.forEach((item, index) => {
  console.log(`${index + 1}. ${item}`);
});