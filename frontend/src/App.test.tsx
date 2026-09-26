import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the header', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Graph Painter' })).toBeInTheDocument();
});
