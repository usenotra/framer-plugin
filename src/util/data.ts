import {
  type FieldDataInput,
  framer,
  type ManagedCollection,
  type ManagedCollectionFieldInput,
  type ManagedCollectionItemInput,
  type ProtectedMethod,
} from "framer-plugin";

export const PLUGIN_KEYS = {
  API_KEY: "apiKey",
  ALLOW_DRAFTS: "allowDrafts",
  DATA_SOURCE_ID: "dataSourceId",
  SLUG_FIELD_ID: "slugFieldId",
} as const;

// Use proxy in dev to avoid CORS (Framer plugin loads from localhost)
const NOTRA_API_BASE = import.meta.env.DEV
  ? `${typeof window === "undefined" ? "" : window.location.origin}/api/notra/v1`
  : "https://api.usenotra.com/v1";

export interface DataSource {
  fields: readonly ManagedCollectionFieldInput[];
  id: string;
  items: FieldDataInput[];
}

export const dataSourceOptions = [
  { id: "blog_post", name: "Blog Posts" },
  { id: "changelog", name: "Changelogs" },
] as const;

interface NotraPost {
  content: string;
  contentType: string;
  createdAt: string;
  id: string;
  markdown: string;
  recommendations: string | null;
  status: string;
  title: string;
  updatedAt: string;
}

interface NotraPostsResponse {
  pagination: {
    limit: number;
    currentPage: number;
    nextPage: number | null;
    totalPages: number;
    totalItems: number;
  };
  posts: NotraPost[];
}

const NOTRA_FIELDS: ManagedCollectionFieldInput[] = [
  { id: "id", name: "ID", type: "string" },
  { id: "title", name: "Title", type: "string" },
  { id: "content", name: "Content", type: "formattedText" },
  { id: "status", name: "Status", type: "string" },
];

function postToFieldData(post: NotraPost): FieldDataInput {
  return {
    id: { type: "string", value: post.id },
    title: { type: "string", value: post.title },
    content: { type: "formattedText", value: post.content },
    status: { type: "string", value: post.status },
  };
}

/**
 * Fetch posts from Notra API and map to Framer DataSource format.
 * Paginates through all results.
 * @see https://docs.usenotra.com/api-reference/content/list-posts
 */
export async function getDataSource(
  apiKey: string,
  contentType: string,
  abortSignal?: AbortSignal,
  allowDrafts?: boolean
): Promise<DataSource> {
  const headers = {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  };

  const allPosts: NotraPost[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`${NOTRA_API_BASE}/posts`);
    url.searchParams.set("contentType", contentType);
    url.searchParams.set("status", "published");
    if (allowDrafts) {
      url.searchParams.append("status", "draft");
    }
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      signal: abortSignal,
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      let message = `Notra API error (${response.status})`;
      try {
        const json = JSON.parse(body) as { error?: string };
        if (json.error) {
          message = json.error;
        }
      } catch {
        if (body) {
          message = body;
        }
      }
      throw new Error(message);
    }

    const data = (await response.json()) as NotraPostsResponse;
    allPosts.push(...data.posts);

    if (
      data.pagination.nextPage == null ||
      page >= data.pagination.totalPages
    ) {
      break;
    }
    page += 1;
  }

  const items = allPosts.map((post) => postToFieldData(post));

  return {
    id: contentType,
    fields: NOTRA_FIELDS,
    items,
  };
}

export function mergeFieldsWithExistingFields(
  sourceFields: readonly ManagedCollectionFieldInput[],
  existingFields: readonly ManagedCollectionFieldInput[]
): ManagedCollectionFieldInput[] {
  return sourceFields.map((sourceField) => {
    const existingField = existingFields.find(
      (existingField) => existingField.id === sourceField.id
    );
    if (existingField) {
      return { ...sourceField, name: existingField.name };
    }
    return sourceField;
  });
}

const MAX_SLUG_LENGTH = 64;

/**
 * Framer collection item ids must be ≤64 chars. Shorten with a hash suffix when needed.
 */
function toValidItemId(slug: string): string {
  if (slug.length <= MAX_SLUG_LENGTH) {
    return slug;
  }
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i);
    hash &= 0x7f_ff_ff_ff;
  }
  const suffix = `-${hash.toString(36).slice(0, 8)}`;
  return slug.slice(0, MAX_SLUG_LENGTH - suffix.length) + suffix;
}

export async function syncCollection(
  collection: ManagedCollection,
  dataSource: DataSource,
  fields: readonly ManagedCollectionFieldInput[],
  slugField: ManagedCollectionFieldInput
) {
  const items: ManagedCollectionItemInput[] = [];
  const unsyncedItems = new Set(await collection.getItemIds());

  for (let i = 0; i < dataSource.items.length; i++) {
    const item = dataSource.items[i];
    if (!item) {
      throw new Error("Logic error");
    }

    const slugValue = item[slugField.id];
    if (!slugValue || typeof slugValue.value !== "string") {
      console.warn(
        `Skipping item at index ${i} because it doesn't have a valid slug`
      );
      continue;
    }

    const itemId = toValidItemId(slugValue.value);
    unsyncedItems.delete(itemId);

    const fieldData: FieldDataInput = {};
    for (const [fieldName, value] of Object.entries(item)) {
      const field = fields.find((field) => field.id === fieldName);

      // Field is in the data but skipped based on selected fields.
      if (!field) {
        continue;
      }

      // For details on expected field value, see:
      // https://www.framer.com/developers/plugins/cms#collections
      fieldData[field.id] = value;
    }

    items.push({
      id: itemId,
      slug: itemId,
      draft: false,
      fieldData,
    });
  }

  await collection.removeItems(Array.from(unsyncedItems));
  await collection.addItems(items);

  await collection.setPluginData(PLUGIN_KEYS.DATA_SOURCE_ID, dataSource.id);
  await collection.setPluginData(PLUGIN_KEYS.SLUG_FIELD_ID, slugField.id);
}

export async function setStoredApiKey(
  collection: ManagedCollection,
  apiKey: string
): Promise<void> {
  await collection.setPluginData(PLUGIN_KEYS.API_KEY, apiKey.trim());
}

export async function setStoredAllowDrafts(
  collection: ManagedCollection,
  allowDrafts: boolean
): Promise<void> {
  await collection.setPluginData(PLUGIN_KEYS.ALLOW_DRAFTS, String(allowDrafts));
}

export const syncMethods = [
  "ManagedCollection.removeItems",
  "ManagedCollection.addItems",
  "ManagedCollection.setPluginData",
] as const satisfies ProtectedMethod[];

export async function syncExistingCollection(
  collection: ManagedCollection,
  previousDataSourceId: string | null,
  previousSlugFieldId: string | null,
  previousApiKey: string | null
): Promise<{ didSync: boolean }> {
  if (
    !(previousDataSourceId && previousSlugFieldId && previousApiKey?.trim())
  ) {
    return { didSync: false };
  }

  if (framer.mode !== "syncManagedCollection") {
    return { didSync: false };
  }

  if (!framer.isAllowedTo(...syncMethods)) {
    return { didSync: false };
  }

  try {
    const previousAllowDrafts =
      (await collection.getPluginData(PLUGIN_KEYS.ALLOW_DRAFTS)) === "true";
    const dataSource = await getDataSource(
      previousApiKey,
      previousDataSourceId,
      undefined,
      previousAllowDrafts
    );
    const existingFields = await collection.getFields();

    if (previousSlugFieldId === "status") {
      return { didSync: false };
    }
    const slugField = dataSource.fields.find(
      (field) => field.id === previousSlugFieldId
    );
    if (!slugField) {
      framer.notify(
        `No field matches the slug field id “${previousSlugFieldId}”. Sync will not be performed.`,
        {
          variant: "error",
        }
      );
      return { didSync: false };
    }

    await syncCollection(collection, dataSource, existingFields, slugField);
    return { didSync: true };
  } catch (error) {
    console.error(error);
    framer.notify(
      `Failed to sync collection “${previousDataSourceId}”. Check browser console for more details.`,
      {
        variant: "error",
      }
    );
    return { didSync: false };
  }
}
