import React, { useMemo } from 'react';
import QRCode from 'qrcode';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
}

export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({
  value,
  size = 76,
  className = '',
}) => {
  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(value || 'https://ambient-tv.local', {
        errorCorrectionLevel: 'M',
      });
      const count = qr.modules.size;
      const cells: boolean[][] = [];
      for (let r = 0; r < count; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < count; c++) {
          row.push(Boolean(qr.modules.get(r, c)));
        }
        cells.push(row);
      }
      return { count, cells };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) return null;

  const { count, cells } = matrix;
  const padding = 2;
  const viewBoxSize = count + padding * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label={`QR code for ${value}`}
      className={`rounded-xl bg-white/95 p-1 shadow-lg ${className}`}
    >
      <rect x="0" y="0" width={viewBoxSize} height={viewBoxSize} fill="#ffffff" rx="2" />
      {cells.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={c + padding}
              y={r + padding}
              width={1.03}
              height={1.03}
              fill="#0A0C10"
            />
          ) : null
        )
      )}
    </svg>
  );
};
