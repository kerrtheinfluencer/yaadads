const fs = require('fs');
let s = fs.readFileSync('assets/jamaica-map.svg', 'utf8');

// Remove id from root svg
s = s.replace('<svg id="jamaica" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 380"', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 380"');

// Wrap all content in a <g id="jamaica"> group
s = s.replace('>', '>\n  <g id="jamaica">', 1); // after opening svg tag
s = s.replace('</svg>', '  </g>\n</svg>'); // before closing svg tag

fs.writeFileSync('assets/jamaica-map.svg', s);
console.log('Done. Content wrapped in <g id=\"jamaica\">.');