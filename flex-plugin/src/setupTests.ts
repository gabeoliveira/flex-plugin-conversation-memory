import '@testing-library/jest-dom';

// jsdom doesn't implement these browser APIs that some Twilio Paste
// components (via reakit) touch during render. Stub them so tests can mount.
if (!window.matchMedia) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).ResizeObserver) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
