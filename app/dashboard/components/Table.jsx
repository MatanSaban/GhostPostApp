'use client';

import styles from './shared.module.css';

/**
 * Reusable Table Container component
 * Wraps the table with proper styling and overflow handling
 */
export function TableContainer({ children, className = '' }) {
  return (
    <div className={`${styles.tableContainer} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Reusable Table component
 */
export function Table({ children, className = '' }) {
  return (
    <table className={`${styles.table} ${className}`}>
      {children}
    </table>
  );
}

/**
 * Reusable Table Head component
 */
export function Thead({ children, className = '' }) {
  return (
    <thead className={`${styles.tableHead} ${className}`}>
      {children}
    </thead>
  );
}

/**
 * Reusable Table Body component
 */
export function Tbody({ children, className = '' }) {
  return (
    <tbody className={`${styles.tableBody} ${className}`}>
      {children}
    </tbody>
  );
}

/**
 * Reusable Table Row component
 * @param {boolean} clickable - Whether the row is clickable (adds hover effect)
 */
export function Tr({ children, className = '', clickable = false, onClick }) {
  return (
    <tr 
      className={`${styles.tableRow} ${clickable ? styles.clickable : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

/**
 * Reusable Table Header Cell component
 * @param {string} align - Text alignment: 'start' | 'center' | 'end'
 * @param {string} width - Optional width (e.g., '100px', '20%')
 */
export function Th({ children, className = '', align = 'start', width }) {
  return (
    <th 
      className={`${styles.tableHeaderCell} ${styles[`align${align.charAt(0).toUpperCase() + align.slice(1)}`]} ${className}`}
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  );
}

/**
 * Reusable Table Data Cell component
 * @param {string} align - Text alignment: 'start' | 'center' | 'end'
 */
export function Td({ children, className = '', align = 'start' }) {
  return (
    <td className={`${styles.tableCell} ${styles[`align${align.charAt(0).toUpperCase() + align.slice(1)}`]} ${className}`}>
      {children}
    </td>
  );
}

/**
 * Reusable DataTable component - combines all table parts
 * @param {Array} columns - Column definitions: [{ key, label, align, width, render }]
 * @param {Array} data - Array of data objects
 * @param {function} onRowClick - Optional callback when a row is clicked
 * @param {function} keyExtractor - Function to extract unique key from row data (default: row.id)
 */
export function DataTable({ 
  columns, 
  data, 
  onRowClick, 
  keyExtractor = (row) => row.id,
  emptyMessage = 'No data available'
}) {
  return (
    <TableContainer>
      <Table>
        <Thead>
          <Tr>
            {columns.map((col) => (
              <Th key={col.key} align={col.align} width={col.width}>
                {col.label}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {data.length === 0 ? (
            <Tr>
              <Td className={styles.emptyCell} align="center">
                <span style={{ gridColumn: `span ${columns.length}` }}>{emptyMessage}</span>
              </Td>
            </Tr>
          ) : (
            data.map((row) => (
              <Tr 
                key={keyExtractor(row)} 
                clickable={!!onRowClick}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <Td key={col.key} align={col.align}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </Td>
                ))}
              </Tr>
            ))
          )}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
