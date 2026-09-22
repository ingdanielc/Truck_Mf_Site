import {
  DocumentFileTooLargeError,
  documentUploadErrorMessage,
  prepareDocumentFile,
} from './document-image';

/** Una imagen PNG real, dibujada en un canvas, para que el navegador la lea. */
function pngDe(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.fillRect(0, 0, width, height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob!), 'image/png'),
  );
}

describe('prepareDocumentFile', () => {
  it('deja el PDF tal cual', async () => {
    const pdf = new File(['%PDF-1.4'], 'soat.pdf', { type: 'application/pdf' });
    const { blob, name } = await prepareDocumentFile(pdf, pdf.name);
    expect(blob).toBe(pdf);
    expect(name).toBe('soat.pdf');
  });

  it('redibuja la imagen como JPEG, sin cambiar su tamaño', async () => {
    const png = await pngDe(640, 1136);
    const { blob, name } = await prepareDocumentFile(png, 'foto.png');
    expect(blob.type).toBe('image/jpeg');
    expect(name).toBe('foto.jpg');

    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(640);
    expect(bitmap.height).toBe(1136);
  });

  it('reconoce la imagen por la extensión cuando no trae tipo', async () => {
    const png = await pngDe(10, 10);
    const sinTipo = new Blob([await png.arrayBuffer()]);
    const { blob } = await prepareDocumentFile(sinTipo, 'recibo.PNG');
    expect(blob.type).toBe('image/jpeg');
  });

  it('el error de tamaño trae su propio mensaje', () => {
    const error = new DocumentFileTooLargeError();
    expect(documentUploadErrorMessage(error, 'genérico')).toContain('5 MB');
    expect(documentUploadErrorMessage(new Error('x'), 'genérico')).toBe(
      'genérico',
    );
  });
});
