import { ChevronLeft, ChevronRight } from 'lucide-react';

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total, pageSize } = pagination;
  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Paginación">
      <span className="pagination-caption">
        Mostrando {firstItem}–{lastItem} de {total}
      </span>
      <div className="pagination-actions">
        <button
          type="button"
          className="pagination-button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={17} />
        </button>
        <span className="pagination-current">{page} / {totalPages}</span>
        <button
          type="button"
          className="pagination-button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
