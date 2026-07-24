import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextHint } from '../../renderer/components/ContextHint';

describe('ContextHint', () => {
  it('renders the hint through a body portal when the tag receives focus', () => {
    const { container } = render(
      <div className="overflow-hidden">
        <ContextHint title="Status meaning" description="Operational explanation">
          <span>Pending</span>
        </ContextHint>
      </div>,
    );

    fireEvent.focus(screen.getByRole('button', { name: 'More information about Status meaning' }));

    expect(screen.getByRole('tooltip')).toHaveTextContent('Operational explanation');
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('supports click-to-pin and Escape-to-close', () => {
    render(
      <ContextHint title="Agency role" description="Primary agency explanation">
        <span>Primary</span>
      </ContextHint>,
    );

    const trigger = screen.getByRole('button', { name: 'More information about Agency role' });
    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
