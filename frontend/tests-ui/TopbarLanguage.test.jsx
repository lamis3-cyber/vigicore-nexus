import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nProvider } from '../src/i18n/index.jsx';
import TopbarLanguage from '../src/dashboards/components/TopbarLanguage.jsx';

beforeEach(() => { cleanup(); localStorage.clear(); });

describe('menu de langue de la barre du haut', () => {
  it('le bouton affiche la langue courante et la liste s\'ouvre avec les trois langues', () => {
    render(<I18nProvider><TopbarLanguage /></I18nProvider>);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toMatch(/FR/);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(btn);
    const opts = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opts).toEqual(['Français', 'العربية', 'English']);
  });
  it('choisir une langue change le bouton et ferme la liste', () => {
    render(<I18nProvider><TopbarLanguage /></I18nProvider>);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: 'English' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button').textContent).toMatch(/EN/);
  });
});
