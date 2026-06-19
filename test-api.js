const dns = require('dns'); dns.setServers(['8.8.8.8']); const https = require('https');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
const req = https.get({hostname:'cquwshpsfybvgqodbxsf.supabase.co',path:'/rest/v1/ads?select=id&limit=1',headers:{apikey:key,Authorization:'Bearer '+key}}, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>console.log('HTTP',res.statusCode, d.slice(0,300))); });
req.on('error',e=>console.log('Error:',e.message)); req.setTimeout(8000,()=>{console.log('TIMEOUT');req.destroy();});
