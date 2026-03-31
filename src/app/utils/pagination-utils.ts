export class PaginationUtils {
  static getVisiblePages(
    currentPage: number,
    totalPages: number,
    maxVisible: number,
  ): number[] {
    if (totalPages <= 0) return [];

    let startPage: number;
    let endPage: number;

    if (totalPages <= maxVisible) {
      startPage = 0;
      endPage = totalPages - 1;
    } else {
      const maxPagesBeforeCurrentPage = Math.floor(maxVisible / 2);
      const maxPagesAfterCurrentPage = Math.ceil(maxVisible / 2) - 1;

      if (currentPage <= maxPagesBeforeCurrentPage) {
        startPage = 0;
        endPage = maxVisible - 1;
      } else if (currentPage + maxPagesAfterCurrentPage >= totalPages) {
        startPage = totalPages - maxVisible;
        endPage = totalPages - 1;
      } else {
        startPage = currentPage - maxPagesBeforeCurrentPage;
        endPage = currentPage + maxPagesAfterCurrentPage;
      }
    }

    return Array.from(
      { length: endPage + 1 - startPage },
      (_, i) => startPage + i,
    );
  }
}
