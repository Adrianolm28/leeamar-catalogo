import { useEffect, useState } from 'react';
import { Search, Plus, Check, X, Package, Building2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { searchPurchaseRecords } from '../../services/purchases.api';

const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function PurchaseSearch({ kind, label, selectedIds, onSelect }) {
  const [term, setTerm] = useState('');
  const [batch, setBatch] = useState({ query: '', rows: [], failed: false });
  const [retry, setRetry] = useState(0);
  const query = term.trim();
  const ready = query.length >= 2;
  const pending = ready && batch.query !== query;
  const isProduct = kind === 'products';
  const tokens = normalize(query).split(/\s+/);
  const rows = !ready ? [] : batch.query === query ? batch.rows
    : batch.rows.filter((row) => tokens.every((token) => normalize(row.name).includes(token)));

  useEffect(() => {
    if (query.length < 2) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const records = await searchPurchaseRecords(kind, query, controller.signal);
        if (!controller.signal.aborted) setBatch({ query, rows: records, failed: false });
      } catch (error) {
        if (controller.signal.aborted || error.response?.status === 401) return;
        setBatch({ query, rows: [], failed: true });
        void Swal.fire({
          icon: 'error', title: 'No se pudo actualizar la búsqueda',
          text: 'Inténtalo nuevamente en unos momentos.', confirmButtonText: 'Entendido',
        });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, query, retry]);

  return (
    <section className="purchase-card purchase-browser">
      <div className="purchase-browser-heading">
        <span className="purchase-icon">{isProduct ? <Package size={22} /> : <Building2 size={22} />}</span>
        <div><label htmlFor={`purchase-${kind}`}>{label}</label>
          <p>{isProduct ? 'Agrega varias tallas o variantes sin salir de la búsqueda.' : 'Selecciona el contacto al que solicitarás la cotización.'}</p>
        </div>
      </div>
      <div className="purchase-live-search">
        <Search size={20} aria-hidden="true" />
        <input id={`purchase-${kind}`} value={term} maxLength={100} autoComplete="off"
          aria-describedby={`purchase-help-${kind}`}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={isProduct ? 'Buscar por código, nombre o variante...' : 'Buscar proveedor por nombre o documento...'} />
        {term && <button type="button" className="purchase-clear" aria-label={`Limpiar búsqueda de ${isProduct ? 'productos' : 'proveedores'}`} onClick={() => setTerm('')}><X size={18} /></button>}
      </div>
      <div className="purchase-search-status" id={`purchase-help-${kind}`} role="status">
        {!ready ? 'Escribe al menos 2 caracteres para comenzar.' : pending ? 'Actualizando resultados...' : batch.failed ? 'Búsqueda no disponible.' : `${rows.length} resultados${rows.length === 30 ? ' · Precisa la búsqueda para encontrar más.' : ''}`}
      </div>
      <ul className="purchase-results" aria-busy={pending}>
        {rows.map((record) => {
          const selected = selectedIds.includes(record.id);
          return (
            <li key={record.id} className={selected ? 'is-selected' : ''}>
              <span className="purchase-result-name">{record.name}</span>
              <button type="button" disabled={selected} onClick={() => onSelect(record)}
                aria-label={`${selected ? 'Seleccionado' : 'Seleccionar'} ${record.name}`}>
                {selected ? <Check size={18} /> : <Plus size={18} />}
                {selected ? 'Agregado' : isProduct ? 'Agregar' : 'Elegir'}
              </button>
            </li>
          );
        })}
      </ul>
      {!rows.length && <div className="purchase-empty">
        <Search size={28} aria-hidden="true" />
        <strong>{!ready ? 'Encuentra lo que necesitas' : pending ? 'Buscando coincidencias' : batch.failed ? 'Vuelve a intentarlo' : 'No encontramos coincidencias'}</strong>
        <span>{!ready ? 'Los resultados aparecerán mientras escribes.' : pending ? 'Puedes seguir escribiendo para precisar tu búsqueda.' : 'Prueba con otro nombre, documento o código.'}</span>
        {batch.failed && !pending && ready && <button type="button" onClick={() => { setBatch({ query: '', rows: [], failed: false }); setRetry((value) => value + 1); }}>Reintentar</button>}
      </div>}
    </section>
  );
}