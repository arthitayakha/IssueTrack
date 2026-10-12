export interface PaginationParams {
  page: number;
  limit: number;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(query: {
  page?: string;
  limit?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? "", 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit ?? "", 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, limit };
}

export function paginate<T>(items: T[], params: PaginationParams): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  const start = (params.page - 1) * params.limit;
  return {
    data: items.slice(start, start + params.limit),
    total,
    page: params.page,
    limit: params.limit,
    totalPages,
  };
}
