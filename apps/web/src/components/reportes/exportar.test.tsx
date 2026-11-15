import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { leerFormato, leerMotivoExportacion } from '@/lib/reportes/exportacion';
import { AvisoExportacion, BotonesExportar } from './exportar';

describe('BotonesExportar', () => {
  it('descarga CSV y PDF con los mismos filtros de la vista', () => {
    render(
      <BotonesExportar
        filtros={{ desde: '2026-12-01', hasta: '2026-12-31', usuario: 'ana@correo.ec' }}
        generadoEn="2027-01-02T10:00:00Z"
      />,
    );

    expect(screen.getByRole('link', { name: 'Descargar CSV' })).toHaveAttribute(
      'href',
      '/admin/reportes/exportar?desde=2026-12-01&hasta=2026-12-31&usuario=ana%40correo.ec&formato=csv',
    );
    expect(screen.getByRole('link', { name: 'Descargar PDF' })).toHaveAttribute(
      'href',
      '/admin/reportes/exportar?desde=2026-12-01&hasta=2026-12-31&usuario=ana%40correo.ec&formato=pdf',
    );
    expect(screen.getByText(/Calculado por el servicio de reportes/)).toHaveTextContent(
      '2 ene 2027',
    );
  });
});

describe('AvisoExportacion', () => {
  it('explica por qué no se descargó', () => {
    render(<AvisoExportacion motivo="sin-permiso" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se descargó el reporte: solo un administrador puede exportarlo.',
    );
  });

  it('solo acepta motivos y formatos conocidos de la URL', () => {
    expect(leerMotivoExportacion({ exportacion: 'no-disponible' })).toBe('no-disponible');
    expect(leerMotivoExportacion({ exportacion: 'toString' })).toBeUndefined();
    expect(leerFormato({ formato: 'pdf' })).toBe('pdf');
    expect(leerFormato({ formato: 'html' })).toBeNull();
  });
});
