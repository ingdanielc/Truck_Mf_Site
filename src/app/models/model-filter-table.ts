export class ModelFilterTable {
  constructor(
    public filter: Filter[] = [],
    public pagination: Pagination = new Pagination,
    public sort: Sort = new Sort()
  ) {}
}

export class Filter {
  constructor(
    public fieldFilter?: string,
    public compFilter?: string,
    public valueFilter?: string
  ) {}
}

export class Pagination {
  constructor(public pageSize?: number, public currentPage?: number) {}
}

export class Sort {
  constructor(public orderBy?: string, public sortAsc?: boolean) {}
}
