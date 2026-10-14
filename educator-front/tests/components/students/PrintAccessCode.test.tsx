import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import PrintAccessCodeModal from '../../../src/components/class/PrintAccessCode';

describe('PrintAccessCodeModal', () => {
  test('renders student Student code', () => {
    render(
      <PrintAccessCodeModal
        isOpen={true}
        onClose={() => {}}
        className="Test Class"
        student={{
          studentName: 'John',
          accessCode: 'ABC123',
        }}
      />
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
        student={{
          studentName: 'John',
          accessCode: 'ABC123',
        }}
      />
    );

    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });
});
