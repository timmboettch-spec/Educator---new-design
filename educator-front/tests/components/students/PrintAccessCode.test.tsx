import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import PrintAccessCodeModal from '../../../src/components/class/PrintAccessCode';

describe('PrintAccessCodeModal', () => {
  test('renders student Student code (single mode)', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={() => {}}
        className="Test Class"
        mode="single"
        student={{
          studentName: 'John',
          accessCode: 'ABC123',
        }}
      />,
    );

    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  test('renders print button', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={() => {}}
        className="Test Class"
        mode="single"
        student={{
          studentName: 'John',
          accessCode: 'ABC123',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  test('renders bulk mode', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={() => {}}
        className="Test Class"
        mode="bulk"
        students={[{ studentName: 'John', accessCode: 'ABC123' }]}
      />,
    );

    expect(screen.getByText(/All Students Code/i)).toBeInTheDocument();
  });
});
