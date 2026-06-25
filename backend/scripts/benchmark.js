// Basic benchmark runner for critical endpoints
const targets = [
  { name: 'Search', targetMs: 200 },
  { name: 'Booking', targetMs: 400 },
  { name: 'Login', targetMs: 150 },
  { name: 'Hotel Details', targetMs: 150 },
  { name: 'Availability', targetMs: 250 }
];

console.log('--- API Performance Benchmarks ---');
console.log('The following targets have been established for ZivoHotels:');
targets.forEach(t => console.log(`- ${t.name}: < ${t.targetMs} ms`));
console.log('\nTo run a real benchmark, we recommend installing autocannon:');
console.log('npm install -g autocannon');
console.log('autocannon -c 100 -d 10 http://localhost:5001/api/v1/public/hotels');
