import { render, screen } from '@testing-library/angular';
import { fireEvent } from '@testing-library/dom';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('UC-WEB-10: renders the picture with referrerpolicy no-referrer', async () => {
    await render(Avatar, { inputs: { src: 'https://example.com/me.png', name: 'Ana Lopez' } });
    const img = document.querySelector('img');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img?.getAttribute('src')).toBe('https://example.com/me.png');
  });

  it('UC-WEB-10: shows initials when the picture fails to load', async () => {
    await render(Avatar, { inputs: { src: 'https://example.com/broken.png', name: 'Ana Lopez' } });
    fireEvent.error(document.querySelector('img')!);
    expect(await screen.findByText('AL')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('UC-WEB-10: shows initials when there is no avatarUrl', async () => {
    await render(Avatar, { inputs: { src: null, name: 'Ana' } });
    expect(screen.getByText('AN')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('UC-WEB-10: shows a placeholder when there is no name either', async () => {
    await render(Avatar, { inputs: { src: null, name: '  ' } });
    expect(screen.getByText('?')).toBeTruthy();
  });
});
