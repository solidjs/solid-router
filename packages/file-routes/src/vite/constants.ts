/**
 * The virtual module that serves the serialized route manifest.
 *
 * `virtual:` is Vite's convention for plugin-served modules, and the name is
 * not tied to any router. Override it with the plugin's `moduleId` option.
 */
export const moduleId = "virtual:file-routes";

export const DEFAULT_EXTENSIONS = ["js", "jsx", "ts", "tsx"];
