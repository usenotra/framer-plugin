import type {
  FieldDataInput,
  ManagedCollectionFieldInput,
} from "framer-plugin";

export interface DataSource {
  fields: readonly ManagedCollectionFieldInput[];
  id: string;
  items: FieldDataInput[];
}

export interface NotraPost {
  content: string;
  contentType: string;
  createdAt: string;
  id: string;
  markdown: string;
  recommendations: string | null;
  slug: string | null;
  status: string;
  title: string;
  updatedAt: string;
}

export interface NotraPostsResponse {
  pagination: {
    limit: number;
    currentPage: number;
    nextPage: number | null;
    totalPages: number;
    totalItems: number;
  };
  posts: NotraPost[];
}
