const fs = require('fs');
let s = fs.readFileSync('assets/jamaica-map.svg', 'utf8');
s = s.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 380"', '<svg id="jamaica" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 380"');
fs.writeFileSync('assets/jamaica-map.svg', s);
console.log('Done. ID added.');