import type {
  ManagedCollectionFieldInput,
  ProtectedMethod,
} from "framer-plugin";

export const PLUGIN_KEYS = {
  API_KEY: "apiKey",
  ALLOW_DRAFTS: "allowDrafts",
  DATA_SOURCE_ID: "dataSourceId",
  SLUG_FIELD_ID: "slugFieldId",
} as const;

// Use proxy in dev to avoid CORS (Framer plugin loads from localhost)
export const NOTRA_API_BASE = import.meta.env.DEV
  ? `${typeof window === "undefined" ? "" : window.location.origin}/api/notra/v1`
  : "https://api.usenotra.com/v1";

export const dataSourceOptions = [
  { id: "blog_post", name: "Blog Posts" },
  { id: "changelog", name: "Changelogs" },
] as const;

export const NOTRA_FIELDS: ManagedCollectionFieldInput[] = [
  { id: "id", name: "ID", type: "string" },
  { id: "title", name: "Title", type: "string" },
  { id: "slug", name: "Slug", type: "string" },
  { id: "content", name: "Content", type: "formattedText" },
  { id: "status", name: "Status", type: "string" },
];

export const NOTRA_PAGE_LIMIT = 100;
export const MAX_PAGES = 100;
export const MAX_ITEMS = NOTRA_PAGE_LIMIT * MAX_PAGES;
export const MAX_ITEM_ID_LENGTH = 64;

export const syncMethods = [
  "ManagedCollection.removeItems",
  "ManagedCollection.addItems",
  "ManagedCollection.setPluginData",
] as const satisfies ProtectedMethod[];
