import {
  type FieldDataInput,
  framer,
  type ManagedCollection,
  type ManagedCollectionFieldInput,
  type ManagedCollectionItemInput,
} from "framer-plugin";
import type { DataSource, NotraPost, NotraPostsResponse } from "../types/data";
import {
  MAX_ITEMS,
  NOTRA_API_BASE,
  NOTRA_FIELDS,
  PLUGIN_KEYS,
} from "./constants";
import { validatePostsResponse } from "./schemas";
import { getStringValue, postToFieldData, toValidItemId } from "./utils";

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
    validatePostsResponse(data, page);
    if (allPosts.length + data.posts.length > MAX_ITEMS) {
      throw new Error(`Notra API returned more than ${MAX_ITEMS} posts`);
    }

    allPosts.push(...data.posts);

    if (
      data.pagination.nextPage == null ||
      page >= data.pagination.totalPages
    ) {
      break;
    }
    page = data.pagination.nextPage;
  }

  const items = allPosts.map((post) => postToFieldData(post));

  return {
    id: contentType,
    fields: NOTRA_FIELDS,
    items,
  };
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

    const sourceId = getStringValue(item, "id");
    if (!sourceId) {
      throw new Error(`Item at index ${i} does not have a valid source ID`);
    }

    const slugValue = getStringValue(item, slugField.id);
    if (!slugValue) {
      console.warn(
        `Skipping item at index ${i} because it doesn't have a valid slug`
      );
      continue;
    }

    const itemId = toValidItemId(sourceId.trim());
    const slug = slugValue.trim();
    if (!slug) {
      throw new Error(`Item “${sourceId}” has an empty slug`);
    }
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
      slug,
      draft: getStringValue(item, "status") === "draft",
      fieldData,
    });
  }

  const seenItemIds = new Set<string>();
  const seenSlugs = new Map<string, string>();
  for (const item of items) {
    if (seenItemIds.has(item.id)) {
      throw new Error(`Duplicate source item ID “${item.id}” found`);
    }
    seenItemIds.add(item.id);

    const previousItemId = seenSlugs.get(item.slug);
    if (previousItemId) {
      throw new Error(
        `Duplicate slug “${item.slug}” found for items “${previousItemId}” and “${item.id}”`
      );
    }
    seenSlugs.set(item.slug, item.id);
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
