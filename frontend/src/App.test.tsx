import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the header', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Shadey' })).toBeInTheDocument();
});

it('says in the footer that Shadey is not GitHub', () => {
    render(<App />);
    expect(screen.getByText(/isn't affiliated with or endorsed by GitHub/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
});
