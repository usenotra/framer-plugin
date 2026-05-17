import type {
  FieldDataInput,
  ManagedCollectionFieldInput,
} from "framer-plugin";
import type { NotraPost } from "../types/data";
import { MAX_ITEM_ID_LENGTH } from "./constants";

export function slugifyValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPostSlug(post: NotraPost): string {
  if (post.slug) {
    return post.slug;
  }

  const titleSlug = slugifyValue(post.title);
  if (titleSlug) {
    return titleSlug;
  }

  return post.id;
}

export function getStringHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2_147_483_647;
  }
  return hash.toString(36);
}

export function postToFieldData(post: NotraPost): FieldDataInput {
  const slug = getPostSlug(post);
  const fieldData: FieldDataInput = {
    id: { type: "string", value: post.id },
    title: { type: "string", value: post.title },
    slug: { type: "string", value: slug },
    content: { type: "formattedText", value: post.content },
    status: { type: "string", value: post.status },
  };

  return fieldData;
}

/**
 * Framer collection item ids must be <=64 chars. Shorten with a hash suffix when needed.
 */
export function toValidItemId(value: string): string {
  if (value.length <= MAX_ITEM_ID_LENGTH) {
    return value;
  }
  const suffix = `-${getStringHash(value).slice(0, 8)}`;
  return value.slice(0, MAX_ITEM_ID_LENGTH - suffix.length) + suffix;
}

export function getStringValue(
  item: FieldDataInput,
  fieldId: string
): string | undefined {
  const value = item[fieldId];
  return value?.type === "string" ? value.value : undefined;
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
