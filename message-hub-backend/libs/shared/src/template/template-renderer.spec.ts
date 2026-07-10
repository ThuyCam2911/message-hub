import { TemplateRenderer } from './template-renderer';

describe('TemplateRenderer', () => {
  const renderer = new TemplateRenderer();

  it('substitutes {{variable}} placeholders in a plain string', () => {
    const result = renderer.render('Hello {{name}}, your code is {{code}}', { name: 'Lan', code: '123456' });
    expect(result).toBe('Hello Lan, your code is 123456');
  });

  it('leaves unknown placeholders untouched instead of blanking them', () => {
    const result = renderer.render('Hello {{name}}, ref {{missing}}', { name: 'Lan' });
    expect(result).toBe('Hello Lan, ref {{missing}}');
  });

  it('tolerates whitespace inside the braces', () => {
    const result = renderer.render('Hi {{  name  }}', { name: 'Lan' });
    expect(result).toBe('Hi Lan');
  });

  it('renders nested object bodies field-by-field (e.g. email {subject, html})', () => {
    const result = renderer.render(
      { subject: 'Hello {{name}}', html: '<p>Code: {{code}}</p>', meta: { footer: 'From {{name}}' } },
      { name: 'Lan', code: '999' },
    );
    expect(result).toEqual({
      subject: 'Hello Lan',
      html: '<p>Code: 999</p>',
      meta: { footer: 'From Lan' },
    });
  });

  it('passes through non-string values in an object body unchanged', () => {
    const result = renderer.render({ subject: 'Hi {{name}}', priority: 1, tags: ['a', 'b'] }, { name: 'Lan' });
    expect(result).toEqual({ subject: 'Hi Lan', priority: 1, tags: ['a', 'b'] });
  });

  it('treats null/undefined variable values as missing (keeps the placeholder)', () => {
    const result = renderer.render('Hi {{name}}', { name: null });
    expect(result).toBe('Hi {{name}}');
  });
});
