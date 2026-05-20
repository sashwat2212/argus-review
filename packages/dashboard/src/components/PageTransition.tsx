import { useEffect, useState } from 'react';

interface Props { children: React.ReactNode }

export function PageTransition({ children }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={{ transition: 'opacity 150ms ease', opacity: visible ? 1 : 0 }}>
      {children}
    </div>
  );
}
