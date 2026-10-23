// Imported first by the speech worker: hides meSpeak's harmless
// "Not in browser, only able to do raw" startup notice.
const warn = console.warn.bind(console);
const log = console.log.bind(console);
const noisy = (a) => typeof a[0] === 'string' && /^meSpeak/.test(a[0]);
console.warn = (...a) => { if (!noisy(a)) warn(...a); };
console.log = (...a) => { if (!noisy(a)) log(...a); };
