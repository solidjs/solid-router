// The delegation fallback's lazy entry (see data/events.ts). Nothing imports
// this module statically — it exists so the dynamic import has a target that
// bundlers can keep as a split point: router-only apps never load the action
// machinery unless a server-action form actually submits.
export { submitServerForm } from "./action.js";
