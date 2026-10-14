import { runInNewContext } from 'vm';
import { generateDeepLinkingPickerHtml } from '../../../src/lti/lti-deep-linking-picker.util';

interface FakeElement {
  id: string;
  innerHTML: string;
  textContent: string;
  value: string;
  disabled: boolean;
  onclick: (() => void) | null;
  listeners: Record<string, () => void>;
  inputs: FakeInput[];
  addEventListener: (type: string, fn: () => void) => void;
  querySelectorAll: (selector: string) => FakeInput[];
}

interface FakeInput {
  checked: boolean;
  parentElement: { getAttribute: () => string };
  listeners: Record<string, () => void>;
  addEventListener: (type: string, fn: () => void) => void;
}

const simulations = [
  {
    id: 'sim-1',
    title: 'Stroke <b>Evaluation</b>',
    maxScore: 100,
    estimatedDuration: '12 min',
    difficulty: 'Medium',
    learnerLevel: null,
    purpose: '<img src=x onerror=alert(1)>',
  },
  {
    id: 'sim-2',
    title: 'Clinic Check-In',
    maxScore: 100,
    estimatedDuration: null,
    difficulty: null,
    learnerLevel: null,
    purpose: null,
  },
  {
    id: 'sim-3',
    title: '<script>alert(1)</script>',
    maxScore: 100,
    estimatedDuration: null,
    difficulty: null,
    learnerLevel: null,
    purpose: null,
  },
];

function makeElement(id: string): FakeElement {
  const el: FakeElement = {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    onclick: null,
    listeners: {},
    inputs: [],
    addEventListener: (type, fn) => {
      el.listeners[type] = fn;
    },
    querySelectorAll: () => {
      el.inputs = [...el.innerHTML.matchAll(/data-id="([^"]+)"/g)].map(([, dataId]) => {
        const input: FakeInput = {
          checked: false,
          parentElement: { getAttribute: () => dataId },
          listeners: {},
          addEventListener: (type, fn) => {
            input.listeners[type] = fn;
          },
        };
        return input;
      });
      return el.inputs;
    },
  };
  return el;
}

async function loadPicker(): Promise<{
  el: (id: string) => FakeElement;
  submitted: () => unknown;
}> {
  const elements: Record<string, FakeElement> = { app: makeElement('app') };
  let submittedBody: unknown;
  const document = {
    getElementById: (id: string) => {
      if (id === 'app') return elements.app;
      if (!elements.app.innerHTML.includes(`id="${id}"`)) return null;
      elements[id] ??= makeElement(id);
      return elements[id];
    },
    open: () => undefined,
    write: () => undefined,
    close: () => undefined,
  };
  const fetch = (url: string, options: { body?: string }) => {
    const respond = (body: unknown) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve('<html></html>'),
      });
    if (url.includes('/exchange')) {
      return respond({
        courseTitle: 'Nursing <101>',
        deepLinkingSettings: { accept_multiple: true },
      });
    }
    if (url.includes('/submit')) {
      submittedBody = JSON.parse(options.body ?? '{}');
      return respond({});
    }
    return respond({ simulations, status: 'ready' });
  };

  const html = generateDeepLinkingPickerHtml('https://api.example.com/api', 'code-1');
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  runInNewContext(script, {
    document,
    fetch,
    Promise,
    Set,
    JSON,
    encodeURIComponent,
    Object,
    String,
  });
  await new Promise((resolve) => setImmediate(resolve));

  return { el: (id) => document.getElementById(id)!, submitted: () => submittedBody };
}

describe('generateDeepLinkingPickerHtml', () => {
  it('renders metadata escaped and hides empty fields', async () => {
    const { el } = await loadPicker();
    const list = el('list').innerHTML;

    expect(el('app').innerHTML).toContain('Nursing &lt;101&gt;');
    expect(list).toContain('Stroke &lt;b&gt;Evaluation&lt;/b&gt;');
    expect(list).toContain('<dt>Duration</dt><dd>12 min</dd>');
    expect(list).toContain('<dt>Difficulty</dt><dd>Medium</dd>');
    expect(list).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(list).not.toContain('<img');
    expect(list).not.toContain('Intended audience');
    expect(list.split('<dl').length - 1).toBe(1);
  });

  it('renders a script tag in a simulation title as literal text', async () => {
    const { el } = await loadPicker();
    const list = el('list').innerHTML;

    expect(list).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(list).not.toContain('<script');
  });

  it('filters rows by title as the user types', async () => {
    const { el } = await loadPicker();
    const search = el('search');

    search.value = 'clinic';
    search.listeners.input();
    expect(el('list').innerHTML).toContain('Clinic Check-In');
    expect(el('list').innerHTML).not.toContain('Stroke');

    search.value = 'zzz';
    search.listeners.input();
    expect(el('list').innerHTML).toContain('No simulations match your search.');
  });

  it('keeps the multi-select count and submits scoreMaximum 100', async () => {
    const { el, submitted } = await loadPicker();
    for (const id of ['sim-1', 'sim-2']) {
      const input = el('list').inputs.find((i) => i.parentElement.getAttribute() === id)!;
      input.checked = true;
      input.listeners.change();
    }

    expect(el('submitBtn').textContent).toBe('Add to Course (2)');
    expect(el('submitBtn').disabled).toBe(false);

    el('submitBtn').onclick!();
    expect(submitted()).toEqual({
      code: 'code-1',
      selections: [
        { simulationId: 'sim-1', title: 'Stroke <b>Evaluation</b>', scoreMaximum: 100 },
        { simulationId: 'sim-2', title: 'Clinic Check-In', scoreMaximum: 100 },
      ],
    });
  });
});
