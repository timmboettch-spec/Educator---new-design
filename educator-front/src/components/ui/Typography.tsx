import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption';
}

const styleMap = {
  h1: 'text-3xl font-bold text-text-primary',
  h2: 'text-2xl font-semibold text-text-primary',
  h3: 'text-xl font-medium text-text-primary',
  body: 'text-base font-normal text-text-secondary',
  caption: 'text-sm text-text-muted',
};

export default function Typography({ variant = 'body', children }: Props) {
  return <p className={styleMap[variant]}>{children}</p>;
}
