import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckSquare,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  Search,
  ShieldCheck,
  LockKeyhole,
  LogOut,
  Upload,
  RefreshCw,
} from 'lucide-react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from '../services/api';
import Pagination from '../components/Pagination';
import AdminPurchasesPage from './AdminPurchasesPage';

const PAGE_SIZE = 20;
const STATUSES = ['PENDIENTE', 'APROBADO', 'OCULTO', 'EN REVISIÓN'];

const normalizeHeader = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

function AdminPage() {
  const [products, setProducts] = useState([]);
  const [activeArea, setActiveArea] = useState('catalog');
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [authStatus, setAuthStatus] = useState('checking');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  const loadSummary = async () => {
    const response = await api.get('/admin/catalog/summary');
    setSummary(response.data.data);
  };

  useEffect(() => {
    const handleSessionExpired = () => {
      setProducts([]);
      setSummary(null);
      setPagination(null);
      setSelected([]);
      setPassword('');
      setLoginError('La sesión expiró. Ingresa nuevamente.');
      setAuthStatus('login');
    };

    window.addEventListener('leemark:admin-session-expired', handleSessionExpired);
    return () => window.removeEventListener('leemark:admin-session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    let active = true;

    api.get('/admin/auth/session')
      .then(() => {
        if (active) setAuthStatus('authenticated');
      })
      .catch(() => {
        if (active) setAuthStatus('login');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    api.get('/admin/catalog/summary')
      .then((response) => setSummary(response.data.data))
      .catch((requestError) => {
        if (requestError.response?.status === 401) {
          setAuthStatus('login');
          return;
        }
        setError('No se pudo cargar la administración.');
      });
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');

      try {
        const response = await api.get('/admin/catalog', {
          params: { page, pageSize: PAGE_SIZE, search, category, status },
          signal: controller.signal,
        });
        setProducts(response.data.data || []);
        setPagination(response.data.pagination || null);
        setSelected([]);
      } catch (requestError) {
        if (requestError.response?.status === 401) {
          setAuthStatus('login');
        } else if (requestError.code !== 'ERR_CANCELED') {
          setError('No se pudo cargar la administración. Inténtalo nuevamente.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, search, category, status, authStatus]);


  const handleLogin = async (event) => {
    event.preventDefault();
    if (loginBusy || !password) return;

    setLoginBusy(true);
    setLoginError('');

    try {
      await api.post('/admin/auth/login', { password });
      setPassword('');
      setAuthStatus('authenticated');
      await Swal.fire({
        icon: 'success',
        title: 'Acceso autorizado',
        text: 'Has iniciado sesión en la administración.',
        confirmButtonText: 'Continuar',
      });
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      const message = statusCode === 429
        ? 'Se alcanzó el límite de intentos. Inténtalo nuevamente más tarde.'
        : statusCode === 503
          ? 'El acceso administrativo no está configurado. Revisa la configuración del servidor.'
          : statusCode === 401
            ? 'La contraseña no es correcta. Verifícala e inténtalo nuevamente.'
            : 'No se pudo validar el acceso. Inténtalo nuevamente más tarde.';
      setLoginError(message);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/admin/auth/logout');
    } catch {
      // La sesión local se limpia aunque el servidor no responda.
    }
    setProducts([]);
    setSummary(null);
    setPagination(null);
    setSelected([]);
    setPassword('');
    setLoginError('');
    setAuthStatus('login');
  };

  const selectedOnPage = useMemo(
    () => products.filter((product) => selected.includes(product.recordId)).length,
    [products, selected],
  );

  const refresh = async () => {
    const response = await api.get('/admin/catalog', {
      params: { page, pageSize: PAGE_SIZE, search, category, status },
    });
    setProducts(response.data.data || []);
    setPagination(response.data.pagination || null);
    await loadSummary();
  };

  const updateStatus = async (recordId, nextStatus) => {
    setBusy(true);
    try {
      await api.patch(`/admin/catalog/${encodeURIComponent(recordId)}/status`, { status: nextStatus });
      await refresh();
      await Swal.fire({
        icon: 'success',
        title: 'Estado actualizado',
        text: 'El cambio se guardó correctamente.',
        confirmButtonText: 'Entendido',
      });
    } catch {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo actualizar',
        text: 'No se pudo completar la operación. Inténtalo nuevamente.',
        confirmButtonText: 'Entendido',
      });
    } finally {
      setBusy(false);
    }
  };

  const updateSelected = async (nextStatus) => {
    if (!selected.length) return;

    const actionLabel = nextStatus === 'APROBADO' ? 'publicar' : 'ocultar';
    const confirmation = await Swal.fire({
      icon: 'question',
      title: `¿Deseas ${actionLabel} ${selected.length} productos?`,
      text: 'La modificación se guardará únicamente en el catálogo Leemark.',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar',
    });

    if (!confirmation.isConfirmed) return;

    setBusy(true);
    try {
      await api.patch('/admin/catalog/bulk-status', {
        updates: selected.map((recordId) => ({ recordId, status: nextStatus })),
      });
      setSelected([]);
      await refresh();
      await Swal.fire({
        icon: 'success',
        title: 'Cambios guardados',
        text: `${selected.length} productos fueron actualizados.`,
        confirmButtonText: 'Continuar',
      });
    } catch {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo actualizar',
        text: 'No se pudieron guardar los cambios. Revisa la selección e inténtalo nuevamente.',
        confirmButtonText: 'Entendido',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (recordId) => {
    setSelected((current) => current.includes(recordId)
      ? current.filter((id) => id !== recordId)
      : [...current, recordId]);
  };

  const toggleCurrentPage = () => {
    const pageIds = products.map((product) => product.recordId);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

    setSelected((current) => allSelected
      ? current.filter((id) => !pageIds.includes(id))
      : [...new Set([...current, ...pageIds])]);
  };

  const exportExcel = async () => {
    setBusy(true);
    try {
      const response = await api.get('/admin/catalog/export');
      const rows = response.data.data || [];
      const exportRows = rows.map((product) => ({
        'Registro catálogo': product.recordId,
        'ID producto Odoo': product.odooProductId ?? '',
        'Código de referencia': product.codeReference || '',
        Producto: product.name,
        Categoría: product.category,
        Ubicación: product.location,
        'Stock físico': product.quantity,
        Disponible: product.availableQuantity,
        Estado: product.publicationStatus,
        'Motivo de revisión': product.reviewReason || '',
        Publicar: product.publicationStatus === 'APROBADO'
          ? 'SI'
          : product.publicationStatus === 'OCULTO'
            ? 'NO'
            : '',
      }));

      const workbook = XLSX.utils.book_new();
      const productsSheet = XLSX.utils.json_to_sheet(exportRows);
      productsSheet['!cols'] = [
        { wch: 19 }, { wch: 18 }, { wch: 22 }, { wch: 58 }, { wch: 38 },
        { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 64 }, { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(workbook, productsSheet, 'Catalogo');
      const instructions = [
        ['GESTIÓN MASIVA DE PUBLICACIÓN - LEEMARK'],
        ['Edita únicamente la columna "Publicar".'],
        ['SI: el producto pasa a APROBADO y se muestra en el catálogo público.'],
        ['NO: el producto pasa a OCULTO.'],
        ['En blanco: no modificar el estado actual del registro.'],
        ['No modificar ni eliminar "Registro catálogo"; identifica el registro local de este archivo.'],
        ['"ID producto Odoo" está vacío porque el reporte de existencias no lo incluye.'],
        ['La importación cambia solamente la publicación local; no modifica Odoo.'],
      ];
      const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
      instructionsSheet['!cols'] = [{ wch: 115 }];
      XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');
      XLSX.writeFile(workbook, 'leemark-publicacion-catalogo.xlsx');

      await Swal.fire({
        icon: 'success',
        title: 'Excel generado',
        text: `Se exportaron ${rows.length} registros. Edita "Publicar" y luego importa el archivo desde esta administración.`,
        confirmButtonText: 'Entendido',
      });
    } catch {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo exportar',
        text: 'No se pudo generar el archivo. Inténtalo nuevamente.',
        confirmButtonText: 'Entendido',
      });
    } finally {
      setBusy(false);
    }
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!/\.xlsx$/i.test(file.name)) {
      await Swal.fire({
        icon: 'warning',
        title: 'Formato no válido',
        text: 'Selecciona un archivo con extensión .xlsx.',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'catalogo')
        || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

      if (!rows.length) throw new Error('empty');

      const headers = Object.keys(rows[0]);
      const recordHeader = headers.find((header) => normalizeHeader(header) === 'registrocatalogo');
      const publishHeader = headers.find((header) => normalizeHeader(header) === 'publicar');

      if (!recordHeader || !publishHeader) {
        throw new Error('headers');
      }

      const updates = [];
      const seen = new Set();
      const invalidLines = [];

      rows.forEach((row, index) => {
        const recordId = String(row[recordHeader] ?? '').trim().toUpperCase();
        const value = normalizeHeader(row[publishHeader]);

        if (!recordId && !value) return;
        if (!value) return;

        if (!recordId || seen.has(recordId) || !['si', 's', 'yes', 'no', 'n'].includes(value)) {
          invalidLines.push(index + 2);
          return;
        }

        seen.add(recordId);
        updates.push({
          recordId,
          status: ['si', 's', 'yes'].includes(value) ? 'APROBADO' : 'OCULTO',
        });
      });

      if (invalidLines.length) {
        throw new Error('invalid-rows');
      }

      if (!updates.length) {
        await Swal.fire({
          icon: 'info',
          title: 'No hay cambios',
          text: 'Escribe SI o NO en la columna "Publicar" para los productos que deseas modificar. Las celdas vacías se ignoran.',
          confirmButtonText: 'Entendido',
        });
        return;
      }

      if (updates.length > 2000) throw new Error('too-many');

      const confirmation = await Swal.fire({
        icon: 'question',
        title: 'Confirmar importación',
        text: `Se actualizará la publicación de ${updates.length} productos. Las celdas vacías no se modificarán.`,
        showCancelButton: true,
        confirmButtonText: 'Aplicar cambios',
        cancelButtonText: 'Cancelar',
      });

      if (!confirmation.isConfirmed) return;

      await api.patch('/admin/catalog/bulk-status', { updates });
      await refresh();
      await Swal.fire({
        icon: 'success',
        title: 'Importación completada',
        text: `Se actualizaron ${updates.length} productos.`,
        confirmButtonText: 'Continuar',
      });
    } catch (error) {
      const message = error.message === 'headers'
        ? 'El Excel debe incluir las columnas "Registro catálogo" y "Publicar".'
        : error.message === 'invalid-rows'
          ? 'Hay filas con referencias vacías o repetidas, o con valores distintos de SI/NO.'
          : error.message === 'too-many'
            ? 'El archivo supera el máximo de 2000 registros por importación.'
            : 'No se pudo leer o importar el archivo. Verifica que sea un Excel válido y que provenga de la exportación del catálogo.';

      await Swal.fire({
        icon: 'error',
        title: 'No se pudo importar',
        text: message,
        confirmButtonText: 'Entendido',
      });
    } finally {
      setImporting(false);
    }
  };

  if (authStatus === 'checking') {
    return (
      <main className="admin-auth-shell">
        <section className="admin-login-card" aria-live="polite">
          <div className="admin-login-symbol"><LockKeyhole size={25} /></div>
          <span className="eyebrow">LEEMARK · ADMINISTRACIÓN</span>
          <h1>Verificando acceso</h1>
          <p>Estamos comprobando tu sesión administrativa.</p>
        </section>
      </main>
    );
  }

  if (authStatus !== 'authenticated') {
    return (
      <main className="admin-auth-shell">
        <section className="admin-login-card">
          <a href="/" className="admin-login-brand">
            <span className="brand-mark"><ShieldCheck size={21} /></span>
            <span className="brand-copy"><strong>LEEMARK</strong><small>ÁREA PRIVADA</small></span>
          </a>
          <div className="admin-login-symbol"><LockKeyhole size={25} /></div>
          <span className="eyebrow">ACCESO RESTRINGIDO</span>
          <h1>Administración</h1>
          <p>Ingresa la contraseña para gestionar los productos del catálogo.</p>
          <form className="admin-login-form" onSubmit={handleLogin}>
            <label htmlFor="admin-password">Contraseña</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              minLength={1}
              maxLength={200}
              autoFocus
            />
            {loginError && <div className="admin-login-error" role="alert">{loginError}</div>}
            <button type="submit" className="admin-login-button" disabled={loginBusy || !password}>
              {loginBusy ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
          <a href="/" className="admin-login-back"><ArrowLeft size={15} /> Volver al catálogo</a>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="/" className="brand">
          <span className="brand-mark"><ShieldCheck size={21} /></span>
          <span className="brand-copy"><strong>LEEMARK</strong><small>ADMINISTRACIÓN</small></span>
        </a>
        <div className="admin-header-actions">
          <button type="button" className="logout-button" aria-pressed={activeArea === 'catalog'} onClick={() => setActiveArea('catalog')}>Catálogo</button>
          <button type="button" className="logout-button" aria-pressed={activeArea === 'purchases'} onClick={() => setActiveArea('purchases')}>Compras</button>
          <a className="back-to-catalog" href="/"><ArrowLeft size={16} /> Volver al catálogo</a>
          <button type="button" className="logout-button" onClick={handleLogout}><LogOut size={15} /> Cerrar sesión</button>
        </div>
      </header>

      {activeArea === 'purchases' ? <AdminPurchasesPage /> : (
      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <span className="eyebrow">CONTROL COMERCIAL</span>
            <h1>Administración del catálogo</h1>
            <p>Decide qué productos se muestran a los clientes. Los cambios se guardan en Leemark, nunca en Odoo.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => refresh()} disabled={busy}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>

        <div className="source-warning">
          <FileSpreadsheet size={19} />
          <div>
            <strong>Regla de publicación automática</strong>
            <p>Todos los productos permitidos se publican por defecto. Solo quedan EN REVISIÓN los registros que comparten código y nombre base y se diferencian por un sufijo numérico final, como (1) o (2). Las ubicaciones ACB/Stock JULISS y los ID reales de Odoo se incorporarán en la sincronización.</p>
          </div>
        </div>

        <section className="admin-stats">
          <article className="stat-card"><span>Total de registros</span><strong>{summary?.total ?? '—'}</strong></article>
          <article className="stat-card pending"><span>Pendientes</span><strong>{summary?.PENDIENTE ?? '—'}</strong></article>
          <article className="stat-card approved"><span>Publicados</span><strong>{summary?.APROBADO ?? '—'}</strong></article>
          <article className="stat-card hidden"><span>Ocultos</span><strong>{summary?.OCULTO ?? '—'}</strong></article>
          <article className="stat-card review"><span>En revisión</span><strong>{summary?.['EN REVISIÓN'] ?? '—'}</strong></article>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Productos</h2>
              <p>La lista se carga por páginas para evitar enviar todo el catálogo al navegador.</p>
            </div>
            <div className="excel-actions">
              <button type="button" className="secondary-button" onClick={exportExcel} disabled={busy}>
                <Download size={16} /> Exportar Excel
              </button>
              <label className={`primary-button upload-button ${importing ? 'disabled' : ''}`}>
                <Upload size={16} /> {importing ? 'Importando...' : 'Importar cambios'}
                <input type="file" accept=".xlsx" onChange={importExcel} disabled={importing || busy} />
              </label>
            </div>
          </div>

          <div className="admin-filters">
            <label className="search-box">
              <Search size={17} />
              <input
                type="search"
                placeholder="Buscar por código, producto o registro..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="filter-select">
              <Filter size={15} />
              <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
                <option value="">Todas las categorías</option>
                {(summary?.categories || []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          {error && <div className="inline-message error-message">{error}</div>}

          <div className="bulk-toolbar">
            <label className="select-page">
              <input
                type="checkbox"
                checked={products.length > 0 && selectedOnPage === products.length}
                onChange={toggleCurrentPage}
              />
              Seleccionar esta página
            </label>
            <span>{selected.length} seleccionados</span>
            <div>
              <button type="button" className="bulk-approve" onClick={() => updateSelected('APROBADO')} disabled={!selected.length || busy}>
                <Eye size={15} /> Publicar seleccionados
              </button>
              <button type="button" className="bulk-hide" onClick={() => updateSelected('OCULTO')} disabled={!selected.length || busy}>
                <EyeOff size={15} /> Ocultar seleccionados
              </button>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th aria-label="Seleccionar" />
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Existencia</th>
                  <th>Estado</th>
                  <th>Publicación</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="table-empty">Cargando registros...</td></tr>
                ) : products.length ? products.map((product) => (
                  <tr key={product.recordId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(product.recordId)}
                        onChange={() => toggleSelected(product.recordId)}
                        aria-label={`Seleccionar ${product.name}`}
                      />
                    </td>
                    <td className="product-cell">
                      <strong>{product.name}</strong>
                      <span>{product.codeReference || 'Sin código de referencia'} · {product.recordId}</span>
                      {product.reviewReason && (
                        <small className="duplicate-note">
                          Revisión manual: {product.reviewReason} Grupo de {product.duplicateGroupSize} registros.
                        </small>
                      )}
                    </td>
                    <td>{product.category}</td>
                    <td className="stock-cell">
                      <strong>{product.quantity} {product.uom}</strong>
                      <span>Disponible: {product.availableQuantity}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${product.publicationStatus.toLowerCase().replaceAll(' ', '-').replace('ó', 'o')}`}>
                        {product.publicationStatus}
                      </span>
                    </td>
                    <td>
                      <select
                        className="status-select"
                        value={product.publicationStatus}
                        disabled={busy}
                        onChange={(event) => updateStatus(product.recordId, event.target.value)}
                        aria-label={`Estado de ${product.name}`}
                      >
                        {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="table-empty">No se encontraron productos con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination pagination={pagination} onPageChange={setPage} />
          <div className="admin-footnote">
            <CheckSquare size={15} />
            <span>Los productos en estado APROBADO son los únicos que aparecen en el catálogo público.</span>
          </div>
        </section>
      </main>
      )}
    </div>
  );
}

export default AdminPage;
