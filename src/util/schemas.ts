import type { NotraPostsResponse } from "../types/data";
import { MAX_PAGES, NOTRA_PAGE_LIMIT } from "./constants";

export function validatePostsResponse(data: NotraPostsResponse, page: number) {
  if (!(Array.isArray(data.posts) && data.pagination)) {
    throw new Error("Invalid Notra API response");
  }

  const { pagination } = data;
  const expectedNextPage = page < pagination.totalPages ? page + 1 : null;
  if (
    pagination.currentPage !== page ||
    pagination.limit > NOTRA_PAGE_LIMIT ||
    pagination.totalPages > MAX_PAGES ||
    (pagination.nextPage !== null && pagination.nextPage !== expectedNextPage)
  ) {
    throw new Error("Invalid Notra API pagination");
  }
}
