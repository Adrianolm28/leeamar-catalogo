export default function PurchaseLines({ lines, onQuantity, onRemove }) {
  return (
    <section className="purchase-card">
      <h2>Productos seleccionados ({lines.length})</h2>
      {!lines.length ? <p>Busca productos y selecciona las variantes que deseas comprar.</p> : (
        <div className="purchase-table-scroll">
          <table>
            <thead><tr><th>Producto y variante</th><th>Cantidad</th><th>Acciones</th></tr></thead>
            <tbody>{lines.map((line) => (
              <tr key={line.id}>
                <td>{line.name}</td>
                <td><input type="number" min="0.000001" max="1000000" step="any" required
                  aria-label={`Cantidad de ${line.name}`} value={line.quantity}
                  onChange={(event) => onQuantity(line.id, event.target.value)} /></td>
                <td><button type="button" onClick={() => onRemove(line.id)} aria-label={`Quitar ${line.name}`}>Quitar</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
