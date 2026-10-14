// jsdom has no matchMedia (react-native-web and expo modules query it at load time).
window.matchMedia = window.matchMedia || ((query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }));
