// A code-split route's action module: imported only after the router mounted.
import { action } from "../../src/index.js";

export const calls: string[] = [];

export const late = action(async (form: FormData) => {
  calls.push(String(form.get("text")));
  return "saved";
}, "late");
