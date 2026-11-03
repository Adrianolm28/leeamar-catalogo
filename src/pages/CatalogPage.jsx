import { useEffect, useMemo, useState } from 'react';
import {
  HeartPulse,
  Search,
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Package,
  ShieldCheck,
  Truck,
  ClipboardList,
} from 'lucide-react';
import Swal from 'sweetalert2';
import api from '../services/api';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 12;

const emptyCustomer = {
  name: '',
  document: '',
  company: '',
  phone: '',
  email: '',
  notes: '',
};

function CatalogPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.get('/catalog/categories')
      .then(({ data }) => setCategories(data.data || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadError('');

      try {
        const response = await api.get('/catalog', {
          params: { page, pageSize: PAGE_SIZE, search, category },
          signal: controller.signal,
        });
        setProducts(response.data.data || []);
        setPagination(response.data.pagination || null);
      } catch (error) {
        if (error.code !== 'ERR_CANCELED') {
          setLoadError('No se pudo cargar el catálogo. Inténtalo nuevamente.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, search, category, reload]);

  const totalUnits = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart],
  );

  const addProduct = (product) => {
    setCart((current) => {
      const found = current.some((item) => item.recordId === product.recordId);

      if (found) {
        return current.map((item) => (
          item.recordId === product.recordId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      }

      return [...current, { ...product, quantity: 1 }];
    });
  };

  const changeQuantity = (recordId, amount) => {
    setCart((current) => current
      .map((item) => item.recordId === recordId
        ? { ...item, quantity: item.quantity + amount }
        : item)
      .filter((item) => item.quantity > 0));
  };

  const updateCustomer = (event) => {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
  };

  const sendQuote = async (event) => {
    event.preventDefault();

    if (!cart.length) {
      await Swal.fire({
        icon: 'info',
        title: 'Agrega productos',
        text: 'Selecciona al menos un producto para solicitar una cotización.',
        confirmButtonText: 'Entendido',
      });
      return;
    }

    setSending(true);

    try {
      const response = await api.post('/quotes', {
        customer,
        items: cart.map((item) => ({
          code: item.codeReference || item.recordId,
          name: item.name,
          quantity: item.quantity,
          recordId: item.recordId,
        })),
      });

      const quoteNumber = response.data?.data?.quoteNumber || '';

      setCart([]);
      setCustomer(emptyCustomer);

      await Swal.fire({
        icon: 'success',
        title: 'Solicitud recibida',
        text: quoteNumber
          ? `Tu solicitud ${quoteNumber} fue recibida correctamente.`
          : 'Tu solicitud fue recibida correctamente.',
        confirmButtonText: 'Listo',
      });
    } catch {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo enviar',
        text: 'No se pudo completar la solicitud. Inténtalo nuevamente o comunícate con soporte.',
        confirmButtonText: 'Entendido',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="public-shell">
      <header className="public-header">
        <a href="/" className="brand" aria-label="Leemark">
          <span className="brand-mark"><HeartPulse size={22} /></span>
          <span className="brand-copy">
            <strong>LEEMARK</strong>
            <small>CATÁLOGO DIGITAL</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="header-tag">Catálogo de productos</span>
          <a href="/admin" className="admin-shortcut">Administración</a>
          <a href="#solicitud" className="cart-shortcut">
            <ShoppingCart size={17} />
            <span>Mi solicitud</span>
            <b>{totalUnits}</b>
          </a>
        </div>
      </header>

      <main className="public-main">
        <section className="catalog-hero">
          <div className="hero-content">
            <span className="eyebrow">SOLUCIONES PARA TU BIENESTAR</span>
            <h1>Encuentra lo que necesitas.</h1>
            <p>Explora nuestro catálogo y envíanos los productos que deseas cotizar. Nuestro equipo comercial se pondrá en contacto contigo.</p>
            <a href="#productos" className="hero-button">Ver productos <ShoppingBag size={16} /></a>
          </div>
          <div className="hero-symbol"><HeartPulse size={106} strokeWidth={1.1} /></div>
          <div className="hero-bottom">
            <span><ShieldCheck size={15} /> Atención comercial</span>
            <span><ClipboardList size={15} /> Cotización personalizada</span>
            <span><Truck size={15} /> Consulta de disponibilidad</span>
          </div>
        </section>

        <section className="catalog-layout" id="productos">
          <div className="catalog-column">
            <div className="section-title">
              <div>
                <span className="eyebrow">CATÁLOGO LEEMARK</span>
                <h2>Productos</h2>
                <p>Selecciona los productos que deseas incluir en tu solicitud.</p>
              </div>
              <span className="result-count">
                {pagination ? `${pagination.total} productos` : ' '}
              </span>
            </div>

            <div className="catalog-toolbar">
              <label className="search-box">
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Buscar por producto o código..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <select
                aria-label="Filtrar por categoría"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas las categorías</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            {loadError && (
              <div className="inline-message error-message">
                {loadError}
                <button type="button" onClick={() => setReload((current) => current + 1)}>Reintentar</button>
              </div>
            )}

            {loading ? (
              <div className="loading-panel">Cargando productos...</div>
            ) : products.length ? (
              <>
                <div className="product-grid">
                  {products.map((product, index) => (
                    <article className="product-card" key={product.recordId}>
                      <div className={`product-image product-image-${index % 4}`}>
                        <Package size={38} strokeWidth={1.25} />
                        <span>{product.category}</span>
                      </div>
                      <div className="product-details">
                        <span className="product-code">{product.codeReference || 'Código no disponible'}</span>
                        <h3>{product.name}</h3>
                        <div className={`availability ${product.availableQuantity > 0 ? 'available' : 'check-stock'}`}>
                          <span />
                          {product.availableQuantity > 0 ? 'Disponible' : 'Consultar disponibilidad'}
                        </div>
                        <button type="button" className="add-product-button" onClick={() => addProduct(product)}>
                          <Plus size={16} /> Agregar a solicitud
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <Pagination pagination={pagination} onPageChange={setPage} />
              </>
            ) : (
              <div className="empty-catalog">
                <Package size={38} />
                <h3>No hay productos publicados</h3>
                <p>Estamos preparando nuestro catálogo. Vuelve a consultar próximamente.</p>
              </div>
            )}
          </div>

          <aside className="quote-column" id="solicitud">
            <div className="quote-card">
              <div className="quote-card-heading">
                <span className="quote-icon"><ShoppingBag size={19} /></span>
                <div>
                  <h2>Tu solicitud</h2>
                  <p>{cart.length} productos seleccionados</p>
                </div>
              </div>

              {cart.length ? (
                <div className="cart-lines">
                  {cart.map((item) => (
                    <div className="cart-line" key={item.recordId}>
                      <div className="cart-line-copy">
                        <strong>{item.name}</strong>
                        <small>{item.codeReference || item.recordId}</small>
                        <div className="quantity-control">
                          <button type="button" onClick={() => changeQuantity(item.recordId, -1)} aria-label="Disminuir cantidad"><Minus size={13} /></button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => changeQuantity(item.recordId, 1)} aria-label="Aumentar cantidad"><Plus size={13} /></button>
                        </div>
                      </div>
                      <button type="button" className="remove-line" onClick={() => changeQuantity(item.recordId, -item.quantity)} aria-label="Quitar producto">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <div className="cart-total"><span>Total de unidades</span><strong>{totalUnits}</strong></div>
                </div>
              ) : (
                <div className="empty-cart">
                  <ShoppingCart size={30} />
                  <strong>Tu solicitud está vacía</strong>
                  <p>Agrega productos del catálogo para preparar tu cotización.</p>
                </div>
              )}

              <div className="quote-divider" />
              <form className="customer-form" onSubmit={sendQuote}>
                <div className="form-heading">
                  <h3>Datos de contacto</h3>
                  <span>* Obligatorio</span>
                </div>
                <label>
                  Documento (DNI / RUC) *
                  <input name="document" value={customer.document} onChange={updateCustomer} required maxLength={20} inputMode="numeric" placeholder="Ingresa tu documento" />
                </label>
                <label>
                  Nombre completo *
                  <input name="name" value={customer.name} onChange={updateCustomer} required maxLength={100} placeholder="Tu nombre" />
                </label>
                <label>
                  Empresa <span>Opcional</span>
                  <input name="company" value={customer.company} onChange={updateCustomer} maxLength={120} placeholder="Nombre de tu empresa" />
                </label>
                <div className="form-row">
                  <label>
                    Teléfono *
                    <input name="phone" value={customer.phone} onChange={updateCustomer} required maxLength={30} placeholder="Tu teléfono" />
                  </label>
                  <label>
                    Correo <span>Opcional</span>
                    <input type="email" name="email" value={customer.email} onChange={updateCustomer} maxLength={150} placeholder="correo@ejemplo.com" />
                  </label>
                </div>
                <label>
                  Comentarios <span>Opcional</span>
                  <textarea name="notes" value={customer.notes} onChange={updateCustomer} rows="3" maxLength={500} placeholder="Cuéntanos qué necesitas..." />
                </label>
                <button type="submit" className="send-quote-button" disabled={sending || cart.length === 0}>
                  {sending ? 'Enviando solicitud...' : 'Solicitar cotización'}
                  <ShoppingBag size={16} />
                </button>
                <p className="privacy-note"><ShieldCheck size={14} /> Tus datos se utilizarán para atender tu solicitud.</p>
              </form>
            </div>
          </aside>
        </section>
      </main>

      <footer className="public-footer">
        <strong>LEEMARK</strong>
        <span>Catálogo digital · Solicitudes de cotización</span>
      </footer>
    </div>
  );
}

export default CatalogPage;
