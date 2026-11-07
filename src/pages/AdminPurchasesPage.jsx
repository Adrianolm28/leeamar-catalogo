import { useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import PurchaseSearch from '../components/purchases/PurchaseSearch';
import PurchaseLines from '../components/purchases/PurchaseLines';
import {
  getPurchaseConfiguration,
  previewPurchase,
  savePurchase,
  getPurchaseStatus,
  getPurchasePdf,
} from '../services/purchases.api';
import './AdminPurchasesPage.css';

const STORAGE = 'leemark:purchase-attempt';

export default function AdminPurchasesPage() {
  const [supplier, setSupplier] = useState(null);
  const [lines, setLines] = useState([]);
  const [configuration, setConfiguration] = useState(null);
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(() => {
    const token = sessionStorage.getItem(STORAGE);
    return token ? { token, status: 'pending' } : null;
  });
  const [busy, setBusy] = useState('');
  const lock = useRef(false);
  const currentPreview = useRef(null);

  const money = (value) => new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: preview?.currency || 'PEN',
    minimumFractionDigits: preview?.digits ?? 2,
    maximumFractionDigits: preview?.digits ?? 2,
  }).format(value);

  const alert = (title, text, icon = 'error') => Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: 'Entendido',
  });

  const run = async (label, action) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    try {
      await action();
    } catch {
      await alert(
        'No se pudo completar',
        'Si intentaste guardar, pulsa Consultar resultado antes de volver a crear una solicitud. Para un cálculo fallido, revisa la selección o comunícate con soporte.',
      );
    } finally {
      lock.current = false;
      setBusy('');
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    getPurchaseConfiguration(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setConfiguration(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.response?.status !== 401) {
          void Swal.fire({
            icon: 'error',
            title: 'Recepción sin verificar',
            text: 'Vuelve a abrir Compras para intentarlo nuevamente.',
          });
        }
      });

    return () => controller.abort();
  }, []);

  const invalidate = () => {
    currentPreview.current = null;
    setPreview(null);
  };

  const remember = (token) => {
    sessionStorage.setItem(STORAGE, token);
    setAttempt({ token, status: 'pending' });
  };

  const calculate = () => run('Calculando precios e impuestos...', async () => {
    invalidate();

    const result = await previewPurchase({
      partnerId: supplier.id,
      lines: lines.map((line) => ({
        id: line.id,
        quantity: Number(line.quantity),
      })),
    });

    if (result.status !== 'ready') {
      remember(result.token);
      return;
    }

    currentPreview.current = result;
    setPreview(result);
  });

  const save = () => run('Guardando solicitud...', async () => {
    const quote = currentPreview.current;

    if (!quote || quote.expiresAt <= Date.now()) {
      invalidate();
      await alert(
        'Actualiza el cálculo',
        'El cálculo venció. Vuelve a calcular antes de guardar.',
        'info',
      );
      return;
    }

    const answer = await Swal.fire({
      icon: 'question',
      title: '¿Guardar solicitud de cotización?',
      text: `${quote.supplier}. Total: ${money(quote.total)}. Recepción: PRODUCTOS TERMINADOS. Se guardará en borrador.`,
      showCancelButton: true,
      confirmButtonText: 'Guardar solicitud',
      cancelButtonText: 'Volver',
    });

    if (!answer.isConfirmed) return;

    remember(quote.token);
    const result = await savePurchase(quote.token);
    setAttempt(result);

    if (result.status === 'saved') {
      await alert(
        'Solicitud guardada',
        `${result.order.name}. El destino y las líneas fueron verificados.`,
        'success',
      );
    }
  });

  const check = () => run('Consultando resultado...', async () => {
    const result = await getPurchaseStatus(attempt.token);

    if (['ready', 'expired'].includes(result.status)) {
      sessionStorage.removeItem(STORAGE);
      setAttempt(null);
      invalidate();

      await alert(
        'No se inició el guardado',
        'Calcula nuevamente para continuar.',
        'info',
      );
    } else {
      setAttempt(result);
    }
  });

  const pdf = (open) => run('Generando PDF...', async () => {
    const answer = await Swal.fire({
      icon: 'question',
      title: open ? '¿Abrir solicitud para imprimir?' : '¿Generar PDF?',
      text: 'Si está en borrador, Odoo la marcará como enviada. Esta acción no representa un envío de correo al proveedor.',
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
    });

    if (!answer.isConfirmed) return;

    const popup = open ? window.open('', '_blank') : null;

    if (open && !popup) {
      await alert(
        'Permite la ventana emergente',
        'Habilita ventanas emergentes para abrir el PDF. También puedes descargarlo.',
      );
      return;
    }

    if (popup) {
      popup.opener = null;
      popup.document.title = 'Generando solicitud';
      popup.document.body.textContent = 'Generando PDF...';
    }

    try {
      const blob = await getPurchasePdf(attempt.token);
      const url = URL.createObjectURL(blob);

      if (popup) {
        popup.location.replace(url);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `Solicitud-${attempt.order.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      popup?.close();
      throw error;
    }
  });

  const reset = () => run('Preparando nueva selección...', async () => {
    const answer = await Swal.fire({
      icon: 'question',
      title: '¿Iniciar otra selección?',
      text: 'La solicitud ya guardada permanecerá en Odoo. Se limpiará esta pantalla.',
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Volver',
    });

    if (!answer.isConfirmed) return;

    sessionStorage.removeItem(STORAGE);
    setAttempt(null);
    setSupplier(null);
    setLines([]);
    invalidate();
  });

  const valid = supplier
    && lines.length > 0
    && lines.length <= 100
    && lines.every((line) => Number.isFinite(Number(line.quantity))
      && Number(line.quantity) > 0
      && Number(line.quantity) <= 1000000);

  return (
    <main className="admin-main purchases-page">
      <h1>Compras</h1>
      <p>Prepara tu solicitud, revisa los importes de Odoo y guárdala en borrador.</p>

      <section className="purchase-card" aria-live="polite">
        <strong>Recepción: </strong>
        {configuration?.reception.name || 'Sin verificar'}
        <p>
          <strong>Proveedor: </strong>
          {supplier?.name || preview?.supplier || 'Sin seleccionar'}
        </p>
      </section>

      {attempt && (
        <section className="purchase-card" role="status">
          <h2>
            {attempt.status === 'saved'
              ? `Solicitud ${attempt.order.name}`
              : attempt.status === 'cancelled'
                ? `Solicitud ${attempt.order?.name || ''} cancelada`
                : attempt.status === 'review'
                  ? 'El documento requiere revisión'
                  : 'Resultado del guardado pendiente'}
          </h2>

          <p>
            {attempt.status === 'saved'
              ? 'Documento verificado en Odoo. Puedes descargarlo o abrir el PDF para imprimir.'
              : attempt.status === 'cancelled'
                ? 'La solicitud fue cancelada en Odoo. Puedes iniciar una nueva selección.'
                : 'Consulta el resultado. No crees otra solicitud para reemplazar este intento hasta verificarlo en Odoo.'}
          </p>

          <p>Referencia del intento: {attempt.token}</p>
          {attempt.order && <p>Documento: {attempt.order.name}</p>}

          <button type="button" disabled={!!busy} onClick={check}>
            Consultar resultado
          </button>
        </section>
      )}

      {!attempt && (
        <>
          <fieldset
            disabled={!!busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {configuration && (
              <div className="purchase-grid">
                <PurchaseSearch
                  kind="suppliers"
                  label="1. Buscar proveedor"
                  selectedIds={supplier ? [supplier.id] : []}
                  onSelect={(record) => {
                    invalidate();
                    setSupplier(record);
                  }}
                />

                <PurchaseSearch
                  kind="products"
                  label="2. Buscar productos y variantes"
                  selectedIds={lines.map((line) => line.id)}
                  onSelect={(record) => {
                    invalidate();
                    setLines((current) => current.some((line) => line.id === record.id)
                      ? current
                      : [...current, { ...record, quantity: '1' }]);
                  }}
                />
              </div>
            )}

            <PurchaseLines
              lines={lines}
              onQuantity={(id, quantity) => {
                invalidate();
                setLines((current) => current.map((line) => (
                  line.id === id ? { ...line, quantity } : line
                )));
              }}
              onRemove={(id) => {
                invalidate();
                setLines((current) => current.filter((line) => line.id !== id));
              }}
            />
          </fieldset>

          <p>
            La selección sin guardar es temporal. Revisa cantidades y variantes
            antes de calcular. Máximo 100 líneas.
          </p>
        </>
      )}

      {preview && (
        <section className="purchase-card">
          <h2>Importes calculados por Odoo</h2>

          <div className="purchase-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad / unidad</th>
                  <th>Precio unitario</th>
                  <th>Impuestos</th>
                  <th>Subtotal</th>
                </tr>
              </thead>

              <tbody>
                {preview.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.quantity} {line.unit}</td>
                    <td>
                      {new Intl.NumberFormat('es-PE', {
                        maximumFractionDigits: 8,
                      }).format(line.price)}
                    </td>
                    <td>{line.taxes || 'Sin impuestos'}</td>
                    <td>{money(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>Subtotal: {money(preview.subtotal)}</p>

          {preview.taxGroups.map((group, index) => (
            <p key={`${group.name}-${index}`}>
              {group.name}: {money(group.amount)}
            </p>
          ))}

          <h2>Total: {money(preview.total)}</h2>
        </section>
      )}

      <p role="status">{busy}</p>

      <div className="purchase-actions">
        {!attempt && (
          <>
            <button
              type="button"
              disabled={!!busy || !valid || !configuration}
              onClick={calculate}
            >
              Calcular importes
            </button>

            <button
              type="button"
              disabled={!!busy || !preview}
              onClick={save}
            >
              Guardar solicitud
            </button>
          </>
        )}

        {attempt?.status === 'saved' && (
          <>
            <button type="button" disabled={!!busy} onClick={reset}>
              Nueva solicitud
            </button>

            <button type="button" disabled={!!busy} onClick={() => pdf(false)}>
              Descargar PDF
            </button>

            <button type="button" disabled={!!busy} onClick={() => pdf(true)}>
              Abrir para imprimir
            </button>
          </>
        )}
      </div>
    </main>
  );
}